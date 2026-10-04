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
  msUntilNextLocalMidnight,
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
  compareQuestOrder,
  hasUniqueSortOrders,
  isSortOrder,
  questOrderKeyOf,
  renumberInOrder,
  sortTemplatesByOrder,
  type QuestOrderKey,
} from './quests/order'
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
export {
  applyDayToStreaks,
  buildDailySummary,
  foldStreaks,
  INITIAL_STREAK_STATE,
  isStreakSecured,
  projectedDailyStreak,
  qualityOfSummaryCounts,
  streakEffectsOf,
  verifySummaryChain,
  type BuildDailySummaryInput,
  type ChainProblem,
  type DailySummary,
  type StreakEffect,
  type StreakState,
} from './daily/dailySummary'

// Weekly Goal Crusher
export {
  WEEKLY_BONUS_EXP,
  WEEKLY_BOARD_TOTAL_POINTS,
  WEEKLY_LIMITS,
  WEEKLY_REWARD_TIER_SCORES,
  isWeeklyRewardTierScore,
  weeklyBonusExpForScore,
  type WeeklyRewardTierScore,
} from './config/weekly'
export {
  asWeekKey,
  isDateInWeek,
  isWeekKey,
  nextWeekKey,
  previousWeekKey,
  weekEndOf,
  weekKeyOf,
} from './time/weekKey'
export type {
  WeeklyBoardDefinition,
  WeeklyBoardStatus,
  WeeklyFinalization,
  WeeklyGoal,
  WeeklyGoalBoard,
  WeeklyGoalResult,
  WeeklyGoalTracking,
  WeeklyGoalTrackingMode,
  WeeklyRewardClaim,
  WeeklyRewardTier,
} from './weekly/types'
export {
  validateWeeklyBoardDefinition,
  type WeeklyBoardProblem,
} from './weekly/validation'
export {
  evaluateWeeklyGoals,
  goalProgressOf,
  isGoalComplete,
  rewardTierForScore,
  type LinkedCompletionCounts,
  type WeeklyEvaluation,
} from './weekly/scoring'
export {
  buildNewWeeklyBoard,
  editWeeklyBoard,
  withManualProgress,
  type WeeklyBoardEditRejection,
} from './weekly/board'
export {
  finalizeWeeklyBoard,
  type FinalizeWeeklyBoardInput,
  type FinalizeWeeklyBoardRejection,
  type FinalizeWeeklyBoardResult,
  type WeeklyFinalizationOutcome,
} from './weekly/finalize'
export { buildWeeklyGoalCompletedEvents } from './weekly/events'
export {
  WEEKLY_GOAL_ID_PREFIX,
  weeklyBonusIdempotencyKey,
  weeklyBonusTransactionId,
} from './weekly/keys'

// Progression statistics (derived from history; nothing here is a stored counter)
export {
  finalizedBoardsInWeekOrder,
  inDayOrder,
  inLedgerOrder,
  isFinalizedBoard,
  normalizeHistory,
  type FinalizedWeeklyBoard,
  type NormalizedHistory,
  type ProgressionHistory,
} from './stats/history'
export { summarizeLedger, type CategoryStats, type LedgerStats, type QuestTally } from './stats/ledgerStats'
export { dayMeetsMilestone, summarizeDailyHistory, type DailyStats, type DayMilestone } from './stats/dailyStats'
export { summarizeWeeklyHistory, type WeeklyStats } from './stats/weeklyStats'

// Achievements (derived trophies; 0 EXP; no stored unlock state)
export { ACHIEVEMENT_CATALOG } from './achievements/catalog'
export { evaluateAchievements, summarizeAchievements, type AchievementSummary } from './achievements/evaluate'
export type {
  AchievementCondition,
  AchievementDefinition,
  AchievementEvidence,
  AchievementGroup,
  AchievementProgress,
  AchievementStatus,
  AchievementUnlock,
} from './achievements/types'

// Events
export type {
  DomainEvent,
  LevelUpEvent,
  QuestCompletedEvent,
  RankUpEvent,
  WeeklyBoardFinalizedEvent,
  WeeklyGoalCompletedEvent,
  XPAwardedEvent,
} from './events/types'
