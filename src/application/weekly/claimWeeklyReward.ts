import type { WeekKey } from '@/domain'
import { claimWeeklyRewardAtomically, getWeeklyBoard } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { requireSynchronizedDay } from '../lifecycle/synchronization'

export type ClaimWeeklyRewardRejectionReason =
  | 'board_not_found'
  /** The tier is only fixed at finalization, so an active board has nothing to claim. */
  | 'not_finalized'
  /** The week's score earned no reward tier. */
  | 'no_reward'
  /** The earned tier has no reward text, so there is nothing to claim. */
  | 'reward_text_blank'

export type ClaimWeeklyRewardUseCaseResult =
  | { readonly status: 'claimed' }
  /** A repeat: it was already claimed; nothing changed and no EXP was involved. */
  | { readonly status: 'already_claimed' }
  | { readonly status: 'rejected'; readonly reason: ClaimWeeklyRewardRejectionReason }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Claims the real-life reward of a finalized week. It records that the reward
 * was claimed (and when) and has NO EXP effect: it never touches the ledger.
 * Claiming twice returns `already_claimed`.
 */
export async function claimWeeklyReward(
  context: ApplicationContext,
  weekKey: WeekKey,
): Promise<ClaimWeeklyRewardUseCaseResult> {
  try {
    const reading = readClock(context.clock)
    await requireSynchronizedDay(context, reading)
    const board = await getWeeklyBoard(context.database, weekKey)
    if (board === null) return { status: 'rejected', reason: 'board_not_found' }
    if (board.status !== 'finalized') return { status: 'rejected', reason: 'not_finalized' }

    const result = await claimWeeklyRewardAtomically(context.database, { weekKey, claimedAt: reading.epochMs })
    if (result.status === 'rejected') return { status: 'rejected', reason: result.reason.code }
    return { status: result.status }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
}
