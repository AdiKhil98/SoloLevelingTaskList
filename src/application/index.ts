/**
 * Public API of the application layer (Phase 04): the use cases that connect
 * the domain engine and persistence to the UI. Framework-free: no React, no
 * routing, no ambient clock. Consumers import from here.
 */

export { readClock, type Clock } from './clock'
export type { ApplicationContext } from './context'
export { newTemplateId, newWeeklyGoalId, USER_TEMPLATE_ID_PREFIX, type IdSource } from './ids'
export {
  ApplicationError,
  classifyFailure,
  type ApplicationErrorCode,
  type FailureReason,
} from './errors'

export { loadHome, synchronizeAndLoadHome, type HomeSnapshot, type SynchronizedHome } from './home'
export { initializeApplication, startApplication } from './initialize'
export {
  reconcileDays,
  requireSynchronizedDay,
  synchronizeDay,
  type ClockStatus,
  type ReconcileResult,
  type ReconcileTrigger,
} from './lifecycle/synchronization'
export { msUntilMidnight } from './lifecycle/midnight'
export { finalizeDueWeeks, type FinalizedWeekReport } from './lifecycle/finalizeWeeks'
export { buildDailyReport, type DailyReport } from './report/buildDailyReport'
export { loadStreakStats, type StreakStats } from './player/loadStreakStats'
export { attemptLoad, type LoadResult } from './loadResult'
export {
  completionPresentationEvents,
  OVERNIGHT_MAX_FINALIZED_BOARDS,
  OVERNIGHT_MAX_FINALIZED_DAYS,
  reconciliationPresentationEvents,
  type CompletionPresentationInput,
  type PresentationEvents,
  type ReconciliationPresentationInput,
} from './presentation/presentationEvents'
export {
  loadPlayerProfile,
  RECENT_ACHIEVEMENT_COUNT,
  TOP_QUEST_COUNT,
  type PlayerProfile,
  type TopQuest,
  type WeeklyProfile,
} from './player/loadPlayerProfile'
export { loadAchievements, type AchievementsView } from './player/loadAchievements'
export { loadDailyHistory, type DailyHistoryEntry } from './player/loadDailyHistory'

export {
  completeTodayQuest,
  type CompleteQuestRejection,
  type CompleteTodayQuestResult,
} from './completion/completeTodayQuest'
export { loadPlayerStatus, type PlayerStatus } from './player/loadPlayerStatus'
export { loadToday, type TodayQuest, type TodayView } from './today/loadToday'
export { compareQuestOrder, questOrderKeyOf, sortTemplatesByOrder, type QuestOrderKey } from './today/questOrder'

export {
  defaultQuestFormValues,
  formValuesFromTemplate,
  parseQuestForm,
  type ParseQuestFormContext,
  type QuestDefinition,
  type QuestFormErrorCode,
  type QuestFormErrors,
  type QuestFormField,
  type QuestFormValues,
} from './quests/questForm'
export { createQuest, type CreateQuestResult } from './quests/createQuest'
export { updateQuest, type UpdateQuestResult } from './quests/updateQuest'
export { archiveQuest, type ArchiveQuestResult } from './quests/archiveQuest'
export { restoreQuest, type RestoreQuestResult } from './quests/restoreQuest'
export { reorderQuests, type ReorderQuestsInput, type ReorderQuestsResult } from './quests/reorderQuests'
export { loadQuestForEdit, type LoadQuestForEditResult } from './quests/loadQuestForEdit'
export {
  listQuestTemplates,
  type ListQuestTemplatesResult,
  type QuestListItem,
} from './quests/listQuestTemplates'

export {
  emptyRewards,
  parseWeeklyBoardForm,
  type ParseWeeklyBoardFormContext,
  type WeeklyBoardErrorCode,
  type WeeklyBoardFormErrors,
  type WeeklyBoardFormValues,
  type WeeklyGoalErrorCode,
  type WeeklyGoalField,
  type WeeklyGoalFormValues,
} from './weekly/weeklyBoardForm'
export {
  buildActiveBoardView,
  buildFinalizedWeekView,
  type ActiveWeeklyBoardView,
  type FinalizedWeekView,
  type FinalizedWeeklyGoalView,
  type WeeklyGoalView,
  type WeeklyRewardTierView,
} from './weekly/views'
export { loadWeeklyHomeSummary, type WeeklyHomeSummary } from './weekly/summary'
export {
  loadWeeklyScreen,
  type LoadWeeklyScreenResult,
  type WeeklyCurrent,
  type WeeklyScreen,
} from './weekly/loadWeeklyScreen'
export {
  blankGoalFormValues,
  loadWeeklyEditor,
  type LinkableQuest,
  type LoadWeeklyEditorResult,
} from './weekly/loadWeeklyEditor'
export { loadWeeklyHistory, type LoadWeeklyHistoryResult } from './weekly/loadWeeklyHistory'
export {
  saveWeeklyBoard,
  type SaveWeeklyBoardRejectionReason,
  type SaveWeeklyBoardUseCaseResult,
} from './weekly/saveWeeklyBoard'
export {
  setWeeklyGoalProgress,
  type SetWeeklyGoalProgressRejectionReason,
  type SetWeeklyGoalProgressUseCaseResult,
} from './weekly/setWeeklyGoalProgress'
export {
  claimWeeklyReward,
  type ClaimWeeklyRewardRejectionReason,
  type ClaimWeeklyRewardUseCaseResult,
} from './weekly/claimWeeklyReward'

export { DEFAULT_QUEST_SEEDS, type DefaultQuestSeed } from './seeds/defaultQuests'
export {
  ensureDefaultQuests,
  type EnsureDefaultQuestsInput,
  type EnsureDefaultQuestsResult,
} from './seeds/ensureDefaultQuests'

export { DAILY_MESSAGES } from './dailyMessage/catalog'
export {
  dailyMessageIndexFor,
  selectDailyMessage,
  type DailyMessage,
} from './dailyMessage/selectDailyMessage'
