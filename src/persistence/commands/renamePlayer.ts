import { PLAYER_PROFILE_ID, STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { parsePlayerProfile, type PlayerProfileRecord } from '../records/playerProfile'
import { parseForWrite } from '../repositories/stored'

export interface RenamePlayerInput {
  /** The new name, already validated and normalized by the domain (`parsePlayerName`); `null` for none. */
  readonly name: string | null
}

export type RenamePlayerResult =
  | { readonly status: 'renamed'; readonly profile: PlayerProfileRecord }
  /** The stored name already equals this one: nothing was written. */
  | { readonly status: 'unchanged'; readonly profile: PlayerProfileRecord }

/** An `awakenedAt` worth keeping from a damaged row; anything else becomes the legacy `null`. */
function salvageAwakenedAt(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = (raw as { awakenedAt?: unknown }).awakenedAt
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

/**
 * Changes the player's name atomically. It changes the name and nothing else: the
 * Awakening state (row existence and `awakenedAt`) is preserved, no progression
 * record is read or written, and it never replays onboarding.
 *
 * It also repairs the profile: if the row is missing (a database that has data but
 * lost its row) or damaged, it is rewritten with the chosen name, keeping a valid
 * `awakenedAt` and otherwise using the legacy `null`. In every case the row exists
 * afterwards, so it can never turn a started player into a "new" one.
 */
export function renamePlayerAtomically(
  database: PersistenceDatabase,
  input: RenamePlayerInput,
): Promise<RenamePlayerResult> {
  return runTransaction(database, [STORE.playerProfile], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(STORE.playerProfile)
    const existing = await requestToPromise(store.get(PLAYER_PROFILE_ID))
    const parsed = existing === undefined ? null : parsePlayerProfile(existing, 'player profile')
    if (parsed?.ok === true && parsed.value.name === input.name) {
      return { status: 'unchanged', profile: parsed.value }
    }
    const awakenedAt = parsed?.ok === true ? parsed.value.awakenedAt : salvageAwakenedAt(existing)
    const profile = parseForWrite(parsePlayerProfile, { id: PLAYER_PROFILE_ID, name: input.name, awakenedAt }, 'player profile')
    await requestToPromise(store.put(profile))
    return { status: 'renamed', profile }
  })
}
