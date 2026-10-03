import type { Category } from '../config/categories'
import type { DateKey, EpochMs, WeekKey } from '../types/scalars'

/**
 * Why EXP was awarded. `weekly_goal_crusher` is declared so the ledger type
 * does not need reshaping later; nothing in Phase 02 produces it.
 */
export type XPSource =
  | {
      readonly type: 'quest_completion'
      readonly occurrenceId: string
      readonly templateId: string
    }
  | {
      readonly type: 'weekly_goal_crusher'
      readonly weekKey: WeekKey
      readonly score: number
    }

/** One append-only ledger row (DATA_MODEL §6). Amounts are always positive. */
export interface XPTransaction {
  readonly id: string
  /** Ledger order. Phase 03 re-allocates it inside its IndexedDB transaction. */
  readonly seq: number
  /** Unique. `quest_completion:{occurrenceId}` for quest EXP. */
  readonly idempotencyKey: string
  readonly source: XPSource
  readonly amount: number
  /** Null for weekly bonus EXP; otherwise the quest's primary category. */
  readonly category: Category | null
  /** True write time. Never back-dated. */
  readonly createdAt: EpochMs
  /** Reporting date; the occurrence's date for quest EXP. */
  readonly effectiveDate: DateKey
  /** Null for quest EXP. */
  readonly sourceWeekKey: WeekKey | null
  readonly totalExpAfter: number
}

/** The slice of the ledger a command needs to extend it. */
export interface LedgerState {
  readonly totalExp: number
  /** Highest `seq` applied so far (0 for an empty ledger). */
  readonly lastSeq: number
}
