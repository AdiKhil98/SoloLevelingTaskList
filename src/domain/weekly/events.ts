import type { DomainEvent } from '../events/types'
import type { WeekKey } from '../types/scalars'
import type { WeeklyEvaluation } from './scoring'

/**
 * `WeeklyGoalCompleted` for every goal that was not achieved in `before` and is
 * in `after` (one event each, board order). Facts about something that already
 * happened; nothing here changes state.
 */
export function buildWeeklyGoalCompletedEvents(
  weekKey: WeekKey,
  before: WeeklyEvaluation,
  after: WeeklyEvaluation,
): readonly DomainEvent[] {
  const wasComplete = new Set(before.goalResults.filter((result) => result.completed).map((result) => result.goalId))
  return after.goalResults
    .filter((result) => result.completed && !wasComplete.has(result.goalId))
    .map(
      (result): DomainEvent => ({
        type: 'WeeklyGoalCompleted',
        weekKey,
        goalId: result.goalId,
        earnedPoints: result.earnedPoints,
        scoreNow: after.score,
      }),
    )
}
