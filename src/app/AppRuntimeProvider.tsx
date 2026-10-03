import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  archiveQuest,
  classifyFailure,
  completeTodayQuest,
  createQuest,
  initializeApplication,
  listQuestTemplates,
  loadHome,
  loadQuestForEdit,
  restoreQuest,
  updateQuest,
  type ApplicationContext,
  type Clock,
  type CompleteTodayQuestResult,
  type FailureReason,
  type HomeSnapshot,
  type IdSource,
  type QuestFormValues,
} from '@/application'
import { openDatabase, type OpenDatabaseOptions, type PersistenceDatabase } from '@/persistence'
import { AppRuntimeContext, type AppRuntimeValue, type QuestActions } from './runtimeContext'
import { LoadingScreen, StartupErrorScreen } from './StartupScreens'

export interface AppRuntimeOptions {
  /** Where "now" and the time zone come from (the device clock in production). */
  readonly clock: Clock
  /** Where fresh random ids come from (Web Crypto in production). */
  readonly ids: IdSource
  /** Database name / IndexedDB factory; defaults to the production database. */
  readonly database?: OpenDatabaseOptions
}

type RuntimeState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready'
      /** The one open database handle, the clock and the id source, shared by every use case. */
      readonly context: ApplicationContext
      readonly snapshot: HomeSnapshot
    }
  | { readonly status: 'error'; readonly reason: FailureReason }

interface AppRuntimeProviderProps {
  /** Must keep the same identity between renders (define it outside the component). */
  options: AppRuntimeOptions
  children: ReactNode
}

/** The part of a saved quest-management result that carries the refreshed Home state. */
type MaybeRefreshed = { readonly home: HomeSnapshot } | { readonly home: null; readonly refreshCause: unknown }

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
        const context: ApplicationContext = { database: opened, clock: options.clock, ids: options.ids }
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

  const quests = useMemo<QuestActions | null>(() => {
    if (context === null) return null

    // A quest change that was saved also refreshed Home: adopt that state, or
    // reload if the saved change could not be re-read (never show stale state).
    const adopt = async (result: MaybeRefreshed): Promise<void> => {
      if (result.home !== null) {
        setState({ status: 'ready', context, snapshot: result.home })
      } else {
        console.error('Refreshing after a saved quest change failed', result.refreshCause)
        await reload()
      }
    }

    return {
      list: () => listQuestTemplates(context),
      loadForEdit: (templateId: string) => loadQuestForEdit(context, templateId),
      create: async (values: QuestFormValues) => {
        const result = await createQuest(context, values)
        if (result.status === 'created') await adopt(result)
        return result
      },
      update: async (templateId: string, values: QuestFormValues) => {
        const result = await updateQuest(context, templateId, values)
        if (result.status === 'updated') await adopt(result)
        return result
      },
      archive: async (templateId: string) => {
        const result = await archiveQuest(context, templateId)
        if (result.status === 'archived' || result.status === 'already_archived') await adopt(result)
        return result
      },
      restore: async (templateId: string) => {
        const result = await restoreQuest(context, templateId)
        if (result.status === 'restored' || result.status === 'already_active') await adopt(result)
        return result
      },
    }
  }, [context, reload])

  const value = useMemo<AppRuntimeValue | null>(
    () => (snapshot === null || quests === null ? null : { snapshot, completeQuest, quests, reload }),
    [snapshot, completeQuest, quests, reload],
  )

  if (state.status === 'error') return <StartupErrorScreen reason={state.reason} onRetry={retry} />
  if (value === null) return <LoadingScreen />
  return <AppRuntimeContext value={value}>{children}</AppRuntimeContext>
}
