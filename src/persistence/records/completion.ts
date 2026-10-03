import {
  isCategory,
  occurrenceIdOf,
  questCompletionTransactionId,
  type QuestCompletion,
} from '@/domain'
import {
  joinPath,
  parserFor,
  readDateKey,
  readEnum,
  readObject,
  readSafeInteger,
  readString,
  type RecordReader,
} from './readers'

const REQUIRED = [
  'occurrenceId',
  'templateId',
  'dateKey',
  'category',
  'expAwarded',
  'completedAt',
  'utcOffsetMinutes',
  'timeZone',
  'xpTransactionId',
] as const

const MAX_UTC_OFFSET_MINUTES = 24 * 60

/**
 * Reads an untrusted value as a `QuestCompletion`.
 *
 * The local date implied by `completedAt` + `timeZone` is deliberately not
 * recomputed here: it depends on the runtime's time-zone database, and a
 * legitimate backup must never be rejected because a browser's tz data differs.
 * The domain command enforces it at write time; `timeZone` is audit-only.
 */
export const readCompletion: RecordReader<QuestCompletion> = (collector, value, path) => {
  const source = readObject(collector, value, path, REQUIRED)
  if (source === undefined) return undefined

  const before = collector.issues.length
  const occurrenceId = readString(collector, source, 'occurrenceId', path)
  const templateId = readString(collector, source, 'templateId', path)
  const dateKey = readDateKey(collector, source, 'dateKey', path)
  const category = readEnum(collector, source, 'category', path, isCategory, 'a category')
  const expAwarded = readSafeInteger(collector, source, 'expAwarded', path, { min: 1 })
  const completedAt = readSafeInteger(collector, source, 'completedAt', path)
  const utcOffsetMinutes = readSafeInteger(collector, source, 'utcOffsetMinutes', path, {
    min: -MAX_UTC_OFFSET_MINUTES,
    max: MAX_UTC_OFFSET_MINUTES,
  })
  const timeZone = readString(collector, source, 'timeZone', path)
  const xpTransactionId = readString(collector, source, 'xpTransactionId', path)

  if (
    collector.issues.length > before ||
    occurrenceId === undefined ||
    templateId === undefined ||
    dateKey === undefined ||
    category === undefined ||
    expAwarded === undefined ||
    completedAt === undefined ||
    utcOffsetMinutes === undefined ||
    timeZone === undefined ||
    xpTransactionId === undefined
  ) {
    return undefined
  }

  if (occurrenceId !== occurrenceIdOf(templateId, dateKey)) {
    collector.add(joinPath(path, 'occurrenceId'), 'occurrence_id_mismatch', 'Must equal occ:{templateId}@{dateKey}')
    return undefined
  }
  if (xpTransactionId !== questCompletionTransactionId(occurrenceId)) {
    collector.add(joinPath(path, 'xpTransactionId'), 'xp_transaction_id_mismatch', 'Must be the deterministic transaction id of this occurrence')
    return undefined
  }
  return {
    occurrenceId,
    templateId,
    dateKey,
    category,
    expAwarded,
    completedAt,
    utcOffsetMinutes,
    timeZone,
    xpTransactionId,
  }
}

export const parseCompletion = parserFor(readCompletion)
