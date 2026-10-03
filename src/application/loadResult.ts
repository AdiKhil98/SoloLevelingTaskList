import { classifyFailure, type FailureReason } from './errors'

/** The result of a read-only load: the value, or a player-safe reason the read failed. */
export type LoadResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/** Runs a read and reports a failure as a `LoadResult` instead of throwing. */
export async function attemptLoad<T>(read: () => Promise<T>): Promise<LoadResult<T>> {
  try {
    return { status: 'ok', value: await read() }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
}
