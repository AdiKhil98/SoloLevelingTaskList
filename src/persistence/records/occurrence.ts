import {
  isCategory,
  isDifficulty,
  occurrenceIdOf,
  type QuestOccurrence,
  type QuestRecurrenceKind,
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
  'id',
  'templateId',
  'dateKey',
  'templateRevision',
  'snapshot',
  'materializedAt',
] as const

const SNAPSHOT_FIELDS = [
  'title',
  'difficulty',
  'category',
  'expReward',
  'role',
  'recurrenceKind',
] as const

const isRole = (value: unknown): value is QuestOccurrence['snapshot']['role'] =>
  value === 'standard' || value === 'sleep'

const RECURRENCE_KINDS: readonly string[] = ['daily', 'weekdays', 'interval', 'one_time']
const isRecurrenceKind = (value: unknown): value is QuestRecurrenceKind =>
  typeof value === 'string' && RECURRENCE_KINDS.includes(value)

/**
 * Reads an untrusted value as a `QuestOccurrence`.
 *
 * `snapshot.expReward` is only required to be a positive safe integer: it is
 * deliberately NOT compared with today's `DIFFICULTY_EXP`, because a snapshot
 * records what the quest was worth when it was materialized.
 */
export const readOccurrence: RecordReader<QuestOccurrence> = (collector, value, path) => {
  const source = readObject(collector, value, path, REQUIRED)
  if (source === undefined) return undefined

  const before = collector.issues.length
  const id = readString(collector, source, 'id', path)
  const templateId = readString(collector, source, 'templateId', path)
  const dateKey = readDateKey(collector, source, 'dateKey', path)
  const templateRevision = readSafeInteger(collector, source, 'templateRevision', path)
  const materializedAt = readSafeInteger(collector, source, 'materializedAt', path)

  const snapshotPath = joinPath(path, 'snapshot')
  const snapshotSource = readObject(collector, source.snapshot, snapshotPath, SNAPSHOT_FIELDS)
  let snapshot: QuestOccurrence['snapshot'] | undefined
  if (snapshotSource !== undefined) {
    const title = readString(collector, snapshotSource, 'title', snapshotPath)
    const difficulty = readEnum(collector, snapshotSource, 'difficulty', snapshotPath, isDifficulty, 'a difficulty (E–S)')
    const category = readEnum(collector, snapshotSource, 'category', snapshotPath, isCategory, 'a category')
    const expReward = readSafeInteger(collector, snapshotSource, 'expReward', snapshotPath, { min: 1 })
    const role = readEnum(collector, snapshotSource, 'role', snapshotPath, isRole, '"standard" or "sleep"')
    const recurrenceKind = readEnum(collector, snapshotSource, 'recurrenceKind', snapshotPath, isRecurrenceKind, 'a recurrence kind')
    if (
      title !== undefined &&
      difficulty !== undefined &&
      category !== undefined &&
      expReward !== undefined &&
      role !== undefined &&
      recurrenceKind !== undefined
    ) {
      snapshot = { title, difficulty, category, expReward, role, recurrenceKind }
    }
  }

  if (
    collector.issues.length > before ||
    id === undefined ||
    templateId === undefined ||
    dateKey === undefined ||
    templateRevision === undefined ||
    materializedAt === undefined ||
    snapshot === undefined
  ) {
    return undefined
  }

  if (id !== occurrenceIdOf(templateId, dateKey)) {
    collector.add(joinPath(path, 'id'), 'occurrence_id_mismatch', 'Must equal occ:{templateId}@{dateKey}')
    return undefined
  }
  return { id, templateId, dateKey, templateRevision, snapshot, materializedAt }
}

export const parseOccurrence = parserFor(readOccurrence)
