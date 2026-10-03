import { weekEndOf, weekKeyOf, type ClockReading, type DateKey, type QuestTemplate, type WeekKey } from '@/domain'
import {
  countCompletionsByTemplate,
  getWeeklyRewardClaim,
  listTemplates,
  listWeeklyBoards,
} from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { assessDay, type ClockStatus } from '../lifecycle/synchronization'
import {
  buildActiveBoardView,
  buildFinalizedWeekView,
  type ActiveWeeklyBoardView,
  type FinalizedWeekView,
} from './views'

/** The current week's board, in whichever state it is. */
export type WeeklyCurrent =
  /** No board yet: the player has not set this week's Goal Crushers. Nothing is invented. */
  | { readonly kind: 'none' }
  | { readonly kind: 'active'; readonly board: ActiveWeeklyBoardView }
  /** Only reachable when the device clock was set back into a finished week; shown frozen and read-only. */
  | { readonly kind: 'finalized'; readonly week: FinalizedWeekView }

export interface WeeklyScreen {
  /** `behind` pauses every change, exactly as on Home. */
  readonly clock: ClockStatus
  readonly weekKey: WeekKey
  readonly startDate: DateKey
  readonly endDate: DateKey
  readonly current: WeeklyCurrent
  /** The most recent finalized board other than the current one: the last result and its claim. */
  readonly latestFinalized: FinalizedWeekView | null
}

export type LoadWeeklyScreenResult =
  | { readonly status: 'ok'; readonly screen: WeeklyScreen }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Reads everything the Weekly screen shows, from stored truth (never writes).
 * An active board's score and completions are DERIVED here from its goals and
 * the completions counted this week; a finalized board is shown only from its
 * own frozen snapshot.
 */
export async function loadWeeklyScreen(
  context: ApplicationContext,
  reading: ClockReading = readClock(context.clock),
): Promise<LoadWeeklyScreenResult> {
  try {
    const { clock } = await assessDay(context, reading)
    const weekKey = weekKeyOf(reading.dateKey)
    const boards = await listWeeklyBoards(context.database)
    const board = boards.find((candidate) => candidate.weekKey === weekKey) ?? null

    let current: WeeklyCurrent = { kind: 'none' }
    if (board !== null && board.status === 'active') {
      const [counts, templates] = await Promise.all([
        countCompletionsByTemplate(context.database, board.startDate, board.endDate),
        listTemplates(context.database),
      ])
      const byId = new Map<string, QuestTemplate>(templates.map((template) => [template.id, template]))
      current = { kind: 'active', board: buildActiveBoardView(board, counts, byId) }
    } else if (board !== null) {
      const week = buildFinalizedWeekView(board, await getWeeklyRewardClaim(context.database, board.weekKey))
      if (week !== null) current = { kind: 'finalized', week }
    }

    const latest = [...boards].reverse().find((candidate) => candidate.status === 'finalized' && candidate.weekKey !== weekKey)
    const latestFinalized =
      latest === undefined ? null : buildFinalizedWeekView(latest, await getWeeklyRewardClaim(context.database, latest.weekKey))

    return {
      status: 'ok',
      screen: { clock, weekKey, startDate: weekKey, endDate: weekEndOf(weekKey), current, latestFinalized },
    }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
}
