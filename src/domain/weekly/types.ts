import type { WeeklyRewardTierScore } from '../config/weekly'
import type { DateKey, EpochMs, WeekKey } from '../types/scalars'

/**
 * How a goal's progress is measured (OD-10, resolved in Phase 07): a number the
 * player updates, or the count of completions of ONE quest template inside the
 * week. Nothing else; there is no rules language.
 */
export type WeeklyGoalTracking =
  | { readonly mode: 'manual' }
  | { readonly mode: 'linked_quest'; readonly templateId: string }

export type WeeklyGoalTrackingMode = WeeklyGoalTracking['mode']

export interface WeeklyGoal {
  /** `wg_<uuid>`; stable across edits. */
  readonly id: string
  readonly title: string
  /** The points this goal is worth: a whole number ≥ 1. Σ over a board is exactly 10. */
  readonly maxPoints: number
  /** The progress at which the goal counts as achieved: a whole number ≥ 1 (a yes/no goal uses 1). */
  readonly target: number
  /** What the target counts (`backtests`); display only. */
  readonly unit: string | null
  readonly tracking: WeeklyGoalTracking
  /** The player's own count. Used when `tracking.mode` is manual; kept (ignored) otherwise. */
  readonly manualProgress: number
  readonly notes: string | null
}

export interface WeeklyRewardTier {
  readonly minScore: WeeklyRewardTierScore
  /** User-written reward. May be empty (no reward configured for the tier). */
  readonly text: string
}

/** What a board's author controls: everything except identity, status and audit fields. */
export interface WeeklyBoardDefinition {
  readonly focus: string | null
  readonly goals: readonly WeeklyGoal[]
  /** Exactly one entry per reward tier, ascending by `minScore`. */
  readonly rewardTiers: readonly WeeklyRewardTier[]
}

/** One goal as it stood when its board was finalized: the exact progress used for scoring. */
export interface WeeklyGoalResult {
  readonly goalId: string
  readonly title: string
  readonly unit: string | null
  readonly maxPoints: number
  readonly target: number
  readonly trackingMode: WeeklyGoalTrackingMode
  /** The linked template for a linked goal, else null. */
  readonly templateId: string | null
  /** The manual value, or the linked completion count, that was scored. A frozen snapshot. */
  readonly finalProgress: number
  readonly completed: boolean
  /** `maxPoints` when completed, otherwise 0. */
  readonly earnedPoints: number
}

export interface WeeklyFinalization {
  readonly finalizedAt: EpochMs
  /** Σ earned points, 0–10. */
  readonly score: number
  /** From the bonus table; 0 below a score of 6. */
  readonly bonusExp: number
  /** The single weekly ledger row, or null when `bonusExp` is 0. */
  readonly xpTransactionId: string | null
  readonly goalResults: readonly WeeklyGoalResult[]
  /** The highest reward tier the score reached, with its text frozen at finalization; null below 6. */
  readonly rewardTier: WeeklyRewardTier | null
}

export type WeeklyBoardStatus = 'active' | 'finalized'

/** One board per Monday → Sunday week. Immutable once `status` is `finalized`. */
export interface WeeklyGoalBoard extends WeeklyBoardDefinition {
  readonly weekKey: WeekKey
  /** The Monday (`=== weekKey`). */
  readonly startDate: DateKey
  /** The Sunday. */
  readonly endDate: DateKey
  readonly status: WeeklyBoardStatus
  readonly createdAt: EpochMs
  readonly updatedAt: EpochMs
  /** Starts at 1; +1 on every write while active. */
  readonly revision: number
  /** Null while active; written once, with the status change. */
  readonly finalization: WeeklyFinalization | null
}

/** Claiming a finalized week's real-life reward. Separate from the board so the board stays frozen. */
export interface WeeklyRewardClaim {
  readonly weekKey: WeekKey
  readonly tierMinScore: WeeklyRewardTierScore
  /** The reward text as it was when the board was finalized. */
  readonly rewardTextSnapshot: string
  readonly claimedAt: EpochMs
}
