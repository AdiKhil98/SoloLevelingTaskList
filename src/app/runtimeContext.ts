import { createContext, useContext } from 'react'
import type { CompleteTodayQuestResult, HomeSnapshot } from '@/application'

/**
 * What screens get from the application runtime: the current stored truth plus
 * the two actions that change it. Deliberately small; UI-only state (pending
 * taps, notices) stays in the screens.
 */
export interface AppRuntimeValue {
  /** Today's quests, progress and the player's progression, as last read from storage. */
  readonly snapshot: HomeSnapshot
  /** Completes a quest through the application layer and refreshes `snapshot` from storage. */
  completeQuest(occurrenceId: string): Promise<CompleteTodayQuestResult>
  /** Re-reads everything from storage (the same load as at startup). */
  reload(): Promise<void>
}

export const AppRuntimeContext = createContext<AppRuntimeValue | null>(null)

export function useAppRuntime(): AppRuntimeValue {
  const value = useContext(AppRuntimeContext)
  if (value === null) {
    throw new Error('useAppRuntime must be used inside <AppRuntimeProvider>')
  }
  return value
}
