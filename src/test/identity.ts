import { openDatabase } from '@/persistence'
import { PLAYER_PROFILE_ID, STORE } from '@/persistence/config'
import { requestToPromise, runTransaction } from '@/persistence/database/transaction'

/**
 * Test helper: makes the database in `factory` belong to a player who has ALREADY
 * been through Awakening (or who predates it), exactly as an upgraded Phase 10
 * installation is: a legacy row `{ name: null, awakenedAt: null }`. It adds the
 * row only if there is none (one transaction: safe to run twice at once, as
 * StrictMode does) and never changes an existing profile, so repeating it (a
 * simulated restart) is harmless.
 *
 * Most UI tests are about the app, not about the first launch, so `renderApp`
 * does this by default; pass `awakened: false` to play the real first launch.
 */
export async function markPlayerAwakened(factory: IDBFactory): Promise<void> {
  const database = await openDatabase({ factory })
  try {
    await runTransaction(database, [STORE.playerProfile], 'readwrite', async (transaction) => {
      const store = transaction.objectStore(STORE.playerProfile)
      if ((await requestToPromise(store.get(PLAYER_PROFILE_ID))) === undefined) {
        await requestToPromise(store.add({ id: PLAYER_PROFILE_ID, name: null, awakenedAt: null }))
      }
    })
  } finally {
    database.close()
  }
}
