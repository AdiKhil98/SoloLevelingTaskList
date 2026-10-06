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

/** Sets the page title (the browser tab, and the recent-apps list for an installed app). */
export function setDocumentTitle(title: string): void {
  if (typeof document !== 'undefined') document.title = title
}

/**
 * Stops the browser restoring an old scroll position on Back or reload. A screen's content arrives after the page does,
 * so a restored position was clamped to a half-loaded page and landed part-way down; the app puts each screen at the
 * top itself (`scrollToTop`).
 */
export function takeOverScrollRestoration(): void {
  try {
    if (typeof history !== 'undefined' && 'scrollRestoration' in history) history.scrollRestoration = 'manual'
  } catch {
    // an environment that refuses (a sandboxed frame): the browser keeps restoring, which is only cosmetic
  }
}

/** Puts the page back at the top, at once (a new screen starts at its heading, not wherever the last one was left). */
export function scrollToTop(): void {
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, 0)
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
