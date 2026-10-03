import { useCallback, useEffect, useRef } from 'react'
import {
  msUntilMidnight,
  readClock,
  synchronizeAndLoadHome,
  type ApplicationContext,
  type Clock,
  type HomeSnapshot,
  type ReconcileTrigger,
  type SynchronizedHome,
} from '@/application'

/** The midnight wake-up fires a moment after midnight, never before it. */
const MIDNIGHT_MARGIN_MS = 250
/** Floor for re-arming the timer, so a clock that does not advance can never spin it. */
const MIN_REARM_MS = 1_000
/** Used if the clock cannot be read when arming. */
const FALLBACK_REARM_MS = 60_000

export interface DaySyncOptions {
  /** The open runtime, or null before it is ready (then nothing runs). */
  readonly context: ApplicationContext | null
  readonly clock: Clock
  /** The Home state currently on screen; the clock is compared with it. */
  readonly shown: HomeSnapshot | null
  /** Receives the freshly reconciled and loaded state. Must keep its identity between renders. */
  readonly onSynchronized: (context: ApplicationContext, result: SynchronizedHome) => void
  /** Receives a failure of the lifecycle step. Must keep its identity between renders. */
  readonly onFailed: (error: unknown) => void
}

export type SyncDay = (trigger: ReconcileTrigger, options?: { readonly force?: boolean }) => Promise<void>

/**
 * The UI half of the day lifecycle (the domain and application layers own every
 * rule; this only decides WHEN to ask them). `syncDay` reads the clock and, if
 * the date on screen is no longer the device date (or the clock was behind),
 * reconciles every missed day and reloads Home. It is
 *
 *  - single-flight: overlapping triggers share one run, and
 *  - idempotent: a same-day call does no storage work at all.
 *
 * It is triggered on resume (`visibilitychange`, `pageshow`, `focus`) and by a
 * timer aimed at the next local midnight. The timer is a convenience: when it
 * fires it only calls `syncDay` (which re-reads the clock) and re-arms, so an
 * early, late or missing timer never affects correctness. The screens also call
 * `syncDay` before every change.
 */
export function useDaySync({ context, clock, shown, onSynchronized, onFailed }: DaySyncOptions): SyncDay {
  const shownRef = useRef<HomeSnapshot | null>(shown)
  useEffect(() => {
    shownRef.current = shown
  }, [shown])

  const inFlight = useRef<Promise<void> | null>(null)

  const syncDay = useCallback<SyncDay>(
    (trigger, { force = false } = {}) => {
      if (context === null) return Promise.resolve()
      if (inFlight.current !== null) return inFlight.current

      const run = (async () => {
        try {
          const current = shownRef.current
          if (
            !force &&
            current !== null &&
            current.clock.status === 'ok' &&
            readClock(clock).dateKey === current.today.dateKey
          ) {
            return // same day, nothing changed
          }
          onSynchronized(context, await synchronizeAndLoadHome(context, trigger))
        } catch (error) {
          onFailed(error)
        }
      })()
      inFlight.current = run
      void run.finally(() => {
        if (inFlight.current === run) inFlight.current = null
      })
      return run
    },
    [context, clock, onSynchronized, onFailed],
  )

  useEffect(() => {
    if (context === null) return
    const onResume = () => {
      if (document.visibilityState === 'visible') void syncDay('resume')
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('pageshow', onResume)
    window.addEventListener('focus', onResume)
    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('pageshow', onResume)
      window.removeEventListener('focus', onResume)
    }
  }, [context, syncDay])

  useEffect(() => {
    if (context === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      let delay: number
      try {
        delay = Math.max(MIN_REARM_MS, msUntilMidnight(clock) + MIDNIGHT_MARGIN_MS)
      } catch {
        delay = FALLBACK_REARM_MS
      }
      timer = setTimeout(() => {
        void syncDay('midnight_tick').finally(() => {
          if (!cancelled) arm()
        })
      }, delay)
    }
    arm()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [context, clock, syncDay])

  return syncDay
}
