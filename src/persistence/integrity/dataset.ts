import {
  err,
  ok,
  type QuestCompletion,
  type QuestOccurrence,
  type QuestTemplate,
  type Result,
  type XPTransaction,
} from '@/domain'
import { PersistenceError, type ValidationIssue } from '../errors'
import { validateLedger, type LedgerSummary } from '../ledger/validateLedger'
import { readCompletion } from '../records/completion'
import { readOccurrence } from '../records/occurrence'
import {
  IssueCollector,
  isPlainObject,
  joinPath,
  type RecordReader,
} from '../records/readers'
import { readTemplate } from '../records/template'
import { readXpTransaction } from '../records/xpTransaction'

/** Every durable collection, keyed by store name (the `data` of a backup). */
export interface DatasetRecords {
  readonly questTemplates: readonly QuestTemplate[]
  readonly questOccurrences: readonly QuestOccurrence[]
  readonly questCompletions: readonly QuestCompletion[]
  /** In ledger order: the row at index `i` has `seq = i + 1`. */
  readonly xpTransactions: readonly XPTransaction[]
}

export interface ValidatedDataset {
  readonly records: DatasetRecords
  readonly ledger: LedgerSummary
}

const COLLECTIONS = ['questTemplates', 'questOccurrences', 'questCompletions', 'xpTransactions'] as const

function readCollection<T>(
  collector: IssueCollector,
  source: Record<string, unknown>,
  key: string,
  path: string,
  read: RecordReader<T>,
): T[] | undefined {
  const at = joinPath(path, key)
  const value = source[key]
  if (!Array.isArray(value)) {
    collector.add(at, 'not_an_array', 'Expected an array')
    return undefined
  }
  const records: T[] = []
  let clean = true
  value.forEach((item: unknown, index) => {
    const record = read(collector, item, joinPath(at, index))
    if (record === undefined) clean = false
    else records.push(record)
  })
  return clean ? records : undefined
}

function findDuplicates<T>(
  collector: IssueCollector,
  items: readonly T[],
  keyOf: (item: T) => string | null,
  path: string,
  field: string,
  code: string,
): void {
  const seen = new Set<string>()
  items.forEach((item, index) => {
    const key = keyOf(item)
    if (key === null) return
    if (seen.has(key)) {
      collector.add(joinPath(joinPath(path, index), field), code, `"${key}" appears more than once`)
    }
    seen.add(key)
  })
}

/**
 * Validates a whole dataset: every record's shape, then every rule that spans
 * records. This is the single gate used by backup import, backup export and
 * `verifyDatabaseIntegrity`, so the rules exist exactly once.
 *
 * Cross-record rules (DATA_MODEL INV-1…8, 24):
 *  - primary keys and unique keys are unique (templates, `seedKey`, occurrences
 *    including `(templateId, dateKey)`, completions);
 *  - each completion refers to an imported occurrence and agrees with it
 *    (template, date, category, EXP);
 *  - each completion's XP row exists and agrees (source, amount, category,
 *    effective date), and each quest XP row has its completion;
 *  - the ledger chain is intact (`validateLedger`).
 *
 * `templateId` on occurrences and completions is an informational historical
 * reference, NOT a foreign key: a template may be missing and the history is
 * still valid. (The repository only soft-archives templates, so this only
 * matters for foreign or hand-edited data.)
 */
