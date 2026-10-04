import {
  isCategory,
  isDifficulty,
  validateQuestTemplate,
  validateRecurrence,
  type QuestTemplate,
} from '@/domain'
import { canonicalEquals } from '../canonical'
import {
  joinPath,
  parserFor,
  readDateKey,
  readEnum,
  readNullableDateKey,
  readNullableString,
  readObject,
  readSafeInteger,
  readString,
  type RecordReader,
} from './readers'

const REQUIRED = [
  'id',
  'title',
  'difficulty',
  'category',
  'recurrence',
  'role',
  'seedKey',
  'activeFrom',
  'activeUntil',
  'status',
  'sortOrder',
  'revision',
  'createdAt',
  'updatedAt',
] as const

const isRole = (value: unknown): value is QuestTemplate['role'] =>
  value === 'standard' || value === 'sleep'

const isStatus = (value: unknown): value is QuestTemplate['status'] =>
  value === 'active' || value === 'archived'

/**
 * Reads an untrusted value as a `QuestTemplate`: structure first, then the
 * Phase 02 template rules (active period, recurrence, one-time bounds).
 */
export const readTemplate: RecordReader<QuestTemplate> = (collector, value, path) => {
  const source = readObject(collector, value, path, REQUIRED, ['description'])
  if (source === undefined) return undefined

  const before = collector.issues.length
  const id = readString(collector, source, 'id', path)
  const title = readString(collector, source, 'title', path)
  const difficulty = readEnum(collector, source, 'difficulty', path, isDifficulty, 'a difficulty (E–S)')
  const category = readEnum(collector, source, 'category', path, isCategory, 'a category')
  const role = readEnum(collector, source, 'role', path, isRole, '"standard" or "sleep"')
  const status = readEnum(collector, source, 'status', path, isStatus, '"active" or "archived"')
  const seedKey = readNullableString(collector, source, 'seedKey', path)
  const activeFrom = readDateKey(collector, source, 'activeFrom', path)
  const activeUntil = readNullableDateKey(collector, source, 'activeUntil', path)
  const sortOrder = readSafeInteger(collector, source, 'sortOrder', path)
  const revision = readSafeInteger(collector, source, 'revision', path)
  const createdAt = readSafeInteger(collector, source, 'createdAt', path)
  const updatedAt = readSafeInteger(collector, source, 'updatedAt', path)

  let description: string | undefined
  if (source.description !== undefined) {
    description = readString(collector, source, 'description', path, { allowEmpty: true })
  }

  const recurrencePath = joinPath(path, 'recurrence')
  const recurrence = validateRecurrence(source.recurrence)
  if (!recurrence.ok) {
    collector.add(recurrencePath, `recurrence_${recurrence.error.code}`, 'Invalid recurrence')
  } else if (!canonicalEquals(recurrence.value, source.recurrence)) {
    collector.add(recurrencePath, 'unexpected_field', 'Recurrence has unexpected fields')
  }

  if (
    collector.issues.length > before ||
    id === undefined ||
    title === undefined ||
    difficulty === undefined ||
    category === undefined ||
    role === undefined ||
    status === undefined ||
    seedKey === undefined ||
    activeFrom === undefined ||
    activeUntil === undefined ||
    sortOrder === undefined ||
    revision === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    !recurrence.ok
  ) {
    return undefined
  }

  const template: QuestTemplate = {
    id,
    title,
    ...(description === undefined ? {} : { description }),
    difficulty,
    category,
    recurrence: recurrence.value,
    role,
    seedKey,
    activeFrom,
    activeUntil,
    status,
    sortOrder,
    revision,
    createdAt,
    updatedAt,
  }

  const semantic = validateQuestTemplate(template)
  if (!semantic.ok) {
    collector.add(path, `template_${semantic.error.code}`, 'Template violates the quest rules')
    return undefined
  }
  return template
}

export const parseTemplate = parserFor(readTemplate)
