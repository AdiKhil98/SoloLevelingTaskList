import type { DateKey } from '../types/scalars'

/**
 * Deterministic natural keys (DATA_MODEL §1.2). The same inputs always give
 * the same key, so a retried or racing write collides on a unique constraint
 * instead of creating a second record.
 */

export function occurrenceIdOf(templateId: string, dateKey: DateKey): string {
  return `occ:${templateId}@${dateKey}`
}

/** Unique ledger key for the EXP a quest occurrence awards. */
export function questCompletionIdempotencyKey(occurrenceId: string): string {
  return `quest_completion:${occurrenceId}`
}

/** Ledger transaction id for quest EXP, derived from its idempotency key. */
export function questCompletionTransactionId(occurrenceId: string): string {
  return `xp:${questCompletionIdempotencyKey(occurrenceId)}`
}
