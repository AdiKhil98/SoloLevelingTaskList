import { createContext, useContext } from 'react'
import type {
  AchievementsView,
  ArchiveQuestResult,
  ClaimWeeklyRewardUseCaseResult,
  CompleteTodayQuestResult,
  CreateQuestResult,
  DailyHistoryEntry,
  HomeSnapshot,
  LoadResult,
  ListQuestTemplatesResult,
  LoadQuestForEditResult,
  LoadWeeklyEditorResult,
  LoadWeeklyHistoryResult,
  LoadWeeklyScreenResult,
  PlayerProfile,
  QuestFormValues,
  RenamePlayerResult,
  ReorderQuestsInput,
  ReorderQuestsResult,
  RestoreQuestResult,
  SaveWeeklyBoardUseCaseResult,
  SetWeeklyGoalProgressUseCaseResult,
  UpdateQuestResult,
  WeeklyBoardFormValues,
} from '@/application'
import type { WeekKey } from '@/domain'

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
  /** Stores the player's manual order of the active quests (refused if the screen's view is stale). */
  reorder(input: ReorderQuestsInput): Promise<ReorderQuestsResult>
}

/**
 * The Weekly Goal Crusher, through the application layer. Loads never change
 * `snapshot`; every saved change also refreshes it from storage (so the Home
 * card is current the moment the player returns). A finalized week can only be
 * read or claimed, never edited.
 */
export interface WeeklyActions {
  loadScreen(): Promise<LoadWeeklyScreenResult>
  loadEditor(): Promise<LoadWeeklyEditorResult>
  loadHistory(): Promise<LoadWeeklyHistoryResult>
  save(values: WeeklyBoardFormValues): Promise<SaveWeeklyBoardUseCaseResult>
  setProgress(goalId: string, progress: number): Promise<SetWeeklyGoalProgressUseCaseResult>
  claim(weekKey: WeekKey): Promise<ClaimWeeklyRewardUseCaseResult>
}

/**
 * The player's derived statistics and achievements, through the application
 * layer. Read-only: every figure is recomputed from stored history on each load
 * and nothing is written, so loading can never change progression.
 */
export interface ProfileActions {
  loadProfile(): Promise<LoadResult<PlayerProfile>>
  loadAchievements(): Promise<LoadResult<AchievementsView>>
  loadDailyHistory(): Promise<LoadResult<readonly DailyHistoryEntry[]>>
}

/**
 * Who the player is (Phase 11). `name` is the chosen name, or null when none was
 * chosen (the screens then show the generic PLAYER label). Renaming writes only the
 * profile row, updates `name` at once, never touches progression and does not need
 * the day synchronized, so it also works while the device clock is behind.
 */
export interface IdentityActions {
  readonly name: string | null
  rename(name: string): Promise<RenamePlayerResult>
}

/**
 * The one restrained notice a catch-up may leave (OD-21): how many old days
 * and how many weekly boards were finalized, and the bonus EXP those boards
 * paid. Informational; it carries no events and never replays celebrations.
 */
export interface LifecycleNotice {
  /** Days caught up (0 when the catch-up was too short to mention). */
  readonly daysReconciled: number
  readonly weeklyBoardsFinalized: number
  /** Total weekly bonus EXP paid by the boards finalized in this catch-up. */
  readonly weeklyBonusExp: number
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
  /** The Weekly Goal Crusher: board, progress, reward claim, history. */
  readonly weekly: WeeklyActions
  /** The player's statistics, achievements and Daily History (read-only). */
  readonly profile: ProfileActions
  /** The player's name, and renaming it. */
  readonly identity: IdentityActions
  /** The catch-up notice to show, or null. */
  readonly lifecycleNotice: LifecycleNotice | null
  dismissLifecycleNotice(): void
  /**
   * Re-reads everything from storage and reconciles any missed day first (the
   * same lifecycle step as at startup).
   */
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
