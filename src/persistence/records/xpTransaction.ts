import {
  addDays,
  isCategory,
  isoWeekday,
  occurrenceIdOf,
  questCompletionIdempotencyKey,
  questCompletionTransactionId,
  type Category,
  type DateKey,
  type XPSource,
  type XPTransaction,
} from '@/domain'
import {
  IssueCollector,
  joinPath,
  parserFor,
  readDateKey,
  readNullableDateKey,
  readObject,
  readSafeInteger,
  readString,
  type RecordReader,
} from './readers'

const REQUIRED = [
  'id',
  'seq',
  'idempotencyKey',
  'source',
  'amount',
  'category',
  'createdAt',
  'effectiveDate',
  'sourceWeekKey',
  'totalExpAfter',
] as const

const MIN_WEEKLY_SCORE = 6
const MAX_WEEKLY_SCORE = 10

export const WEEKLY_IDEMPOTENCY_PREFIX = 'weekly_goal_crusher:'

/** The Sunday of the week starting at `weekKey`, or null past the last supported date. */
function sundayOf(weekKey: DateKey): DateKey | null {
  try {
    return addDays(weekKey, 6)
  } catch {
    return null
  }
}

function readSource(
  collector: IssueCollector,
  value: unknown,
  path: string,
): XPSource | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    collector.add(path, 'not_an_object', 'Expected an object')
    return undefined
  }
  const type = (value as Record<string, unknown>).type
  if (type === 'quest_completion') {
    const source = readObject(collector, value, path, ['type', 'occurrenceId', 'templateId'])
    if (source === undefined) return undefined
    const before = collector.issues.length
    const occurrenceId = readString(collector, source, 'occurrenceId', path)
    const templateId = readString(collector, source, 'templateId', path)
    if (collector.issues.length > before || occurrenceId === undefined || templateId === undefined) {
      return undefined
    }
    return { type: 'quest_completion', occurrenceId, templateId }
  }
  if (type === 'weekly_goal_crusher') {
    const source = readObject(collector, value, path, ['type', 'weekKey', 'score'])
    if (source === undefined) return undefined
    const before = collector.issues.length
    const weekKey = readDateKey(collector, source, 'weekKey', path)
    const score = readSafeInteger(collector, source, 'score', path, {
      min: MIN_WEEKLY_SCORE,
      max: MAX_WEEKLY_SCORE,
    })
    if (collector.issues.length > before || weekKey === undefined || score === undefined) {
      return undefined
    }
    if (isoWeekday(weekKey) !== 1) {
      collector.add(joinPath(path, 'weekKey'), 'week_key_not_monday', 'A week key must be a Monday')
      return undefined
    }
    return { type: 'weekly_goal_crusher', weekKey, score }
  }
  collector.add(joinPath(path, 'type'), 'unknown_source_type', 'Unknown XP source type')
  return undefined
}

/**
 * Reads an untrusted value as an `XPTransaction` and checks everything that
 * can be decided from the row alone (DATA_MODEL §6, INV-3/5/8/25). Chain
 * properties across rows (`seq`, `totalExpAfter`) belong to `validateLedger`.
 */
export const readXpTransaction: RecordReader<XPTransaction> = (collector, value, path) => {
  const source = readObject(collector, value, path, REQUIRED)
  if (source === undefined) return undefined

  const before = collector.issues.length
  const id = readString(collector, source, 'id', path)
  const seq = readSafeInteger(collector, source, 'seq', path, { min: 1 })
  const idempotencyKey = readString(collector, source, 'idempotencyKey', path)
  const amount = readSafeInteger(collector, source, 'amount', path, { min: 1 })
  const createdAt = readSafeInteger(collector, source, 'createdAt', path)
  const effectiveDate = readDateKey(collector, source, 'effectiveDate', path)
  const sourceWeekKey = readNullableDateKey(collector, source, 'sourceWeekKey', path)
  const totalExpAfter = readSafeInteger(collector, source, 'totalExpAfter', path, { min: 1 })
  const xpSource = readSource(collector, source.source, joinPath(path, 'source'))

  let category: Category | null | undefined
  if (source.category === null) {
    category = null
  } else if (isCategory(source.category)) {
    category = source.category
  } else {
    collector.add(joinPath(path, 'category'), 'invalid_value', 'Expected a category or null')
  }

  if (
    collector.issues.length > before ||
    id === undefined ||
    seq === undefined ||
    idempotencyKey === undefined ||
    amount === undefined ||
    createdAt === undefined ||
    effectiveDate === undefined ||
    sourceWeekKey === undefined ||
    totalExpAfter === undefined ||
    xpSource === undefined ||
    category === undefined
  ) {
    return undefined
  }

  if (totalExpAfter < amount) {
    collector.add(joinPath(path, 'totalExpAfter'), 'total_exp_below_amount', 'Running total cannot be smaller than this amount')
    return undefined
  }

  if (xpSource.type === 'quest_completion') {
    const key = questCompletionIdempotencyKey(xpSource.occurrenceId)
    if (idempotencyKey !== key) {
      collector.add(joinPath(path, 'idempotencyKey'), 'idempotency_key_mismatch', 'Must be quest_completion:{occurrenceId}')
    }
    if (id !== questCompletionTransactionId(xpSource.occurrenceId)) {
      collector.add(joinPath(path, 'id'), 'transaction_id_mismatch', 'Must be xp:quest_completion:{occurrenceId}')
    }
    if (xpSource.occurrenceId !== occurrenceIdOf(xpSource.templateId, effectiveDate)) {
      collector.add(joinPath(path, 'source'), 'source_occurrence_mismatch', 'Occurrence id must match template and effective date')
    }
    if (category === null) {
      collector.add(joinPath(path, 'category'), 'category_required', 'Quest EXP must carry a category')
    }
    if (sourceWeekKey !== null) {
      collector.add(joinPath(path, 'sourceWeekKey'), 'source_week_key_not_allowed', 'Quest EXP has no source week')
    }
  } else {
    if (idempotencyKey !== `${WEEKLY_IDEMPOTENCY_PREFIX}${xpSource.weekKey}`) {
      collector.add(joinPath(path, 'idempotencyKey'), 'idempotency_key_mismatch', 'Must be weekly_goal_crusher:{weekKey}')
    }
    if (category !== null) {
      collector.add(joinPath(path, 'category'), 'category_not_allowed', 'Weekly bonus EXP has no category')
    }
    if (sourceWeekKey !== xpSource.weekKey) {
      collector.add(joinPath(path, 'sourceWeekKey'), 'source_week_key_mismatch', 'Must equal the source week key')
    }
    if (effectiveDate !== sundayOf(xpSource.weekKey)) {
      collector.add(joinPath(path, 'effectiveDate'), 'effective_date_mismatch', 'Must be the Sunday of the source week')
    }
  }
  if (collector.issues.length > before) return undefined

  return {
    id,
    seq,
    idempotencyKey,
    source: xpSource,
    amount,
    category,
    createdAt,
    effectiveDate,
    sourceWeekKey,
    totalExpAfter,
  }
}

export const parseXpTransaction = parserFor(readXpTransaction)
