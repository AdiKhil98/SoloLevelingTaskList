import { useCallback, useEffect, useState } from 'react'
import type { LoadResult } from '@/application'

export type LoadState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'failed' }

/**
 * Loads read-only profile data when the screen opens and again whenever
 * `refreshKey` changes (the runtime snapshot is replaced after a completion or a
 * day change), so a screen left open never shows stale totals. A reload keeps
 * the previous value on screen instead of flashing a loading state; only a
 * first load or a Retry shows one. `load` must keep its identity between renders.
 */
export function useLoadedData<T>(load: () => Promise<LoadResult<T>>, refreshKey: unknown) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void load().then((result) => {
      if (cancelled) return
      if (result.status === 'ok') {
        setState({ status: 'ok', value: result.value })
      } else {
        console.error('Loading the player profile data failed', result.cause)
        setState({ status: 'failed' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [load, refreshKey, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }, [])

  return { state, retry }
}
