import type { EpochMs } from '@/domain'
import { PLAYER_PROFILE_ID, STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { parsePlayerProfile, type PlayerProfileRecord } from '../records/playerProfile'
import { parseForWrite } from '../repositories/stored'

export interface CompleteAwakeningInput {
  /** The chosen name, already validated and normalized by the domain (`parsePlayerName`); `null` for none. */
  readonly name: string | null
  /** The real instant of the acceptance. Supplied by the caller; never read here. */
  readonly awakenedAt: EpochMs
}

export type CompleteAwakeningResult =
  /** The row was written: Awakening is complete. */
  | { readonly status: 'awakened'; readonly profile: PlayerProfileRecord }
  /**
   * A row already existed (another tab finished first, or this is a repeat): nothing was
   * written and the stored name is NOT replaced. `profile` is null when that row is damaged.
   */
  | { readonly status: 'already_awakened'; readonly profile: PlayerProfileRecord | null }

/**
 * Completes Player Awakening atomically and at most once: in one transaction it adds
 * the player profile row only if there is none. Row existence is the sole
 * "Awakening is complete" gate, so this single write is what ends onboarding. It
 * writes nothing else (no quest, occurrence, completion or EXP row).
 */
export function completeAwakeningAtomically(
  database: PersistenceDatabase,
  input: CompleteAwakeningInput,
): Promise<CompleteAwakeningResult> {
  return runTransaction(database, [STORE.playerProfile], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(STORE.playerProfile)
    const existing = await requestToPromise(store.get(PLAYER_PROFILE_ID))
    if (existing !== undefined) {
      const parsed = parsePlayerProfile(existing, 'player profile')
      return { status: 'already_awakened', profile: parsed.ok ? parsed.value : null }
    }
    const profile = parseForWrite(
      parsePlayerProfile,
      { id: PLAYER_PROFILE_ID, name: input.name, awakenedAt: input.awakenedAt },
      'player profile',
    )
    await requestToPromise(store.add(profile))
    return { status: 'awakened', profile }
  })
}
