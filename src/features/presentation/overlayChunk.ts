/**
 * The one dynamic import of the overlay chunk (full-screen overlays, particles,
 * text effects). Keeping it in its own module lets the host prefetch it and the
 * lazy component share the same request.
 */
export const loadOverlays = () => import('./overlays/EntryOverlay')

/** Fetches the overlay chunk ahead of the first earned moment (the browser caches it; nothing renders). */
export function prefetchOverlays(): void {
  void loadOverlays().catch(() => undefined) // a failed prefetch is retried, and handled, when an overlay is really needed
}
