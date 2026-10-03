import { evaluateWeeklyGoals, weekKeyOf, type ClockReading } from '@/domain'
import { countCompletionsByTemplate, getWeeklyBoard } from '@/persistence'
import type { ApplicationContext } from '../context'

/**
 * What the small Home card shows about the current week. `none` means the
 * player has not set this week's Goal Crushers (the card then invites them to).
 */
export type WeeklyHomeSummary =
  | { readonly state: 'none' }
  | {
      readonly state: 'board'
      readonly score: number
      readonly goalsCompleted: number
      readonly goalCount: number
    }

/** Reads the current week's board and derives the card's numbers from it (never writes). */
export async function loadWeeklyHomeSummary(
  context: ApplicationContext,
  reading: ClockReading,
): Promise<WeeklyHomeSummary> {
  const weekKey = weekKeyOf(reading.dateKey)
  const board = await getWeeklyBoard(context.database, weekKey)
  if (board === null) return { state: 'none' }
  if (board.finalization !== null) {
    // Only reachable if the device clock was set back into a finished week: show its frozen result.
    const { goalResults, score } = board.finalization
    return {
      state: 'board',
      score,
      goalsCompleted: goalResults.filter((result) => result.completed).length,
      goalCount: goalResults.length,
    }
  }
  const counts = await countCompletionsByTemplate(context.database, board.startDate, board.endDate)
  const { score, goalsCompleted } = evaluateWeeklyGoals(board.goals, counts)
  return { state: 'board', score, goalsCompleted, goalCount: board.goals.length }
}
