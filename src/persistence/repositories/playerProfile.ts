import { PLAYER_PROFILE_ID, STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import type { ValidationIssue } from '../errors'
import { parsePlayerProfile, type PlayerProfileRecord } from '../records/playerProfile'

/**
 * What storage holds for the player profile. Unlike the other repositories, an
 * invalid row is REPORTED rather than thrown: the profile is identity (a name), so
 * a damaged row must never lock the player out of their progression.
 *
 *  - `absent`: no row. On a new database that means "not awakened yet".
 *  - `valid`: the row; its existence means Awakening is complete.
 *  - `invalid`: a row exists but fails validation. Awakening still happened (the row
 *    exists); callers show the fallback name and leave the repair to a rename.
 */
export type PlayerProfileReading =
  | { readonly status: 'absent' }
  | { readonly status: 'valid'; readonly profile: PlayerProfileRecord }
  | { readonly status: 'invalid'; readonly issues: readonly ValidationIssue[] }

/** Reads the player profile row without validating it away. */
export async function getPlayerProfile(database: PersistenceDatabase): Promise<PlayerProfileReading> {
  const raw = await runTransaction(database, [STORE.playerProfile], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.playerProfile).get(PLAYER_PROFILE_ID)),
  )
  if (raw === undefined) return { status: 'absent' }
  const parsed = parsePlayerProfile(raw, 'player profile')
  return parsed.ok ? { status: 'valid', profile: parsed.value } : { status: 'invalid', issues: parsed.error }
}

/** How many quest templates are stored (templates are never hard-deleted, so this only ever grows). */
export function countTemplates(database: PersistenceDatabase): Promise<number> {
  return runTransaction(database, [STORE.templates], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.templates).count()),
  )
}
