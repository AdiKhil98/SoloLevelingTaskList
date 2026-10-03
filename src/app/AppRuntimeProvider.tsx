import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  archiveQuest,
  claimWeeklyReward,
  classifyFailure,
  completeTodayQuest,
  createQuest,
  listQuestTemplates,
  loadAchievements,
  loadDailyHistory,
  loadPlayerProfile,
  loadQuestForEdit,
  loadWeeklyEditor,
  loadWeeklyHistory,
  loadWeeklyScreen,
  restoreQuest,
  saveWeeklyBoard,
  setWeeklyGoalProgress,
  startApplication,
  updateQuest,
  type ApplicationContext,
  type Clock,
  type CompleteTodayQuestResult,
  type FailureReason,
  type FinalizedWeekReport,
  type HomeSnapshot,
  type IdSource,
  type QuestFormValues,
  type SynchronizedHome,
  type WeeklyBoardFormValues,
} from '@/application'
import type { WeekKey } from '@/domain'
import { openDatabase, type OpenDatabaseOptions, type PersistenceDatabase } from '@/persistence'
import {
  AppRuntimeContext,
  type AppRuntimeValue,
  type LifecycleNotice,
  type ProfileActions,
  type QuestActions,
  type WeeklyActions,
} from './runtimeContext'
import { LoadingScreen, StartupErrorScreen } from './StartupScreens'
import { useDaySync } from './useDaySync'

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

const UNAVAILABLE = { status: 'failed', reason: 'database_unavailable', cause: null } as const

/** Quest actions before the database is ready: every one fails visibly without touching anything. */
const UNAVAILABLE_QUEST_ACTIONS: QuestActions = {
  list: async () => UNAVAILABLE,
  loadForEdit: async () => UNAVAILABLE,
  create: async () => UNAVAILABLE,
  update: async () => UNAVAILABLE,
  archive: async () => UNAVAILABLE,
  restore: async () => UNAVAILABLE,
}

/** Weekly actions before the database is ready: every one fails visibly without touching anything. */
const UNAVAILABLE_WEEKLY_ACTIONS: WeeklyActions = {
  loadScreen: async () => UNAVAILABLE,
  loadEditor: async () => UNAVAILABLE,
  loadHistory: async () => UNAVAILABLE,
  save: async () => UNAVAILABLE,
  setProgress: async () => UNAVAILABLE,
  claim: async () => UNAVAILABLE,
}

/** Profile reads before the database is ready: every one fails visibly without touching anything. */
const UNAVAILABLE_PROFILE_ACTIONS: ProfileActions = {
  loadProfile: async () => UNAVAILABLE,
  loadAchievements: async () => UNAVAILABLE,
  loadDailyHistory: async () => UNAVAILABLE,
}

/** One finalized day is the normal overnight case and needs no words; a longer absence gets one notice. */
const CATCH_UP_NOTICE_MIN_DAYS = 2
/**
 * Owns the application runtime: opens the ONE database handle, runs the startup
 * use case, exposes the resulting stored state, and closes the handle when it
 * is disposed. Children render only once real stored state has loaded, so the
 * player never sees placeholder zeros.
 *
 * It also wires the day lifecycle (`useDaySync`): startup, resume, the midnight
 * timer and every change a screen asks for first reconcile any missed day and
 * reload Home, so the day shown is never behind the clock when something is
 * written.
 *
 * StrictMode-safe: a run that is disposed before its database finishes opening
 * closes that late handle and never publishes state.
 */
