import type { AchievementEvidence } from '../achievements/types'
import type { Category } from '../config/categories'
import type { Difficulty } from '../config/difficulty'
import type { RankId } from '../config/ranks'
import type { XPSource } from '../progression/ledger'
import type { DateKey, WeekKey } from '../types/scalars'

/**
 * Facts the engine reports about something that already happened. Events
 * never change state. This is the Phase 02 subset of MASTER_SPEC §15, extended
 * by Phase 07 (`WeeklyGoalCompleted`, `WeeklyBoardFinalized`) and Phase 10
 * (`PerfectDayReached`, `AchievementUnlocked`). `DayStatusChanged` is not
 * emitted yet.
 */
export interface QuestCompletedEvent {
  readonly type: 'QuestCompleted'
  readonly occurrenceId: string
  readonly templateId: string
  readonly dateKey: DateKey
  readonly difficulty: Difficulty
  readonly category: Category
}

export interface XPAwardedEvent {
  readonly type: 'XPAwarded'
  readonly transactionId: string
  readonly amount: number
  readonly sourceType: XPSource['type']
  readonly category: Category | null
  readonly totalExpBefore: number
  readonly totalExpAfter: number
}

/** One event per award, however many levels it crosses. */
export interface LevelUpEvent {
  readonly type: 'LevelUp'
  readonly previousLevel: number
  readonly newLevel: number
  /** Every level newly reached, ascending. */
  readonly levelsCrossed: readonly number[]
  readonly expIntoLevel: number
  readonly expToNext: number
}

/** One event per rank boundary crossed. */
export interface RankUpEvent {
  readonly type: 'RankUp'
  readonly previousRank: RankId
  readonly newRank: RankId
  /** The level whose arrival caused this rank change. */
  readonly atLevel: number
}

/** A weekly goal reached its target (a manual update; see DATA_MODEL §11). */
export interface WeeklyGoalCompletedEvent {
  readonly type: 'WeeklyGoalCompleted'
  readonly weekKey: WeekKey
  readonly goalId: string
  readonly earnedPoints: number
  /** The board's score once this goal counted. */
  readonly scoreNow: number
}

/** A week's board became final. Emitted before the bonus's own XPAwarded. */
export interface WeeklyBoardFinalizedEvent {
  readonly type: 'WeeklyBoardFinalized'
  readonly weekKey: WeekKey
  readonly score: number
  readonly bonusExp: number
  /** The reward tier the score earned (6–10), or null. */
  readonly rewardTierMinScore: number | null
}

/**
 * A live day reached 100 % (every eligible quest done). A fact about the day in
 * progress, not a finalization: the Perfect Day that counts toward streaks and
 * achievements is still decided only when the day is finalized.
 */
export interface PerfectDayReachedEvent {
  readonly type: 'PerfectDayReached'
  readonly dateKey: DateKey
  readonly completedCount: number
  readonly eligibleCount: number
}

/**
 * An achievement whose unlocking record was written by the action being
 * reported. Never replayed: it is built only from the evidence the action just
 * wrote, so history that was already unlocked can never produce it again.
 */
export interface AchievementUnlockedEvent {
  readonly type: 'AchievementUnlocked'
  readonly achievementId: string
  readonly title: string
  readonly description: string
  readonly evidence: AchievementEvidence
  /** The history date of the evidence record. */
  readonly unlockedOn: DateKey
}

export type DomainEvent =
  | QuestCompletedEvent
  | XPAwardedEvent
  | LevelUpEvent
  | RankUpEvent
  | PerfectDayReachedEvent
  | AchievementUnlockedEvent
  | WeeklyGoalCompletedEvent
  | WeeklyBoardFinalizedEvent
