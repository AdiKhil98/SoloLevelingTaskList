import { WEEKLY_LIMITS } from '../config/weekly'
import { err, ok, type Result } from '../types/result'
import type { EpochMs, WeekKey } from '../types/scalars'
import { weekEndOf } from '../time/weekKey'
import type { WeeklyBoardDefinition, WeeklyGoalBoard } from './types'
import { validateWeeklyBoardDefinition, type WeeklyBoardProblem } from './validation'

/**
 * Pure constructors of the only transitions an ACTIVE board allows. A finalized
 * board is frozen (MASTER_SPEC §12.7): every function here refuses it, as a
 * third line of defence behind the application use cases and the persistence
 * commands.
 */

export type WeeklyBoardEditRejection =
  | { readonly code: 'board_finalized' }
  | { readonly code: 'invalid'; readonly problems: readonly WeeklyBoardProblem[] }
  | { readonly code: 'goal_not_found'; readonly goalId: string }
  | { readonly code: 'goal_not_manual'; readonly goalId: string }
  | { readonly code: 'progress_invalid' }

/** The first version of a week's board: revision 1, active, nothing finalized. */
export function buildNewWeeklyBoard(
  weekKey: WeekKey,
  definition: WeeklyBoardDefinition,
  now: EpochMs,
): Result<WeeklyGoalBoard, WeeklyBoardEditRejection> {
  const problems = validateWeeklyBoardDefinition(definition)
  if (problems.length > 0) return err({ code: 'invalid', problems })
  return ok({
    weekKey,
    startDate: weekKey,
    endDate: weekEndOf(weekKey),
    focus: definition.focus,
    goals: definition.goals,
    rewardTiers: definition.rewardTiers,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    revision: 1,
    finalization: null,
  })
}

/** A new revision of an active board with a new definition. Identity and creation time never change. */
export function editWeeklyBoard(
  board: WeeklyGoalBoard,
  definition: WeeklyBoardDefinition,
  now: EpochMs,
): Result<WeeklyGoalBoard, WeeklyBoardEditRejection> {
  if (board.status !== 'active') return err({ code: 'board_finalized' })
  const problems = validateWeeklyBoardDefinition(definition)
  if (problems.length > 0) return err({ code: 'invalid', problems })
  return ok({
    ...board,
    focus: definition.focus,
    goals: definition.goals,
    rewardTiers: definition.rewardTiers,
    updatedAt: now,
    revision: board.revision + 1,
  })
}

/**
 * Sets the player's own count on a manually tracked goal. Setting the value a
 * goal already has returns the board untouched (`changed: false`): repeating
 * an update never bumps the revision.
 */
export function withManualProgress(
  board: WeeklyGoalBoard,
  goalId: string,
  progress: number,
  now: EpochMs,
): Result<{ readonly board: WeeklyGoalBoard; readonly changed: boolean }, WeeklyBoardEditRejection> {
  if (board.status !== 'active') return err({ code: 'board_finalized' })
  const goal = board.goals.find((candidate) => candidate.id === goalId)
  if (goal === undefined) return err({ code: 'goal_not_found', goalId })
  if (goal.tracking.mode !== 'manual') return err({ code: 'goal_not_manual', goalId })
  if (!Number.isSafeInteger(progress) || progress < 0 || progress > WEEKLY_LIMITS.progressMax) return err({ code: 'progress_invalid' })
  if (goal.manualProgress === progress) return ok({ board, changed: false })
  return ok({
    board: {
      ...board,
      goals: board.goals.map((candidate) => (candidate.id === goalId ? { ...candidate, manualProgress: progress } : candidate)),
      updatedAt: now,
      revision: board.revision + 1,
    },
    changed: true,
  })
}
