/**
 * Whether the app's page is currently visible. Presentation waits while the
 * page is hidden (a celebration nobody can see is wasted, and a background
 * animation loop wastes battery).
 *
 * This module imports no other layer.
 */

/** Reloads the page (the only place the application asks the browser to). Callers decide WHEN; it is never automatic. */
export function reloadPage(): void {
  window.location.reload()
}

export const pageVisibility = {
  isHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden'
  },
  subscribe(listener: () => void): () => void {
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
  },
}
