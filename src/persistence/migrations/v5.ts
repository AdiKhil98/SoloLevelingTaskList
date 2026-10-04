import { PLAYER_PROFILE_ID, STORE } from '../config'
import type { Migration } from './index'

/**
 * Schema v5 (Phase 11): the `playerProfile` store, holding ONE row (key `'player'`):
 * the player's chosen name and whether Player Awakening has happened.
 *
 * THE ONBOARDING GATE IS ROW EXISTENCE, AND NOTHING ELSE. A row means "Awakening is
 * complete"; no row means the player has not been awakened yet. The upgrade decides
 * which case a database is in from the version the database had BEFORE the whole
 * upgrade (`originalFrom`), not from the step before this migration:
 *
 *  - `originalFrom === 0`: a brand-new database. A new database runs migrations 1
 *    through 5 in ONE upgrade, so this migration still sees 0 here. The store is
 *    created EMPTY: the first launch plays Awakening.
 *  - `originalFrom >= 1`: an installation that existed before Phase 11. The store is
 *    created with the legacy-completed row `{ id: 'player', name: null, awakenedAt: null }`,
 *    so an existing player is never put through a "first launch" they already had.
 *
 * `awakenedAt: null` on a migrated row means "a legacy, pre-Phase-11 player with no
 * real Awakening timestamp". It is NOT a signal that onboarding is required, and
 * nothing may ever read it as one. A player who really awakens gets the instant of
 * that moment. `name: null` means no name was chosen (the screens show `PLAYER`).
 *
 * THIS FILE IS VERSION-FROZEN. It imports nothing from the domain or the
 * application and keeps its own copy of the legacy row. Existing data is not
 * touched: every other store and row is exactly as it was.
 */
export const migrateToV5: Migration = (database, _transaction, { originalFrom }) => {
  const store = database.createObjectStore(STORE.playerProfile, { keyPath: 'id' })
  if (originalFrom >= 1) {
    // Written inside the live version-change transaction: all-or-nothing with the store itself.
    store.put({ id: PLAYER_PROFILE_ID, name: null, awakenedAt: null })
  }
}
