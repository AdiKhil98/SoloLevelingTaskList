import {
  WEEKLY_BOARD_TOTAL_POINTS,
  WEEKLY_LIMITS,
  WEEKLY_REWARD_TIER_SCORES,
} from '../config/weekly'
import type { WeeklyBoardDefinition } from './types'

/** Why a board definition cannot be saved. Codes only; wording belongs to the UI. */
export type WeeklyBoardProblem =
  | { readonly code: 'focus_too_long' }
  /** A board needs at least one goal. */
  | { readonly code: 'no_goals' }
  /** The goal weights do not add up to exactly 10 points. */
  | { readonly code: 'points_total_invalid'; readonly total: number }
  | { readonly code: 'duplicate_goal_id'; readonly goalId: string }
  | { readonly code: 'goal_id_invalid'; readonly index: number }
  | { readonly code: 'goal_title_required'; readonly goalId: string }
  | { readonly code: 'goal_title_too_long'; readonly goalId: string }
  | { readonly code: 'goal_points_invalid'; readonly goalId: string }
  | { readonly code: 'goal_target_invalid'; readonly goalId: string }
  | { readonly code: 'goal_unit_too_long'; readonly goalId: string }
  | { readonly code: 'goal_notes_too_long'; readonly goalId: string }
  | { readonly code: 'goal_progress_invalid'; readonly goalId: string }
  /** A linked goal names no quest. */
  | { readonly code: 'goal_link_missing'; readonly goalId: string }
  /** The reward tiers are not exactly one per tier score, ascending. */
  | { readonly code: 'reward_tiers_invalid' }
  | { readonly code: 'reward_text_too_long'; readonly minScore: number }

function isWholeNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

/**
 * Checks a board's definition against every approved rule (MASTER_SPEC §12.2,
 * DATA_MODEL §10) and reports ALL problems, so a form can show them together.
 * An empty list means the board may be saved.
 *
 * The exactly-10 rule is checked on the points of the goals that have a valid
 * weight; a goal with an invalid weight reports that instead of skewing the total.
 */
export function validateWeeklyBoardDefinition(definition: WeeklyBoardDefinition): readonly WeeklyBoardProblem[] {
  const problems: WeeklyBoardProblem[] = []
  const { focus, goals, rewardTiers } = definition

  if (focus !== null && focus.length > WEEKLY_LIMITS.focusMaxLength) problems.push({ code: 'focus_too_long' })
  if (goals.length === 0) problems.push({ code: 'no_goals' })

  const seen = new Set<string>()
  let total = 0
  let everyWeightValid = goals.length > 0
  goals.forEach((goal, index) => {
    if (typeof goal.id !== 'string' || goal.id.trim() === '') {
      problems.push({ code: 'goal_id_invalid', index })
    } else if (seen.has(goal.id)) {
      problems.push({ code: 'duplicate_goal_id', goalId: goal.id })
    } else {
      seen.add(goal.id)
    }
    const goalId = goal.id

    if (goal.title.trim() === '') problems.push({ code: 'goal_title_required', goalId })
    else if (goal.title.length > WEEKLY_LIMITS.goalTitleMaxLength) problems.push({ code: 'goal_title_too_long', goalId })

    if (isWholeNumber(goal.maxPoints, 1, WEEKLY_BOARD_TOTAL_POINTS)) {
      total += goal.maxPoints
    } else {
      everyWeightValid = false
      problems.push({ code: 'goal_points_invalid', goalId })
    }
    if (!isWholeNumber(goal.target, 1, WEEKLY_LIMITS.targetMax)) problems.push({ code: 'goal_target_invalid', goalId })
    if (goal.unit !== null && goal.unit.length > WEEKLY_LIMITS.unitMaxLength) problems.push({ code: 'goal_unit_too_long', goalId })
    if (goal.notes !== null && goal.notes.length > WEEKLY_LIMITS.notesMaxLength) problems.push({ code: 'goal_notes_too_long', goalId })
    if (!isWholeNumber(goal.manualProgress, 0, WEEKLY_LIMITS.progressMax)) problems.push({ code: 'goal_progress_invalid', goalId })
    if (goal.tracking.mode === 'linked_quest' && goal.tracking.templateId.trim() === '') {
      problems.push({ code: 'goal_link_missing', goalId })
    }
  })
  if (everyWeightValid && total !== WEEKLY_BOARD_TOTAL_POINTS) problems.push({ code: 'points_total_invalid', total })

  const tiersInOrder =
    rewardTiers.length === WEEKLY_REWARD_TIER_SCORES.length &&
    rewardTiers.every((tier, index) => tier.minScore === WEEKLY_REWARD_TIER_SCORES[index])
  if (!tiersInOrder) {
    problems.push({ code: 'reward_tiers_invalid' })
  } else {
    for (const tier of rewardTiers) {
      if (typeof tier.text !== 'string' || tier.text.length > WEEKLY_LIMITS.rewardTextMaxLength) {
        problems.push({ code: 'reward_text_too_long', minScore: tier.minScore })
      }
    }
  }
  return problems
}
