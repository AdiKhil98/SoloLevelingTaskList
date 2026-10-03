import {
  WEEKLY_REWARD_TIER_SCORES,
  err,
  ok,
  validateWeeklyBoardDefinition,
  type WeeklyBoardDefinition,
  type Result,
  type WeeklyBoardProblem,
  type WeeklyGoal,
  type WeeklyGoalTrackingMode,
  type WeeklyRewardTierScore,
} from '@/domain'

/**
 * The raw values of the Weekly Goal Crusher form, exactly as the player typed
 * them (numbers as text), and the parser that turns them into a validated board
 * definition. The parser returns error CODES; wording belongs to the UI.
 */

export interface WeeklyGoalFormValues {
  /** Stable key of this row while editing (the UI's React key and the error lookup). */
  readonly key: string
  /** The stored goal this row edits, or null for a goal added in this form (it gets a fresh id on save). */
  readonly goalId: string | null
  readonly title: string
  readonly points: number
  /** Digits only; checked on save. */
  readonly target: string
  readonly unit: string
  readonly trackingMode: WeeklyGoalTrackingMode
  /** The linked quest's template id; ignored for a manual goal. */
  readonly templateId: string
  readonly notes: string
}

export interface WeeklyBoardFormValues {
  /** The revision this form was loaded from, or null when creating the week's board. */
  readonly revision: number | null
  readonly focus: string
  readonly goals: readonly WeeklyGoalFormValues[]
  readonly rewards: Readonly<Record<WeeklyRewardTierScore, string>>
}

export type WeeklyGoalField = 'title' | 'points' | 'target' | 'unit' | 'notes' | 'link'

export type WeeklyGoalErrorCode =
  | 'title_required'
  | 'title_too_long'
  | 'points_invalid'
  | 'target_invalid'
  | 'unit_too_long'
  | 'notes_too_long'
  | 'link_required'
  /** The chosen quest no longer exists. */
  | 'link_unknown'

export type WeeklyBoardErrorCode = 'no_goals' | 'points_total_invalid' | 'focus_too_long' | 'reward_tiers_invalid'

export interface WeeklyBoardFormErrors {
  /** Errors about the board as a whole. */
  readonly board: readonly WeeklyBoardErrorCode[]
  /** The points the goals add up to, present with `points_total_invalid`. */
  readonly total?: number
  /** Per goal row (by `key`). */
  readonly goals: Readonly<Record<string, Partial<Record<WeeklyGoalField, WeeklyGoalErrorCode>>>>
  readonly rewards: Readonly<Partial<Record<WeeklyRewardTierScore, 'reward_text_too_long'>>>
}

export function emptyRewards(): Record<WeeklyRewardTierScore, string> {
  return { 6: '', 7: '', 8: '', 9: '', 10: '' }
}

export interface ParseWeeklyBoardFormContext {
  /** The stored board's goals by id (their manual progress carries over an edit). */
  readonly existingGoals: ReadonlyMap<string, WeeklyGoal>
  /** A fresh id for a goal added in the form; called once per new row, in order. */
  readonly newGoalId: () => string
}

const DIGITS = /^\d+$/

function emptyToNull(text: string): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Parses the form into a board definition. Every field is checked and ALL
 * problems are reported together. The domain's `validateWeeklyBoardDefinition`
 * has the final word (so the exactly-10 rule exists once, in the domain); the
 * checks here only turn text into numbers and map its problems back to rows.
 */
export function parseWeeklyBoardForm(
  values: WeeklyBoardFormValues,
  context: ParseWeeklyBoardFormContext,
): Result<WeeklyBoardDefinition, WeeklyBoardFormErrors> {
  const rowErrors: Record<string, Partial<Record<WeeklyGoalField, WeeklyGoalErrorCode>>> = {}
  const markRow = (key: string, field: WeeklyGoalField, code: WeeklyGoalErrorCode) => {
    rowErrors[key] = { ...rowErrors[key], [field]: code }
  }

  const keyByGoalId = new Map<string, string>()
  const goals: WeeklyGoal[] = []
  for (const row of values.goals) {
    const id = row.goalId ?? context.newGoalId()
    keyByGoalId.set(id, row.key)
    const target = DIGITS.test(row.target.trim()) ? Number(row.target.trim()) : Number.NaN
    if (Number.isNaN(target)) markRow(row.key, 'target', 'target_invalid')

    const existing = row.goalId === null ? undefined : context.existingGoals.get(row.goalId)
    goals.push({
      id,
      title: row.title.trim(),
      maxPoints: row.points,
      target: Number.isNaN(target) ? 0 : target,
      unit: emptyToNull(row.unit),
      tracking:
        row.trackingMode === 'linked_quest'
          ? { mode: 'linked_quest', templateId: row.templateId.trim() }
          : { mode: 'manual' },
      manualProgress: existing === undefined ? 0 : existing.manualProgress,
      notes: emptyToNull(row.notes),
    })
  }

  const tierErrors: Partial<Record<WeeklyRewardTierScore, 'reward_text_too_long'>> = {}
  const definition: WeeklyBoardDefinition = {
    focus: emptyToNull(values.focus),
    goals,
    rewardTiers: WEEKLY_REWARD_TIER_SCORES.map((minScore) => ({ minScore, text: (values.rewards[minScore] ?? '').trim() })),
  }

  const boardErrors: WeeklyBoardErrorCode[] = []
  let total: number | undefined
  for (const problem of validateWeeklyBoardDefinition(definition)) {
    const row = 'goalId' in problem ? keyByGoalId.get(problem.goalId) : undefined
    switch (problem.code) {
      case 'focus_too_long':
      case 'no_goals':
      case 'reward_tiers_invalid':
        boardErrors.push(problem.code)
        break
      case 'points_total_invalid':
        boardErrors.push('points_total_invalid')
        total = problem.total
        break
      case 'reward_text_too_long':
        tierErrors[problem.minScore as WeeklyRewardTierScore] = 'reward_text_too_long'
        break
      case 'goal_title_required':
        if (row !== undefined) markRow(row, 'title', 'title_required')
        break
      case 'goal_title_too_long':
        if (row !== undefined) markRow(row, 'title', 'title_too_long')
        break
      case 'goal_points_invalid':
        if (row !== undefined) markRow(row, 'points', 'points_invalid')
        break
      case 'goal_target_invalid':
        // A text that is not a number was already marked above; this covers 0 and values over the limit.
        if (row !== undefined && rowErrors[row]?.target === undefined) markRow(row, 'target', 'target_invalid')
        break
      case 'goal_unit_too_long':
        if (row !== undefined) markRow(row, 'unit', 'unit_too_long')
        break
      case 'goal_notes_too_long':
        if (row !== undefined) markRow(row, 'notes', 'notes_too_long')
        break
      case 'goal_link_missing':
        if (row !== undefined) markRow(row, 'link', 'link_required')
        break
      case 'goal_progress_invalid':
      case 'goal_id_invalid':
      case 'duplicate_goal_id':
        // Not editable in the form: carried-over progress and generated ids. A real occurrence is a bug, never a field error.
        throw new Error(`Weekly board form produced an internal inconsistency: ${describe(problem)}`)
    }
  }

  const failed =
    boardErrors.length > 0 || Object.keys(rowErrors).length > 0 || Object.keys(tierErrors).length > 0
  if (failed) {
    return err({
      board: boardErrors,
      ...(total === undefined ? {} : { total }),
      goals: rowErrors,
      rewards: tierErrors,
    })
  }
  return ok(definition)
}

function describe(problem: WeeklyBoardProblem): string {
  return JSON.stringify(problem)
}
