/**
 * Public API of the application layer (Phase 04): the use cases that connect
 * the domain engine and persistence to the UI. Framework-free: no React, no
 * routing, no ambient clock. Consumers import from here.
 */

export { readClock, type Clock } from './clock'
export type { ApplicationContext } from './context'
export { newTemplateId, USER_TEMPLATE_ID_PREFIX, type IdSource } from './ids'
export {
  ApplicationError,
  classifyFailure,
  type ApplicationErrorCode,
  type FailureReason,
} from './errors'

export { loadHome, type HomeSnapshot } from './home'
export { initializeApplication } from './initialize'

export {
  completeTodayQuest,
  type CompleteQuestRejection,
  type CompleteTodayQuestResult,
} from './completion/completeTodayQuest'
export { loadPlayerStatus, type PlayerStatus } from './player/loadPlayerStatus'
export { loadToday, type TodayQuest, type TodayView } from './today/loadToday'
export { compareQuestOrder, type QuestOrderKey } from './today/questOrder'

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
export { loadQuestForEdit, type LoadQuestForEditResult } from './quests/loadQuestForEdit'
export {
  listQuestTemplates,
  type ListQuestTemplatesResult,
  type QuestListItem,
} from './quests/listQuestTemplates'

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
