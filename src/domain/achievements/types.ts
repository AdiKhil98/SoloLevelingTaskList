import type { RankId } from '../config/ranks'
import type { DayMilestone } from '../stats/dailyStats'
import type { DateKey, EpochMs, WeekKey } from '../types/scalars'

export type AchievementGroup = 'general' | 'daily' | 'streak' | 'weekly' | 'rank'

/**
 * What an achievement asks of the player's history. The vocabulary is small and
 * declarative; one generic engine evaluates every entry, so adding an
 * achievement is adding data, never branching code.
 */
export type AchievementCondition =
  /** Quest completions, ever (quest ledger rows). */
  | { readonly type: 'quest_completions'; readonly count: number }
  /** Finalized days at this milestone or better. */
  | { readonly type: 'finalized_days'; readonly milestone: DayMilestone; readonly count: number }
  /** A Daily Streak of at least `days` (the finalized chain). */
  | { readonly type: 'daily_streak'; readonly days: number }
  /** Finalized Goal Crusher boards scored at least `minScore` (0 = any finalized board). */
  | { readonly type: 'finalized_weeks'; readonly minScore: number; readonly count: number }
  /** The level at which a rank begins (D to S). */
  | { readonly type: 'rank_reached'; readonly rank: RankId }
  /** A specific player level. */
  | { readonly type: 'level_reached'; readonly level: number }

/**
 * A static trophy definition. Achievements are milestone records only: there is
 * no reward field of any kind, and evaluating them never writes to the ledger
 * (MASTER_SPEC NR-10).
 */
export interface AchievementDefinition {
  /** Stable identifier; never reused. */
  readonly id: string
  readonly group: AchievementGroup
  readonly title: string
  readonly description: string
  readonly condition: AchievementCondition
}

export interface AchievementProgress {
  /** Never above `target`. */
  readonly current: number
  readonly target: number
}

/** The exact historical record whose arrival first satisfied the condition. */
export type AchievementEvidence =
  | { readonly type: 'xp_transaction'; readonly transactionId: string; readonly seq: number }
  | { readonly type: 'daily_summary'; readonly dateKey: DateKey }
  | { readonly type: 'weekly_board'; readonly weekKey: WeekKey }

export interface AchievementUnlock {
  /** The real write instant of the evidence record. */
  readonly unlockedAt: EpochMs
  /**
   * The history date of the evidence record: the completion's date for quest
   * EXP, the finalized day, or the Sunday of a finalized week (and so of a level
   * crossed by that week's bonus).
   */
  readonly unlockedOn: DateKey
  readonly evidence: AchievementEvidence
}

export interface AchievementStatus {
  readonly definition: AchievementDefinition
  /** Null while locked. */
  readonly unlock: AchievementUnlock | null
  readonly progress: AchievementProgress
}
