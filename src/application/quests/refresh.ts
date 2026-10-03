import { loadHome, type HomeSnapshot } from '../home'
import type { ApplicationContext } from '../context'

/**
 * What every quest-management mutation reports about the refreshed Home state.
 * `home` is null only if the change WAS saved but re-reading storage then
 * failed (`refreshCause`); the caller reloads instead of trusting stale state.
 */
export type Refreshed =
  | { readonly home: HomeSnapshot }
  | { readonly home: null; readonly refreshCause: unknown }

/**
 * Re-reads today's authoritative state after a management change. The loader
 * is also what materializes today's occurrence for a quest that just became
 * eligible, and it never touches an occurrence that already exists.
 */
export async function refreshHome(context: ApplicationContext): Promise<Refreshed> {
  try {
    return { home: await loadHome(context) }
  } catch (refreshCause) {
    return { home: null, refreshCause }
  }
}
