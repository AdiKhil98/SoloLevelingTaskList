/**
 * Whether the browser believes it is online. INFORMATIONAL ONLY: it may drive the small OFFLINE indicator and
 * nothing else. It must never decide whether a local action (completing a quest, saving, renaming) is allowed:
 * the application needs no network at all, and `navigator.onLine` is only a hint (true on a LAN with no internet,
 * and a captive portal also reads as online).
 *
 * This module imports no other layer.
 */
export const connectivity = {
  /** Unknown counts as online, so the indicator never appears on a guess. */
  isOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine !== false
  },
  subscribe(listener: () => void): () => void {
    window.addEventListener('online', listener)
    window.addEventListener('offline', listener)
    return () => {
      window.removeEventListener('online', listener)
      window.removeEventListener('offline', listener)
    }
  },
}