export function validateDataset(
  raw: unknown,
  path = 'data',
): Result<ValidatedDataset, readonly ValidationIssue[]> {
  const collector = new IssueCollector()
  if (!isPlainObject(raw)) {
    collector.add(path, 'not_an_object', 'Expected an object')
    return err(collector.issues)
  }
  for (const key of Object.keys(raw)) {
    if (!(COLLECTIONS as readonly string[]).includes(key)) {
      collector.add(joinPath(path, key), 'unexpected_field', `Unexpected collection "${key}"`)
    }
  }

  const templates = readCollection(collector, raw, 'questTemplates', path, readTemplate)
  const occurrences = readCollection(collector, raw, 'questOccurrences', path, readOccurrence)
  const completions = readCollection(collector, raw, 'questCompletions', path, readCompletion)
  const transactions = readCollection(collector, raw, 'xpTransactions', path, readXpTransaction)
  if (
    !collector.isClean ||
    templates === undefined ||
    occurrences === undefined ||
    completions === undefined ||
    transactions === undefined
  ) {
    return err(collector.issues)
  }

  const at = (collection: (typeof COLLECTIONS)[number]) => joinPath(path, collection)

  findDuplicates(collector, templates, (t) => t.id, at('questTemplates'), 'id', 'duplicate_id')
  findDuplicates(collector, templates, (t) => t.seedKey, at('questTemplates'), 'seedKey', 'duplicate_seed_key')
  findDuplicates(collector, occurrences, (o) => o.id, at('questOccurrences'), 'id', 'duplicate_id')
  findDuplicates(collector, occurrences, (o) => `${o.templateId}@${o.dateKey}`, at('questOccurrences'), 'dateKey', 'duplicate_occurrence_for_date')
  findDuplicates(collector, completions, (c) => c.occurrenceId, at('questCompletions'), 'occurrenceId', 'duplicate_completion')

  const ledger = validateLedger(transactions, at('xpTransactions'))
  if (!ledger.ok) ledger.error.forEach((issue) => collector.add(issue.path, issue.code, issue.message))

  const occurrenceById = new Map(occurrences.map((o) => [o.id, o]))
  const transactionById = new Map(transactions.map((t) => [t.id, t]))
  const completionByOccurrence = new Map(completions.map((c) => [c.occurrenceId, c]))

  completions.forEach((completion, index) => {
    const here = joinPath(at('questCompletions'), index)
    const occurrence = occurrenceById.get(completion.occurrenceId)
    if (occurrence === undefined) {
      collector.add(joinPath(here, 'occurrenceId'), 'missing_occurrence', `No occurrence "${completion.occurrenceId}"`)
    } else {
      if (completion.templateId !== occurrence.templateId) {
        collector.add(joinPath(here, 'templateId'), 'completion_template_mismatch', 'Differs from its occurrence')
      }
      if (completion.dateKey !== occurrence.dateKey) {
        collector.add(joinPath(here, 'dateKey'), 'completion_date_mismatch', 'Differs from its occurrence')
      }
      if (completion.category !== occurrence.snapshot.category) {
        collector.add(joinPath(here, 'category'), 'completion_category_mismatch', 'Differs from its occurrence')
      }
      if (completion.expAwarded !== occurrence.snapshot.expReward) {
        collector.add(joinPath(here, 'expAwarded'), 'completion_exp_mismatch', 'Differs from its occurrence snapshot')
      }
    }

    const transaction = transactionById.get(completion.xpTransactionId)
    if (transaction === undefined) {
      collector.add(joinPath(here, 'xpTransactionId'), 'missing_xp_transaction', `No XP transaction "${completion.xpTransactionId}"`)
    } else if (
      transaction.source.type !== 'quest_completion' ||
      transaction.source.occurrenceId !== completion.occurrenceId ||
      transaction.amount !== completion.expAwarded ||
      transaction.category !== completion.category ||
      transaction.effectiveDate !== completion.dateKey
    ) {
      collector.add(joinPath(here, 'xpTransactionId'), 'xp_transaction_mismatch', 'The XP transaction disagrees with this completion')
    }
  })

  transactions.forEach((transaction, index) => {
    if (transaction.source.type !== 'quest_completion') return
    const completion = completionByOccurrence.get(transaction.source.occurrenceId)
    if (completion === undefined || completion.xpTransactionId !== transaction.id) {
      collector.add(
        joinPath(joinPath(at('xpTransactions'), index), 'source'),
        'missing_completion',
        `No completion "${transaction.source.occurrenceId}" for this quest XP`,
      )
    }
  })

  if (!collector.isClean || !ledger.ok) return err(collector.issues)
  return ok({
    records: {
      questTemplates: templates,
      questOccurrences: occurrences,
      questCompletions: completions,
      xpTransactions: transactions,
    },
    ledger: ledger.value,
  })
}

/**
 * The typed error for a dataset that failed validation: `ledger_integrity_failed`
 * when the ledger or a ledger-linked rule is involved, otherwise
 * `record_validation_failed`. The issues travel with the error.
 */
export function datasetFailure(issues: readonly ValidationIssue[], message: string): PersistenceError {
  const ledgerRelated = issues.some(
    (issue) => issue.path.includes('xpTransactions') || issue.code.startsWith('missing_') || issue.code.startsWith('xp_'),
  )
  return new PersistenceError(ledgerRelated ? 'ledger_integrity_failed' : 'record_validation_failed', message, { issues })
}
