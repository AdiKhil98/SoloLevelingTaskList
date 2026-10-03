import {
  createOccurrence,
  occurrenceIdOf,
  type DateKey,
  type EpochMs,
  type OccurrenceError,
  type QuestOccurrence,
  type QuestTemplate,
  type Result,
  err,
  ok,
} from '@/domain'
import { canonicalEquals } from '../canonical'
import { INDEX, STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { PersistenceError } from '../errors'
import { parseOccurrence } from '../records/occurrence'
import { parseForWrite, parseStored } from './stored'

/**
 * Occurrences are historical snapshots and insert-only: there is no update
 * or delete here. A stored occurrence is always returned as stored, never
 * rebuilt from the current template.
 */

export interface StoredOccurrence {
  readonly occurrence: QuestOccurrence
  /** False when the snapshot already existed and was returned unchanged. */
  readonly created: boolean
}

/**
 * Stores a snapshot. If one with the same id already exists and is identical,
 * it is returned (`created: false`); if it differs, the write is refused with
 * `constraint_violation`, so two contradictory snapshots can never coexist.
 */
export async function insertOccurrence(database: PersistenceDatabase, occurrence: QuestOccurrence): Promise<StoredOccurrence> {
  const valid = parseForWrite(parseOccurrence, occurrence, 'quest occurrence')
  return runTransaction(database, [STORE.occurrences], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(STORE.occurrences)
    const existing = await requestToPromise(store.get(valid.id))
    if (existing !== undefined) {
      const stored = parseStored(parseOccurrence, existing, `quest occurrence "${valid.id}"`)
      if (!canonicalEquals(stored, valid)) {
        throw new PersistenceError(
          'constraint_violation',
          `Occurrence "${valid.id}" already exists with a different snapshot`,
        )
      }
      return { occurrence: stored, created: false }
    }
    await requestToPromise(store.add(valid))
    return { occurrence: valid, created: true }
  })
}

/**
 * Returns the persisted occurrence of `template` on `dateKey`, creating it
 * with the Phase 02 factory if none exists. An existing snapshot always wins:
 * later template edits never change it. Returns the domain's
 * `OccurrenceError` if the template is not eligible that day.
 */
export async function ensureOccurrence(
  database: PersistenceDatabase,
  template: QuestTemplate,
  dateKey: DateKey,
  materializedAt: EpochMs,
): Promise<Result<StoredOccurrence, OccurrenceError>> {
  return runTransaction(database, [STORE.occurrences], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(STORE.occurrences)
    const id = occurrenceIdOf(template.id, dateKey)
    const existing = await requestToPromise(store.get(id))
    if (existing !== undefined) {
      return ok({ occurrence: parseStored(parseOccurrence, existing, `quest occurrence "${id}"`), created: false })
    }
    const built = createOccurrence(template, dateKey, materializedAt)
    if (!built.ok) return err(built.error)
    const valid = parseForWrite(parseOccurrence, built.value, 'quest occurrence')
    await requestToPromise(store.add(valid))
    return ok({ occurrence: valid, created: true })
  })
}

export async function getOccurrence(database: PersistenceDatabase, occurrenceId: string): Promise<QuestOccurrence | null> {
  const raw = await runTransaction(database, [STORE.occurrences], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.occurrences).get(occurrenceId)),
  )
  return raw === undefined ? null : parseStored(parseOccurrence, raw, `quest occurrence "${occurrenceId}"`)
}

/** The occurrence of a template on a date (by its deterministic id), or null. */
export function getOccurrenceFor(database: PersistenceDatabase, templateId: string, dateKey: DateKey): Promise<QuestOccurrence | null> {
  return getOccurrence(database, occurrenceIdOf(templateId, dateKey))
}

/** Every occurrence on a date, ordered by id. */
export async function listOccurrencesByDate(database: PersistenceDatabase, dateKey: DateKey): Promise<readonly QuestOccurrence[]> {
  const raw = await runTransaction(database, [STORE.occurrences], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.occurrences).index(INDEX.occurrences.dateKey).getAll(dateKey)),
  )
  return raw.map((value, index) => parseStored(parseOccurrence, value, `quest occurrence [${index}]`))
}

/** Every occurrence of a template, ordered by date (equal index keys sort by id = by date). */
export async function listOccurrencesByTemplate(database: PersistenceDatabase, templateId: string): Promise<readonly QuestOccurrence[]> {
  const raw = await runTransaction(database, [STORE.occurrences], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.occurrences).index(INDEX.occurrences.templateId).getAll(templateId)),
  )
  return raw.map((value, index) => parseStored(parseOccurrence, value, `quest occurrence [${index}]`))
}
