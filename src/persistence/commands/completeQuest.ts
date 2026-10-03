import {
  completeQuest,
  type CompletionRejection,
  type EpochMs,
  type QuestCompletion,
  type QuestCompletionOutcome,
} from '@/domain'
import { STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { PersistenceError } from '../errors'
import { readLedgerState } from '../ledger/ledgerTip'
import { parseCompletion } from '../records/completion'
import { parseOccurrence } from '../records/occurrence'
import { parseXpTransaction } from '../records/xpTransaction'
import { parseStored } from '../repositories/stored'

export interface CompleteQuestAtomicallyInput {
  readonly occurrenceId: string
  /** The real instant of completion. Supplied by the caller; never read here. */
  readonly completedAt: EpochMs
  /** IANA zone in which `completedAt` is read to decide the local day. */
  readonly timeZone: string
}

export type AtomicCompletionRejection =
  | CompletionRejection
  | { readonly code: 'occurrence_not_found'; readonly occurrenceId: string }

export type AtomicCompletionResult =
  | ({ readonly status: 'completed' } & QuestCompletionOutcome)
  /** Harmless duplicate: the stored completion, no new records, no EXP, no events. */
  | { readonly status: 'already_completed'; readonly completion: QuestCompletion }
  | { readonly status: 'rejected'; readonly reason: AtomicCompletionRejection }

const COMPLETION_STORES = [STORE.occurrences, STORE.completions, STORE.xpTransactions] as const

/**
 * Completes a quest occurrence atomically.
 *
 * ONE read-write transaction over occurrences, completions and the ledger:
 *  1. load the occurrence and any existing completion;
 *  2. read the ledger tip from the transaction itself (never from the caller);
 *  3. run the Phase 02 `completeQuest` with that authoritative state — its
 *     `seq` (`tip + 1`) and `totalExpAfter` are therefore allocated inside the
 *     transaction, and overlapping read-write transactions are serialized by
 *     IndexedDB, so two tabs cannot allocate the same `seq`;
 *  4. add the completion AND its XP row, or neither: any failure aborts the
 *     transaction and rolls both back.
 *
 * Duplicates are caught twice: by the domain (`existingCompletion`) and by the
 * stores (primary key `occurrenceId`, unique `idempotencyKey` and `seq`).
 */
export async function completeQuestAtomically(
  database: PersistenceDatabase,
  input: CompleteQuestAtomicallyInput,
): Promise<AtomicCompletionResult> {
  try {
    return await runTransaction(database, COMPLETION_STORES, 'readwrite', (transaction) =>
      attemptCompletion(transaction, input),
    )
  } catch (error) {
    if (error instanceof PersistenceError && error.code === 'constraint_violation') {
      return resolveConstraintConflict(database, input.occurrenceId, error)
    }
    throw error
  }
}

async function attemptCompletion(
  transaction: IDBTransaction,
  input: CompleteQuestAtomicallyInput,
): Promise<AtomicCompletionResult> {
  const occurrences = transaction.objectStore(STORE.occurrences)
  const completions = transaction.objectStore(STORE.completions)
  const ledger = transaction.objectStore(STORE.xpTransactions)

  const rawOccurrence = await requestToPromise(occurrences.get(input.occurrenceId))
  if (rawOccurrence === undefined) {
    return {
      status: 'rejected',
      reason: { code: 'occurrence_not_found', occurrenceId: input.occurrenceId },
    }
  }
  const occurrence = parseStored(parseOccurrence, rawOccurrence, `quest occurrence "${input.occurrenceId}"`)

  const rawCompletion = await requestToPromise(completions.get(occurrence.id))
  const existingCompletion =
    rawCompletion === undefined
      ? null
      : parseStored(parseCompletion, rawCompletion, `quest completion "${occurrence.id}"`)

  if (existingCompletion !== null) {
    // A completion without its XP row would break INV-24; report it, never mask it.
    await requireXpRow(ledger, existingCompletion)
  }

  const state = await readLedgerState(transaction)
  const result = completeQuest({
    occurrence,
    existingCompletion,
    ledger: state,
    completedAt: input.completedAt,
    timeZone: input.timeZone,
  })
  if (result.status !== 'completed') return result

  // Order is irrelevant: both writes live and die together.
  await requestToPromise(completions.add(result.completion))
  await requestToPromise(ledger.add(result.xpTransaction))
  return result
}

async function requireXpRow(
  ledger: IDBObjectStore,
  completion: QuestCompletion,
): Promise<void> {
  const raw = await requestToPromise(ledger.get(completion.xpTransactionId))
  const row = raw === undefined ? null : parseStored(parseXpTransaction, raw, `XP transaction "${completion.xpTransactionId}"`)
  if (
    row === null ||
    row.source.type !== 'quest_completion' ||
    row.source.occurrenceId !== completion.occurrenceId ||
    row.amount !== completion.expAwarded
  ) {
    throw new PersistenceError(
      'ledger_integrity_failed',
      `Completion "${completion.occurrenceId}" exists without a matching XP transaction`,
    )
  }
}

/**
 * A write hit a uniqueness constraint (the transaction has been rolled back).
 * The only constraint conflict that is a harmless duplicate is one where the
 * stored state PROVES the occurrence is already completed: a valid completion
 * AND its matching XP row are stored. Anything else is corrupt or unexpected
 * state and is reported as an integrity error, never reinterpreted as success.
 *
 * @internal Exported for tests.
 */
export async function resolveConstraintConflict(
  database: PersistenceDatabase,
  occurrenceId: string,
  conflict: PersistenceError,
): Promise<AtomicCompletionResult> {
  const stored = await runTransaction(
    database,
    [STORE.completions, STORE.xpTransactions],
    'readonly',
    async (transaction) => {
      const raw = await requestToPromise(transaction.objectStore(STORE.completions).get(occurrenceId))
      if (raw === undefined) return null
      const completion = parseStored(parseCompletion, raw, `quest completion "${occurrenceId}"`)
      await requireXpRow(transaction.objectStore(STORE.xpTransactions), completion)
      return completion
    },
  )
  if (stored === null) {
    throw new PersistenceError(
      'ledger_integrity_failed',
      `Completing "${occurrenceId}" hit a uniqueness conflict, but no completion is stored for it; ` +
        'the ledger holds data that conflicts with this occurrence',
      { cause: conflict },
    )
  }
  return { status: 'already_completed', completion: stored }
}