export function AppRuntimeProvider({ options, children }: AppRuntimeProviderProps) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<RuntimeState>({ status: 'loading' })
  const [lifecycleNotice, setLifecycleNotice] = useState<LifecycleNotice | null>(null)

  // At most ONE notice per reconciliation: the days it caught up and/or the weekly boards it finalized.
  // A finalized week is always mentioned, even overnight, because it paid EXP the player did not just earn.
  const noticeFor = useCallback((finalizedDays: number, finalizedWeeks: readonly FinalizedWeekReport[]) => {
    const days = finalizedDays >= CATCH_UP_NOTICE_MIN_DAYS ? finalizedDays : 0
    if (days === 0 && finalizedWeeks.length === 0) return
    setLifecycleNotice({
      daysReconciled: days,
      weeklyBoardsFinalized: finalizedWeeks.length,
      weeklyBonusExp: finalizedWeeks.reduce((sum, week) => sum + week.bonusExp, 0),
    })
  }, [])

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
        const { home, finalized, finalizedWeeks } = await startApplication(context)
        if (disposed) return
        setState({ status: 'ready', context, snapshot: home })
        noticeFor(finalized.length, finalizedWeeks)
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
  }, [attempt, noticeFor, options])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }, [])

  const context = state.status === 'ready' ? state.context : null
  const snapshot = state.status === 'ready' ? state.snapshot : null

  const onSynchronized = useCallback(
    (synced: ApplicationContext, { home, finalized, finalizedWeeks }: SynchronizedHome) => {
      setState({ status: 'ready', context: synced, snapshot: home })
      noticeFor(finalized.length, finalizedWeeks)
    },
    [noticeFor],
  )
  const onSyncFailed = useCallback((error: unknown) => {
    console.error('Day synchronization failed', error)
    setState({ status: 'error', reason: classifyFailure(error) })
  }, [])
  const syncDay = useDaySync({
    context,
    clock: options.clock,
    shown: snapshot,
    onSynchronized,
    onFailed: onSyncFailed,
  })

  const reload = useCallback(() => syncDay('resume', { force: true }), [syncDay])

  const dismissLifecycleNotice = useCallback(() => setLifecycleNotice(null), [])

  const completeQuest = useCallback(
    async (occurrenceId: string): Promise<CompleteTodayQuestResult> => {
      if (context === null) {
        return { status: 'failed', reason: 'database_unavailable', cause: null }
      }
      // Lifecycle first: a stale screen reconciles (and shows the new day) before it may write.
      await syncDay('resume')
      const result = await completeTodayQuest(context, occurrenceId)
      if (result.status === 'completed' || result.status === 'already_completed') {
        if (result.home !== null) {
          setState({ status: 'ready', context, snapshot: result.home })
        } else {
          // Saved, but re-reading failed: do not show stale state.
          console.error('Refreshing after a saved completion failed', result.refreshCause)
          await reload()
        }
      } else if (
        (result.status === 'rejected' && result.reason === 'day_ended') ||
        (result.status === 'failed' && (result.reason === 'day_not_synchronized' || result.reason === 'clock_behind'))
      ) {
        // The day moved on (or the clock did) between the screen and the write: show the truth.
        await syncDay('resume', { force: true })
      }
      return result
    },
    [context, reload, syncDay],
  )

  const quests = useMemo<QuestActions>(() => {
    if (context === null) return UNAVAILABLE_QUEST_ACTIONS

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
        await syncDay('resume')
        const result = await createQuest(context, values)
        if (result.status === 'created') await adopt(result)
        return result
      },
      update: async (templateId: string, values: QuestFormValues) => {
        await syncDay('resume')
        const result = await updateQuest(context, templateId, values)
        if (result.status === 'updated') await adopt(result)
        return result
      },
      archive: async (templateId: string) => {
        await syncDay('resume')
        const result = await archiveQuest(context, templateId)
        if (result.status === 'archived' || result.status === 'already_archived') await adopt(result)
        return result
      },
      restore: async (templateId: string) => {
        await syncDay('resume')
        const result = await restoreQuest(context, templateId)
        if (result.status === 'restored' || result.status === 'already_active') await adopt(result)
        return result
      },
    }
  }, [context, reload, syncDay])

  const weekly = useMemo<WeeklyActions>(() => {
    if (context === null) return UNAVAILABLE_WEEKLY_ACTIONS

    // A saved weekly change also refreshed Home (its weekly card): adopt that state, or reload if it
    // could not be re-read (never show stale state).
    const adopt = async (result: MaybeRefreshed): Promise<void> => {
      if (result.home !== null) {
        setState({ status: 'ready', context, snapshot: result.home })
      } else {
        console.error('Refreshing after a saved weekly change failed', result.refreshCause)
        await reload()
      }
    }

    return {
      loadScreen: () => loadWeeklyScreen(context),
      loadEditor: () => loadWeeklyEditor(context),
      loadHistory: () => loadWeeklyHistory(context),
      save: async (values: WeeklyBoardFormValues) => {
        await syncDay('resume')
        const result = await saveWeeklyBoard(context, values)
        if (result.status === 'created' || result.status === 'updated') await adopt(result)
        return result
      },
      setProgress: async (goalId: string, progress: number) => {
        await syncDay('resume')
        const result = await setWeeklyGoalProgress(context, goalId, progress)
        if (result.status === 'updated') await adopt(result)
        return result
      },
      claim: async (weekKey: WeekKey) => {
        await syncDay('resume')
        return claimWeeklyReward(context, weekKey)
      },
    }
  }, [context, reload, syncDay])

  const profile = useMemo<ProfileActions>(() => {
    if (context === null) return UNAVAILABLE_PROFILE_ACTIONS
    return {
      loadProfile: () => loadPlayerProfile(context),
      loadAchievements: () => loadAchievements(context),
      loadDailyHistory: () => loadDailyHistory(context),
    }
  }, [context])

  const value = useMemo<AppRuntimeValue | null>(
    () =>
      snapshot === null
        ? null
        : { snapshot, completeQuest, quests, weekly, profile, reload, lifecycleNotice, dismissLifecycleNotice },
    [snapshot, completeQuest, quests, weekly, profile, reload, lifecycleNotice, dismissLifecycleNotice],
  )

  if (state.status === 'error') return <StartupErrorScreen reason={state.reason} onRetry={retry} />
  if (value === null) return <LoadingScreen />
  return <AppRuntimeContext value={value}>{children}</AppRuntimeContext>
}
