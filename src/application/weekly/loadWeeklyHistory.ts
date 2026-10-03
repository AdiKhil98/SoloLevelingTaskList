import { listWeeklyBoards, listWeeklyRewardClaims } from '@/persistence'
import type { WeeklyRewardClaim } from '@/domain'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { buildFinalizedWeekView, type FinalizedWeekView } from './views'

export type LoadWeeklyHistoryResult =
  /** Finalized weeks, newest first. Weeks without a board are simply absent. */
  | { readonly status: 'ok'; readonly weeks: readonly FinalizedWeekView[] }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * The basic Weekly History: every finalized board, newest first. Built only
 * from each board's frozen snapshot and its claim, never from templates or
 * completions, so a finished week reads the same forever.
 */
export async function loadWeeklyHistory(context: ApplicationContext): Promise<LoadWeeklyHistoryResult> {
  try {
    const [boards, claims] = await Promise.all([listWeeklyBoards(context.database), listWeeklyRewardClaims(context.database)])
    const claimByWeek = new Map<string, WeeklyRewardClaim>(claims.map((claim) => [claim.weekKey, claim]))
    const weeks: FinalizedWeekView[] = []
    for (const board of [...boards].reverse()) {
      const week = buildFinalizedWeekView(board, claimByWeek.get(board.weekKey) ?? null)
      if (week !== null) weeks.push(week)
    }
    return { status: 'ok', weeks }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
}
