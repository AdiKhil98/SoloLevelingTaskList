/**
 * Tagged result used for expected, recoverable domain outcomes. Routine
 * cases (a malformed date key, an ineligible date) are returned, not thrown.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}
