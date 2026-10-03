import { WEEKLY_REWARD_TIER_SCORES, weekEndOf, weekKeyOf, type DateKey, type WeekKey, type WeeklyGoal } from '@/domain'
import { listTemplates, listWeeklyBoards } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { compareQuestOrder } from '../today/questOrder'
import { emptyRewards, type WeeklyBoardFormValues, type WeeklyGoalFormValues } from './weeklyBoardForm'

/** A quest a weekly goal can be linked to. */
export interface LinkableQuest {
  readonly templateId: string
  readonly title: string
  /** Archived quests keep their history; one is offered only while a goal is already linked to it. */
  readonly archived: boolean
}

export type LoadWeeklyEditorResult =
  | {
      readonly status: 'ok'
      /** `create` for a week without a board, `edit` for the active board. */
      readonly mode: 'create' | 'edit'
      readonly weekKey: WeekKey
      readonly startDate: DateKey
      readonly endDate: DateKey
      readonly values: WeeklyBoardFormValues
      /** Active quests first (in Home order), then archived ones. */
      readonly quests: readonly LinkableQuest[]
    }
  /** The current week's board is already final (device clock set back): it cannot be edited. */
  | { readonly status: 'finalized' }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/** A row for a goal the player is about to add: nothing chosen yet, one point. */
export function blankGoalFormValues(key: string): WeeklyGoalFormValues {
  return { key, goalId: null, title: '', points: 1, target: '', unit: '', trackingMode: 'manual', templateId: '', notes: '' }
}

function goalRow(goal: WeeklyGoal): WeeklyGoalFormValues {
  return {
    key: goal.id,
    goalId: goal.id,
    title: goal.title,
    points: goal.maxPoints,
    target: String(goal.target),
    unit: goal.unit ?? '',
    trackingMode: goal.tracking.mode,
    templateId: goal.tracking.mode === 'linked_quest' ? goal.tracking.templateId : '',
    notes: goal.notes ?? '',
  }
}

const orderKey = (template: { seedKey: string | null; createdAt: number; id: string }) => ({
  seedKey: template.seedKey,
  templateCreatedAt: template.createdAt,
  templateId: template.id,
})

/**
 * The initial values of the Weekly Goal Crusher form for the CURRENT week.
 *
 * With no board yet it starts with one blank goal row (no goals are invented)
 * and pre-fills only the five reward texts from the most recent board, so the
 * player does not retype them every week; they stay editable. With a board it
 * loads that board, remembering its revision so a stale save is detected.
 */
export async function loadWeeklyEditor(context: ApplicationContext): Promise<LoadWeeklyEditorResult> {
  try {
    const reading = readClock(context.clock)
    const weekKey = weekKeyOf(reading.dateKey)
    const [boards, templates] = await Promise.all([listWeeklyBoards(context.database), listTemplates(context.database)])
    const board = boards.find((candidate) => candidate.weekKey === weekKey) ?? null
    if (board !== null && board.status !== 'active') return { status: 'finalized' }

    const ordered = [...templates].sort((a, b) => compareQuestOrder(orderKey(a), orderKey(b)))
    const quests: LinkableQuest[] = [
      ...ordered.filter((template) => template.status === 'active'),
      ...ordered.filter((template) => template.status === 'archived'),
    ].map((template) => ({ templateId: template.id, title: template.title, archived: template.status === 'archived' }))

    let values: WeeklyBoardFormValues
    if (board === null) {
      const rewards = emptyRewards()
      const latest = boards[boards.length - 1]
      if (latest !== undefined) for (const tier of latest.rewardTiers) rewards[tier.minScore] = tier.text
      values = { revision: null, focus: '', goals: [blankGoalFormValues('new-1')], rewards }
    } else {
      const rewards = emptyRewards()
      for (const minScore of WEEKLY_REWARD_TIER_SCORES) {
        rewards[minScore] = board.rewardTiers.find((tier) => tier.minScore === minScore)?.text ?? ''
      }
      values = { revision: board.revision, focus: board.focus ?? '', goals: board.goals.map(goalRow), rewards }
    }
    return {
      status: 'ok',
      mode: board === null ? 'create' : 'edit',
      weekKey,
      startDate: weekKey,
      endDate: weekEndOf(weekKey),
      values,
      quests,
    }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
}
