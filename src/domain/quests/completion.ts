import { isCategory } from '../config/categories'
import { buildQuestCompletionEvents } from '../events/questCompletionEvents'
import type { DomainEvent } from '../events/types'
import { applyExpAward, type ProgressionChange } from '../progression/award'
import type { LedgerState, XPTransaction } from '../progression/ledger'
import { clockReadingAt, type ClockError } from '../time/clock'
import { compareDateKeys, isDateKey } from '../time/dateKey'
import type { DateKey, EpochMs } from '../types/scalars'
import {
  occurrenceIdOf,
  questCompletionIdempotencyKey,
  questCompletionTransactionId,
} from './keys'
import type { QuestCompletion, QuestOccurrence } from './types'

export interface CompleteQuestInput {
  readonly occurrence: QuestOccurrence
  /**
   * The completion already stored for this occurrence (looked up by its
   * primary key `occurrenceId`), or null. A non-null value makes the call an
   * idempotent no-op.
   */
  readonly existingCompletion: QuestCompletion | null
  /** Current ledger tip, used to extend the audit chain. */
  readonly ledger: LedgerState
  /** The real instant of completion. Never read from the clock here. */
  readonly completedAt: EpochMs
  /**
   * IANA timezone (e.g. `Europe/Berlin`) in which `completedAt` is read to
   * decide which calendar day the completion happens on. Explicit input.
   */
  readonly timeZone: string
}

export interface QuestCompletionOutcome {
  readonly completion: QuestCompletion
  /** Exactly one positive ledger row. */
  readonly xpTransaction: XPTransaction
  readonly progression: ProgressionChange
  /** In presentation order; see `buildQuestCompletionEvents`. */
  readonly events: readonly DomainEvent[]
}

export type CompletionRejection =
  | {
      readonly code: 'invalid_occurrence'
      readonly problem: 'id' | 'date' | 'category' | 'exp_reward'
    }
  | { readonly code: 'existing_completion_mismatch' }
  | { readonly code: 'invalid_ledger_state' }
  | { readonly code: 'invalid_clock'; readonly detail: ClockError }
  /** The local date is before the occurrence's date. */
  | {
      readonly code: 'occurrence_not_yet_active'
      readonly occurrenceDate: DateKey
      readonly localDate: DateKey
    }
  /** The occurrence's day is over; past days can never be completed. */
  | {
      readonly code: 'occurrence_day_ended'
      readonly occurrenceDate: DateKey
      readonly localDate: DateKey
    }
  /** Total EXP would leave the safe integer range (technical limit only). */
  | { readonly code: 'exp_overflow' }

export type CompleteQuestResult =
  | ({ readonly status: 'completed' } & QuestCompletionOutcome)
  /** Harmless duplicate attempt: no new records, no EXP, no events. */
  | {
      readonly status: 'already_completed'
      readonly completion: QuestCompletion
    }
  | { readonly status: 'rejected'; readonly reason: CompletionRejection }

function occurrenceProblem(
  occurrence: QuestOccurrence,
): Extract<CompletionRejection, { code: 'invalid_occurrence' }>['problem'] | null {
  if (!isDateKey(occurrence.dateKey)) return 'date'
  if (occurrence.id !== occurrenceIdOf(occurrence.templateId, occurrence.dateKey)) {
    return 'id'
  }
  if (!isCategory(occurrence.snapshot.category)) return 'category'
  const { expReward } = occurrence.snapshot
  if (!Number.isSafeInteger(expReward) || expReward <= 0) return 'exp_reward'
  return null
}

/**
 * Completes a quest occurrence. Pure: it returns the records and events a
 * caller must commit atomically; it writes nothing.
 *
 * - Completion is final; there is no undo.
 * - A second attempt (with `existingCompletion` supplied) returns
 *   `already_completed` and awards nothing.
 * - A completion is only valid on the occurrence's own local date, which
 *   both forbids completing the future and locks past days.
 * - The EXP awarded is the occurrence's snapshotted `expReward`.
 */
export function completeQuest(input: CompleteQuestInput): CompleteQuestResult {
  const { occurrence, existingCompletion, ledger, completedAt, timeZone } = input

  const problem = occurrenceProblem(occurrence)
  if (problem !== null) {
    return {
      status: 'rejected',
      reason: { code: 'invalid_occurrence', problem },
    }
  }

  if (existingCompletion !== null) {
    if (existingCompletion.occurrenceId !== occurrence.id) {
      return {
        status: 'rejected',
        reason: { code: 'existing_completion_mismatch' },
      }
    }
    return { status: 'already_completed', completion: existingCompletion }
  }

  if (
    !Number.isSafeInteger(ledger.totalExp) ||
    ledger.totalExp < 0 ||
    !Number.isSafeInteger(ledger.lastSeq) ||
    ledger.lastSeq < 0
  ) {
    return { status: 'rejected', reason: { code: 'invalid_ledger_state' } }
  }

  const clock = clockReadingAt(completedAt, timeZone)
  if (!clock.ok) {
    return {
      status: 'rejected',
      reason: { code: 'invalid_clock', detail: clock.error },
    }
  }

  const comparison = compareDateKeys(clock.value.dateKey, occurrence.dateKey)
  if (comparison < 0) {
    return {
      status: 'rejected',
      reason: {
        code: 'occurrence_not_yet_active',
        occurrenceDate: occurrence.dateKey,
        localDate: clock.value.dateKey,
      },
    }
  }
  if (comparison > 0) {
    return {
      status: 'rejected',
      reason: {
        code: 'occurrence_day_ended',
        occurrenceDate: occurrence.dateKey,
        localDate: clock.value.dateKey,
      },
    }
  }

  const amount = occurrence.snapshot.expReward
  if (
    !Number.isSafeInteger(ledger.totalExp + amount) ||
    !Number.isSafeInteger(ledger.lastSeq + 1)
  ) {
    return { status: 'rejected', reason: { code: 'exp_overflow' } }
  }

  const progression = applyExpAward(ledger.totalExp, amount)
  const transactionId = questCompletionTransactionId(occurrence.id)

  const xpTransaction: XPTransaction = {
    id: transactionId,
    seq: ledger.lastSeq + 1,
    idempotencyKey: questCompletionIdempotencyKey(occurrence.id),
    source: {
      type: 'quest_completion',
      occurrenceId: occurrence.id,
      templateId: occurrence.templateId,
    },
    amount,
    category: occurrence.snapshot.category,
    createdAt: completedAt,
    effectiveDate: occurrence.dateKey,
    sourceWeekKey: null,
    totalExpAfter: progression.totalExpAfter,
  }

  const completion: QuestCompletion = {
    occurrenceId: occurrence.id,
    templateId: occurrence.templateId,
    dateKey: occurrence.dateKey,
    category: occurrence.snapshot.category,
    expAwarded: amount,
    completedAt,
    utcOffsetMinutes: clock.value.utcOffsetMinutes,
    timeZone: clock.value.timeZone,
    xpTransactionId: transactionId,
  }

  return {
    status: 'completed',
    completion,
    xpTransaction,
    progression,
    events: buildQuestCompletionEvents(
      occurrence,
      completion,
      xpTransaction,
      progression,
    ),
  }
}
