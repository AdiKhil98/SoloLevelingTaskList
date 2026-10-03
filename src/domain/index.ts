/**
 * Public API of the domain engine. Consumers import from here, not from
 * internal modules. Framework-independent: no React, no storage, no ambient
 * clock or timezone.
 */

// Shared types
export { DomainError, type DomainErrorCode } from './types/errors'
export { err, ok, type Result } from './types/result'
export {
  ISO_WEEKDAYS,
  type DateKey,
  type EpochMs,
  type IsoWeekday,
  type WeekKey,
} from './types/scalars'

// Configuration (economy values live here and nowhere else)
export { CATEGORIES, isCategory, type Category } from './config/categories'
export { DAILY_QUALITY_THRESHOLDS } from './config/daily'
export {
  DIFFICULTIES,
  DIFFICULTY_EXP,
  expRewardForDifficulty,
  isDifficulty,
  type Difficulty,
} from './config/difficulty'
export { STARTING_LEVEL, XP_CURVE } from './config/progression'
export { RANK_BANDS, RANK_IDS, type RankBand, type RankId } from './config/ranks'

// Calendar dates and instants
export {
  addDays,
  asDateKey,
  compareDateKeys,
  dateKeyFromLocalDate,
  dateKeyParts,
  daysBetween,
  daysInMonth,
  isDateKey,
  isLeapYear,
  isoWeekday,
  makeDateKey,
  MAX_YEAR,
  MIN_YEAR,
  nextDate,
  parseDateKey,
  previousDate,
  type DateKeyParseError,
  type DateParts,
} from './time/dateKey'
export {
  clockReadingAt,
  type ClockError,
  type ClockReading,
} from './time/clock'

// Progression
export { applyExpAward, type ProgressionChange } from './progression/award'
export {
  levelOf,
  levelStateOf,
  totalExpToReachLevel,
  xpToNext,
  type LevelState,
} from './progression/levels'
export type {
  LedgerState,
  XPSource,
  XPTransaction,
} from './progression/ledger'
export {
  rankOfLevel,
  rankTransitionsBetween,
  type RankTransition,
} from './progression/ranks'

// Quests
export {
  checkQuestEligibility,
  isQuestEligibleOnDate,
  type EligibilityResult,
  type IneligibleReason,
} from './quests/eligibility'
export {
  occurrenceIdOf,
  questCompletionIdempotencyKey,
  questCompletionTransactionId,
} from './quests/keys'
export {
  createOccurrence,
  type OccurrenceError,
} from './quests/occurrence'
export {
  MIN_INTERVAL_DAYS,
  validateRecurrence,
  type RecurrenceError,
} from './quests/recurrence'
export {
  validateQuestTemplate,
  type TemplateValidationError,
} from './quests/template'
export {
  completeQuest,
  type CompleteQuestInput,
  type CompleteQuestResult,
  type CompletionRejection,
  type QuestCompletionOutcome,
} from './quests/completion'
export type {
  QuestCompletion,
  QuestOccurrence,
  QuestRecurrence,
  QuestRecurrenceKind,
  QuestRole,
  QuestTemplate,
} from './quests/types'

// Daily progress
export {
  classifyDayQuality,
  computeDailyProgress,
  displayPercentOf,
  summarizeDay,
  type DailyProgress,
  type DailyProgressError,
  type DayQuality,
} from './daily/dailyProgress'

// Events
export type {
  DomainEvent,
  LevelUpEvent,
  QuestCompletedEvent,
  RankUpEvent,
  XPAwardedEvent,
} from './events/types'
