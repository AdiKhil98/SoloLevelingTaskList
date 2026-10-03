import {
  buildWeeklyGoalCompletedEvents,
  evaluateWeeklyGoals,
  weekKeyOf,
  type DomainEvent,
} from '@/domain'
import { countCompletionsByTemplate, getWeeklyBoard, setWeeklyGoalProgressAtomically } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { requireSynchronizedDay } from '../lifecycle/synchronization'
import { refreshHome, type Refreshed } from '../quests/refresh'

export type SetWeeklyGoalProgressRejectionReason =
  | 'board_not_found'
  /** The board is final; finalized boards are never changed. */
  | 'board_finalized'
  /** The week is over (the screen was left open past Sunday midnight): reload. */
  | 'week_not_current'
  | 'goal_not_found'
  /** A linked goal's progress comes from quest completions; it has no number to set. */
  | 'goal_not_manual'
  | 'progress_invalid'

export type SetWeeklyGoalProgressUseCaseResult =
  /** Saved. `events` carries `WeeklyGoalCompleted` when this update made the goal reach its target. */
  | ({ readonly status: 'updated'; readonly events: readonly DomainEvent[] } & Refreshed)
  /** The goal already had this value: nothing was written. */
  | { readonly status: 'unchanged' }
  | { readonly status: 'rejected'; readonly reason: SetWeeklyGoalProgressRejectionReason }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Sets the player's own count on one manually tracked goal of the current
 * week's board. The value is absolute (not an increment), so a double tap or a
 * retry cannot add twice. The goal's points are never "awarded" here: they are
 * derived from progress, and EXP is paid only once, at finalization.
 */
export async function setWeeklyGoalProgress(
  context: ApplicationContext,
  goalId: string,
  progress: number,
): Promise<SetWeeklyGoalProgressUseCaseResult> {
  let result
  try {
    const reading = readClock(context.clock)
    await requireSynchronizedDay(context, reading)
    const weekKey = weekKeyOf(reading.dateKey)

    const existing = await getWeeklyBoard(context.database, weekKey)
    if (existing === null) return { status: 'rejected', reason: 'board_not_found' }
    if (existing.status !== 'active') return { status: 'rejected', reason: 'board_finalized' }

    result = await setWeeklyGoalProgressAtomically(context.database, {
      weekKey,
      goalId,
      progress,
      today: reading.dateKey,
      now: reading.epochMs,
    })
    if (result.status === 'updated') {
      const counts = await countCompletionsByTemplate(context.database, result.board.startDate, result.board.endDate)
      const events = buildWeeklyGoalCompletedEvents(
        weekKey,
        evaluateWeeklyGoals(result.previous.goals, counts),
        evaluateWeeklyGoals(result.board.goals, counts),
      )
      return { status: 'updated', events, ...(await refreshHome(context)) }
    }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }

  if (result.status === 'unchanged') return { status: 'unchanged' }
  const { reason } = result
  switch (reason.code) {
    case 'board_not_found':
    case 'board_finalized':
    case 'goal_not_found':
    case 'goal_not_manual':
    case 'progress_invalid':
      return { status: 'rejected', reason: reason.code }
    case 'week_over':
    case 'week_not_started':
      return { status: 'rejected', reason: 'week_not_current' }
  }
}
