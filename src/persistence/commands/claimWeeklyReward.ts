import type { EpochMs, WeekKey, WeeklyRewardClaim } from '@/domain'
import { STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { PersistenceError } from '../errors'
import { parseWeeklyBoard, parseWeeklyRewardClaim } from '../records/weeklyBoard'
import { parseForWrite, parseStored } from '../repositories/stored'

export interface ClaimWeeklyRewardInput {
  readonly weekKey: WeekKey
  /** The real instant of the claim. Supplied by the caller; never read here. */
  readonly claimedAt: EpochMs
}

export type ClaimWeeklyRewardRejection =
  | { readonly code: 'board_not_found' }
  /** The tier is only fixed at finalization, so an active board has nothing to claim yet. */
  | { readonly code: 'not_finalized' }
  /** The week's score earned no reward tier. */
  | { readonly code: 'no_reward' }
  /** The earned tier has no reward text, so there is nothing to claim. */
  | { readonly code: 'reward_text_blank' }

export type ClaimWeeklyRewardResult =
  | { readonly status: 'claimed'; readonly claim: WeeklyRewardClaim }
  /** A repeat: the stored claim, nothing written. */
  | { readonly status: 'already_claimed'; readonly claim: WeeklyRewardClaim }
  | { readonly status: 'rejected'; readonly reason: ClaimWeeklyRewardRejection }

const CLAIM_STORES = [STORE.weeklyBoards, STORE.weeklyRewardClaims] as const

/**
 * Claims the real-life reward of a FINALIZED week, atomically and at most once
 * (MASTER_SPEC §12.6). It reads the board inside the transaction, snapshots the
 * tier text the board froze at finalization, and inserts one claim row keyed by
 * the week. It writes no EXP and never touches the board or the ledger.
 */
export async function claimWeeklyRewardAtomically(
  database: PersistenceDatabase,
  input: ClaimWeeklyRewardInput,
): Promise<ClaimWeeklyRewardResult> {
  try {
    return await runTransaction(database, CLAIM_STORES, 'readwrite', (transaction) => attemptClaim(transaction, input))
  } catch (error) {
    // A racing tab claimed it between our read and our add.
    if (error instanceof PersistenceError && error.code === 'constraint_violation') {
      const stored = await runTransaction(database, [STORE.weeklyRewardClaims], 'readonly', (transaction) =>
        requestToPromise(transaction.objectStore(STORE.weeklyRewardClaims).get(input.weekKey)),
      )
      if (stored !== undefined) {
        return { status: 'already_claimed', claim: parseStored(parseWeeklyRewardClaim, stored, `weekly reward claim "${input.weekKey}"`) }
      }
    }
    throw error
  }
}

async function attemptClaim(transaction: IDBTransaction, input: ClaimWeeklyRewardInput): Promise<ClaimWeeklyRewardResult> {
  const { weekKey, claimedAt } = input
  const rawBoard = await requestToPromise(transaction.objectStore(STORE.weeklyBoards).get(weekKey))
  if (rawBoard === undefined) return { status: 'rejected', reason: { code: 'board_not_found' } }
  const board = parseStored(parseWeeklyBoard, rawBoard, `weekly board "${weekKey}"`)
  if (board.status !== 'finalized' || board.finalization === null) return { status: 'rejected', reason: { code: 'not_finalized' } }

  const claims = transaction.objectStore(STORE.weeklyRewardClaims)
  const rawClaim = await requestToPromise(claims.get(weekKey))
  if (rawClaim !== undefined) {
    return { status: 'already_claimed', claim: parseStored(parseWeeklyRewardClaim, rawClaim, `weekly reward claim "${weekKey}"`) }
  }

  const { rewardTier } = board.finalization
  if (rewardTier === null) return { status: 'rejected', reason: { code: 'no_reward' } }
  if (rewardTier.text.trim() === '') return { status: 'rejected', reason: { code: 'reward_text_blank' } }

  const claim = parseForWrite(
    parseWeeklyRewardClaim,
    { weekKey, tierMinScore: rewardTier.minScore, rewardTextSnapshot: rewardTier.text, claimedAt },
    'weekly reward claim',
  )
  await requestToPromise(claims.add(claim))
  return { status: 'claimed', claim }
}
