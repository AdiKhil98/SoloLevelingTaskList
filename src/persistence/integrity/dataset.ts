import {
  err,
  ok,
  type QuestCompletion,
  type QuestOccurrence,
  type QuestTemplate,
  type Result,
  verifySummaryChain,
  type DailySummary,
  type WeeklyGoalBoard,
  type WeeklyRewardClaim,
  type XPTransaction,
} from '@/domain'
import { PersistenceError, type ValidationIssue } from '../errors'
import { validateLedger, type LedgerSummary } from '../ledger/validateLedger'
import { readCompletion } from '../records/completion'
import { readDailySummary } from '../records/dailySummary'
import { readOccurrence } from '../records/occurrence'
import { readPlayerProfile, type PlayerProfileRecord } from '../records/playerProfile'
import {
  IssueCollector,
  isPlainObject,
  joinPath,
  type RecordReader,
} from '../records/readers'
import { readTemplate } from '../records/template'
import { readWeeklyBoard, readWeeklyRewardClaim } from '../records/weeklyBoard'
import { readXpTransaction } from '../records/xpTransaction'

/** Every durable collection, keyed by store name (the `data` of a backup). */
export interface DatasetRecords {
  readonly questTemplates: readonly QuestTemplate[]
  readonly questOccurrences: readonly QuestOccurrence[]
  readonly questCompletions: readonly QuestCompletion[]
  /** In ledger order: the row at index `i` has `seq = i + 1`. */
  readonly xpTransactions: readonly XPTransaction[]
  /** Oldest first: contiguous dates, one per finalized day. */
  readonly dailySummaries: readonly DailySummary[]
  /** Oldest week first; at most one per week. */
  readonly weeklyBoards: readonly WeeklyGoalBoard[]
  /** At most one per week, each for a finalized board. */
  readonly weeklyRewardClaims: readonly WeeklyRewardClaim[]
  /** Zero or one row: row existence means Awakening is complete (schema v5). */
  readonly playerProfile: readonly PlayerProfileRecord[]
}

export interface ValidatedDataset {
  readonly records: DatasetRecords
  readonly ledger: LedgerSummary
}

const COLLECTIONS = [
  'questTemplates',
  'questOccurrences',
  'questCompletions',
  'xpTransactions',
  'dailySummaries',
  'weeklyBoards',
  'weeklyRewardClaims',
  'playerProfile',
] as const

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
 *  - primary keys and unique keys are unique (templates, `seedKey`, `sortOrder`, occurrences
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
  const summaries = readCollection(collector, raw, 'dailySummaries', path, readDailySummary)
  const boards = readCollection(collector, raw, 'weeklyBoards', path, readWeeklyBoard)
  const claims = readCollection(collector, raw, 'weeklyRewardClaims', path, readWeeklyRewardClaim)
  const profiles = readCollection(collector, raw, 'playerProfile', path, readPlayerProfile)
  if (
    !collector.isClean ||
    templates === undefined ||
    occurrences === undefined ||
    completions === undefined ||
    transactions === undefined ||
    summaries === undefined ||
    boards === undefined ||
    claims === undefined ||
    profiles === undefined
  ) {
    return err(collector.issues)
  }

  const at = (collection: (typeof COLLECTIONS)[number]) => joinPath(path, collection)

  findDuplicates(collector, templates, (t) => t.id, at('questTemplates'), 'id', 'duplicate_id')
  findDuplicates(collector, templates, (t) => t.seedKey, at('questTemplates'), 'seedKey', 'duplicate_seed_key')
  findDuplicates(collector, templates, (t) => String(t.sortOrder), at('questTemplates'), 'sortOrder', 'duplicate_sort_order')
  findDuplicates(collector, occurrences, (o) => o.id, at('questOccurrences'), 'id', 'duplicate_id')
  findDuplicates(collector, occurrences, (o) => `${o.templateId}@${o.dateKey}`, at('questOccurrences'), 'dateKey', 'duplicate_occurrence_for_date')
  findDuplicates(collector, completions, (c) => c.occurrenceId, at('questCompletions'), 'occurrenceId', 'duplicate_completion')
  findDuplicates(collector, summaries, (s) => s.dateKey, at('dailySummaries'), 'dateKey', 'duplicate_summary')
  findDuplicates(collector, boards, (b) => b.weekKey, at('weeklyBoards'), 'weekKey', 'duplicate_weekly_board')
  findDuplicates(collector, claims, (c) => c.weekKey, at('weeklyRewardClaims'), 'weekKey', 'duplicate_weekly_claim')
  findDuplicates(collector, profiles, (p) => p.id, at('playerProfile'), 'id', 'duplicate_id')

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

  validateSummaries(collector, summaries, occurrences, completions, at('dailySummaries'))
  validateWeekly(collector, boards, claims, transactions, at('weeklyBoards'), at('weeklyRewardClaims'), at('xpTransactions'))

  if (!collector.isClean || !ledger.ok) return err(collector.issues)
  const byWeek = <T extends { readonly weekKey: string }>(items: readonly T[]): T[] =>
    [...items].sort((a, b) => (a.weekKey < b.weekKey ? -1 : a.weekKey > b.weekKey ? 1 : 0))
  return ok({
    records: {
      questTemplates: templates,
      questOccurrences: occurrences,
      questCompletions: completions,
      xpTransactions: transactions,
      dailySummaries: summaries,
      weeklyBoards: byWeek(boards),
      weeklyRewardClaims: byWeek(claims),
      playerProfile: profiles,
    },
    ledger: ledger.value,
  })
}

