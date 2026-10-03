import type { Category } from '../config/categories'
import type { Difficulty } from '../config/difficulty'
import type { RankId } from '../config/ranks'
import type { XPSource } from '../progression/ledger'
import type { DateKey } from '../types/scalars'

/**
 * Facts the engine reports about something that already happened. Events
 * never change state. This is the Phase 02 subset of MASTER_SPEC §15; later
 * phases add `DayStatusChanged`, `PerfectDayReached`, `AchievementUnlocked`,
 * `WeeklyGoalCompleted` and `WeeklyBoardFinalized` to the union.
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

export type DomainEvent =
  | QuestCompletedEvent
  | XPAwardedEvent
  | LevelUpEvent
  | RankUpEvent
