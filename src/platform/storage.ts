/**
 * Best-effort request for persistent storage, so the browser is less likely to evict the app's IndexedDB data when
 * the device runs low on space. It is silent and invisible: Chrome decides by its own heuristics (an installed app
 * is favoured) and shows no prompt, a refusal is normal, and nothing in the app depends on the answer. It never
 * throws and nothing is logged, because "denied" is not a fault.
 *
 * The API exists only in secure contexts (HTTPS or localhost); on plain HTTP it is simply unavailable.
 *
 * This module imports no other layer.
 */

export type StoragePersistence = 'granted' | 'already' | 'denied' | 'unavailable' | 'failed'

interface StorageManagerLike {
  persist?: () => Promise<boolean>
  persisted?: () => Promise<boolean>
}

export async function requestPersistentStorage(
  manager: StorageManagerLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage,
): Promise<StoragePersistence> {
  try {
    if (manager === undefined || typeof manager.persist !== 'function') return 'unavailable'
    if (typeof manager.persisted === 'function' && (await manager.persisted())) return 'already'
    return (await manager.persist()) ? 'granted' : 'denied'
  } catch {
    return 'failed'
  }
}