/**
 * Rules that span the weekly records and the ledger (DATA_MODEL INV-4, 25):
 *  - a finalized board that paid a bonus has exactly that ledger row (same
 *    week, score and amount), and a board that paid none has no weekly row;
 *  - every weekly ledger row belongs to a finalized board that points back at it;
 *  - a reward claim belongs to a finalized board that earned a tier, and agrees
 *    with that board's frozen tier and text.
 * Completions are deliberately NOT re-counted: a finalized board's snapshot is
 * authoritative and later data never changes it.
 */
function validateWeekly(
  collector: IssueCollector,
  boards: readonly WeeklyGoalBoard[],
  claims: readonly WeeklyRewardClaim[],
  transactions: readonly XPTransaction[],
  boardsPath: string,
  claimsPath: string,
  ledgerPath: string,
): void {
  const boardByWeek = new Map(boards.map((board) => [board.weekKey, board]))
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]))

  boards.forEach((board, index) => {
    const finalization = board.finalization
    if (finalization === null || finalization.xpTransactionId === null) return
    const here = joinPath(joinPath(joinPath(boardsPath, index), 'finalization'), 'xpTransactionId')
    const transaction = transactionById.get(finalization.xpTransactionId)
    if (transaction === undefined) {
      collector.add(here, 'missing_xp_transaction', `No XP transaction "${finalization.xpTransactionId}"`)
    } else if (
      transaction.source.type !== 'weekly_goal_crusher' ||
      transaction.source.weekKey !== board.weekKey ||
      transaction.source.score !== finalization.score ||
      transaction.amount !== finalization.bonusExp
    ) {
      collector.add(here, 'xp_transaction_mismatch', 'The XP transaction disagrees with this board’s finalization')
    }
  })

  transactions.forEach((transaction, index) => {
    if (transaction.source.type !== 'weekly_goal_crusher') return
    const board = boardByWeek.get(transaction.source.weekKey)
    if (board === undefined || board.finalization === null || board.finalization.xpTransactionId !== transaction.id) {
      collector.add(
        joinPath(joinPath(ledgerPath, index), 'source'),
        'missing_weekly_board',
        `No finalized board for week ${transaction.source.weekKey} points at this bonus`,
      )
    }
  })

  claims.forEach((claim, index) => {
    const here = joinPath(claimsPath, index)
    const finalization = boardByWeek.get(claim.weekKey)?.finalization ?? null
    if (finalization === null) {
      collector.add(joinPath(here, 'weekKey'), 'claim_board_not_finalized', `Week ${claim.weekKey} has no finalized board`)
      return
    }
    const tier = finalization.rewardTier
    if (tier === null || tier.minScore !== claim.tierMinScore || tier.text !== claim.rewardTextSnapshot) {
      collector.add(here, 'weekly_claim_mismatch', 'Differs from the reward tier the board froze at finalization')
    }
  })
}

/**
 * Rules of the summary chain and of each summary against the records of its
 * date (DATA_MODEL INV-13, 21, 22): finalized dates are contiguous, every
 * streak value equals the fold of the days before it, a finalized day lists
 * exactly the occurrences that exist for its date and counts exactly its
 * completions, and nothing exists before the first finalized date.
 */
function validateSummaries(
  collector: IssueCollector,
  summaries: readonly DailySummary[],
  occurrences: readonly QuestOccurrence[],
  completions: readonly QuestCompletion[],
  path: string,
): void {
  const ordered = [...summaries].sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
  const indexOf = new Map(summaries.map((summary, index) => [summary.dateKey, index]))
  const pathOf = (summary: DailySummary, field: string) => joinPath(joinPath(path, indexOf.get(summary.dateKey) ?? 0), field)

  for (const problem of verifySummaryChain(ordered)) {
    const summary = ordered[problem.index]
    if (summary !== undefined) collector.add(pathOf(summary, problem.field), problem.code, problem.message)
  }

  const occurrencesByDate = new Map<string, string[]>()
  for (const occurrence of occurrences) {
    const ids = occurrencesByDate.get(occurrence.dateKey) ?? []
    ids.push(occurrence.id)
    occurrencesByDate.set(occurrence.dateKey, ids)
  }
  const completionsByDate = new Map<string, QuestCompletion[]>()
  for (const completion of completions) {
    const list = completionsByDate.get(completion.dateKey) ?? []
    list.push(completion)
    completionsByDate.set(completion.dateKey, list)
  }

  for (const summary of ordered) {
    const ids = [...(occurrencesByDate.get(summary.dateKey) ?? [])].sort()
    const listed = [...summary.occurrenceIds].sort()
    if (ids.length !== listed.length || ids.some((id, i) => id !== listed[i])) {
      collector.add(pathOf(summary, 'occurrenceIds'), 'summary_occurrences_mismatch', 'Differs from the occurrences stored for this date')
    }
    const done = completionsByDate.get(summary.dateKey) ?? []
    if (done.length !== summary.completedCount) {
      collector.add(pathOf(summary, 'completedCount'), 'summary_completions_mismatch', 'Differs from the completions stored for this date')
    }
    if (done.reduce((sum, completion) => sum + completion.expAwarded, 0) !== summary.questExp) {
      collector.add(pathOf(summary, 'questExp'), 'summary_exp_mismatch', 'Differs from the quest EXP of this date')
    }
  }

  const first = ordered[0]
  if (first !== undefined) {
    const early = occurrences.find((occurrence) => occurrence.dateKey < first.dateKey)
    if (early !== undefined) {
      collector.add(pathOf(first, 'dateKey'), 'occurrence_before_chain', 'An occurrence exists before the first finalized date')
    }
  }
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
