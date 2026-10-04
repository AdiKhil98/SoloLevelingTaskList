import { useCallback, useEffect, useState } from 'react'

/**
 * A two-step close for popups and overlays: `close()` starts the exit
 * animation, and `onFinish` runs once it has had `closeMs` to play. Closing is
 * idempotent (a second tap, or the timer firing after a tap, does nothing), and
 * the pending timer is cancelled if the component goes away first.
 */
export function useFinish(closeMs: number, onFinish: () => void): { readonly closing: boolean; readonly close: () => void } {
  const [closing, setClosing] = useState(false)
  const close = useCallback(() => setClosing(true), [])

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(onFinish, closeMs)
    return () => window.clearTimeout(timer)
  }, [closing, closeMs, onFinish])

  return { closing, close }
}

/**
 * Calls `onElapsed` once `visibleMs` of VISIBLE time has passed. While the page
 * is hidden (or `paused`) the clock does not run and restarts when it returns,
 * so a celebration the player was not there to see is not timed out unseen.
 * `restartKey` restarts it (a new phase of the same overlay).
 */
export function useVisibleTimeout(visibleMs: number, paused: boolean, onElapsed: () => void, restartKey: string | number = 0): void {
  useEffect(() => {
    if (paused || visibleMs <= 0) return
    const timer = window.setTimeout(onElapsed, visibleMs)
    return () => window.clearTimeout(timer)
  }, [visibleMs, paused, onElapsed, restartKey])
}
