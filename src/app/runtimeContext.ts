import { createContext, useContext } from 'react'
import type {
  ArchiveQuestResult,
  CompleteTodayQuestResult,
  CreateQuestResult,
  HomeSnapshot,
  ListQuestTemplatesResult,
  LoadQuestForEditResult,
  QuestFormValues,
  RestoreQuestResult,
  UpdateQuestResult,
} from '@/application'

/**
 * Quest management, through the application layer. The reads never change
 * `snapshot`; every mutation that was saved also refreshes `snapshot` from
 * storage (so Home is current the moment the player returns to it).
 */
export interface QuestActions {
  list(): Promise<ListQuestTemplatesResult>
  loadForEdit(templateId: string): Promise<LoadQuestForEditResult>
  create(values: QuestFormValues): Promise<CreateQuestResult>
  update(templateId: string, values: QuestFormValues): Promise<UpdateQuestResult>
  archive(templateId: string): Promise<ArchiveQuestResult>
  restore(templateId: string): Promise<RestoreQuestResult>
}

/**
 * What screens get from the application runtime: the current stored truth plus
 * the actions that change it. Deliberately small; UI-only state (pending
 * taps, notices) stays in the screens.
 */
export interface AppRuntimeValue {
  /** Today's quests, progress and the player's progression, as last read from storage. */
  readonly snapshot: HomeSnapshot
  /** Completes a quest through the application layer and refreshes `snapshot` from storage. */
  completeQuest(occurrenceId: string): Promise<CompleteTodayQuestResult>
  /** Creates, edits, archives and restores quests. */
  readonly quests: QuestActions
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
