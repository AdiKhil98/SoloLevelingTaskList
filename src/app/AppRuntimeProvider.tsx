import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  classifyFailure,
  completeTodayQuest,
  initializeApplication,
  loadHome,
  type ApplicationContext,
  type Clock,
  type CompleteTodayQuestResult,
  type FailureReason,
  type HomeSnapshot,
} from '@/application'
import { openDatabase, type OpenDatabaseOptions, type PersistenceDatabase } from '@/persistence'
import { AppRuntimeContext, type AppRuntimeValue } from './runtimeContext'
import { LoadingScreen, StartupErrorScreen } from './StartupScreens'

export interface AppRuntimeOptions {
  /** Where "now" and the time zone come from (the device clock in production). */
  readonly clock: Clock
  /** Database name / IndexedDB factory; defaults to the production database. */
  readonly database?: OpenDatabaseOptions
}

type RuntimeState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready'
      /** The one open database handle and the clock, shared by every use case. */
      readonly context: ApplicationContext
      readonly snapshot: HomeSnapshot
    }
  | { readonly status: 'error'; readonly reason: FailureReason }

interface AppRuntimeProviderProps {
  /** Must keep the same identity between renders (define it outside the component). */
  options: AppRuntimeOptions
  children: ReactNode
}

/**
 * Owns the application runtime: opens the ONE database handle, runs the startup
 * use case, exposes the resulting stored state, and closes the handle when it
 * is disposed. Children render only once real stored state has loaded, so the
 * player never sees placeholder zeros.
 *
 * StrictMode-safe: a run that is disposed before its database finishes opening
 * closes that late handle and never publishes state.
 */
export function AppRuntimeProvider({ options, children }: AppRuntimeProviderProps) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<RuntimeState>({ status: 'loading' })

  useEffect(() => {
    let disposed = false
    let database: PersistenceDatabase | null = null

    void (async () => {
      try {
        const opened = await openDatabase(options.database)
        if (disposed) {
          opened.close()
          return
        }
        database = opened
        const context: ApplicationContext = { database: opened, clock: options.clock }
        const snapshot = await initializeApplication(context)
        if (disposed) return
        setState({ status: 'ready', context, snapshot })
      } catch (error) {
        if (disposed) return
        console.error('Application startup failed', error)
        setState({ status: 'error', reason: classifyFailure(error) })
      }
    })()

    return () => {
      disposed = true
      database?.close()
    }
  }, [attempt, options])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }, [])

  const context = state.status === 'ready' ? state.context : null
  const snapshot = state.status === 'ready' ? state.snapshot : null

  const reload = useCallback(async () => {
    if (context === null) return
    try {
      setState({ status: 'ready', context, snapshot: await loadHome(context) })
    } catch (error) {
      console.error('Reloading stored state failed', error)
      setState({ status: 'error', reason: classifyFailure(error) })
    }
  }, [context])

  const completeQuest = useCallback(
    async (occurrenceId: string): Promise<CompleteTodayQuestResult> => {
      if (context === null) {
        return { status: 'failed', reason: 'database_unavailable', cause: null }
      }
      const result = await completeTodayQuest(context, occurrenceId)
      if (result.status === 'completed' || result.status === 'already_completed') {
        if (result.home !== null) {
          setState({ status: 'ready', context, snapshot: result.home })
        } else {
          // Saved, but re-reading failed: do not show stale state.
          console.error('Refreshing after a saved completion failed', result.refreshCause)
          await reload()
        }
      }
      return result
    },
    [context, reload],
  )

  const value = useMemo<AppRuntimeValue | null>(
    () => (snapshot === null ? null : { snapshot, completeQuest, reload }),
    [snapshot, completeQuest, reload],
  )

  if (state.status === 'error') return <StartupErrorScreen reason={state.reason} onRetry={retry} />
  if (value === null) return <LoadingScreen />
  return <AppRuntimeContext value={value}>{children}</AppRuntimeContext>
}
