import {
  expRewardForDifficulty,
  sortTemplatesByOrder,
  type Category,
  type DateKey,
  type Difficulty,
  type QuestRecurrence,
  type QuestTemplate,
} from '@/domain'
import { listTemplates } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { isDatePassed } from './questTemplate'

/** One row of the quest-management list. Display data only; the editable truth is the template. */
export interface QuestListItem {
  readonly templateId: string
  readonly title: string
  readonly difficulty: Difficulty
  readonly category: Category
  /** Derived from difficulty by the domain; there is no stored or editable EXP. */
  readonly expReward: number
  readonly recurrence: QuestRecurrence
  readonly status: QuestTemplate['status']
  /** A One-Time quest whose date has passed: it will never appear again. */
  readonly datePassed: boolean
  /** Archived and able to appear again (an archived One-Time quest whose date has passed cannot). */
  readonly canRestore: boolean
}

export type ListQuestTemplatesResult =
  | {
      readonly status: 'ok'
      /** Active quests in the player's manual order (the order Home uses). */
      readonly active: readonly QuestListItem[]
      readonly archived: readonly QuestListItem[]
    }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

function toItem(template: QuestTemplate, today: DateKey): QuestListItem {
  const datePassed = isDatePassed(template, today)
  return {
    templateId: template.id,
    title: template.title,
    difficulty: template.difficulty,
    category: template.category,
    expReward: expRewardForDifficulty(template.difficulty),
    recurrence: template.recurrence,
    status: template.status,
    datePassed,
    canRestore: template.status === 'archived' && !datePassed,
  }
}

/** Lists every quest template, split into active and archived, in the player's manual order (the order Home uses). */
export async function listQuestTemplates(context: ApplicationContext): Promise<ListQuestTemplatesResult> {
  try {
    const { dateKey: today } = readClock(context.clock)
    const templates = sortTemplatesByOrder(await listTemplates(context.database))
    return {
      status: 'ok',
      active: templates.filter((template) => template.status === 'active').map((template) => toItem(template, today)),
      archived: templates.filter((template) => template.status === 'archived').map((template) => toItem(template, today)),
    }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
}
