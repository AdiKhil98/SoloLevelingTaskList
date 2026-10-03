import type { WeekKey } from '../types/scalars'

/**
 * Deterministic natural keys of the weekly bonus (DATA_MODEL §1.2). One week
 * has one bonus row, so a retried or racing finalization collides on the
 * ledger's unique idempotency key instead of paying twice.
 */

/** Unique ledger key for the bonus a week's finalization awards. */
export function weeklyBonusIdempotencyKey(weekKey: WeekKey): string {
  return `weekly_goal_crusher:${weekKey}`
}

/** Ledger transaction id for the weekly bonus, derived from its idempotency key. */
export function weeklyBonusTransactionId(weekKey: WeekKey): string {
  return `xp:${weeklyBonusIdempotencyKey(weekKey)}`
}

/** Prefix of a goal id: `wg_<uuid>`. */
export const WEEKLY_GOAL_ID_PREFIX = 'wg_'
