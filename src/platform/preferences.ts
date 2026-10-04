/**
 * Tiny per-device presentation preferences (effects mode, haptics, sound) in
 * localStorage. They are cosmetic: they never touch progression data and are
 * intentionally NOT part of the IndexedDB backup. Storage can be unavailable
 * (private windows, blocked site data) or full, so every access is guarded and
 * a refusal simply means the choice lasts for this session.
 *
 * This module imports no other layer; it moves strings and knows nothing about
 * what they mean (the effects layer parses and validates them).
 */

/** The stored string for `key`, or null if there is none or storage cannot be read. */
export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Stores `value`; returns false (never throws) if storage refused it. */
export function writePreference(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** The device's reduced-motion setting, readable now and watchable. */
export const reducedMotionPreference = {
  get(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  },
  subscribe(listener: () => void): () => void {
    if (typeof window.matchMedia !== 'function') return () => undefined
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  },
}
