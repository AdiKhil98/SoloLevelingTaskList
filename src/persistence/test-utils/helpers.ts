import { IDBFactory } from 'fake-indexeddb'
import {
  asDateKey,
  createOccurrence,
  type DateKey,
  type QuestOccurrence,
  type QuestTemplate,
} from '@/domain'
import type { StoreName } from '../config'
import { openDatabase, type PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'

/** Test-only helpers. Not part of the public persistence API. */

export const ZONE = 'Europe/Berlin'

export const d = (key: string): DateKey => asDateKey(key)

/** A Berlin-midday instant on `dateKey` (UTC 10:00 is 11:00 or 12:00 in Berlin). */
export function noonOn(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day, 10, 0, 0)
}

/**
 * Every template built here gets its own `sortOrder` by default (the dataset
 * integrity check rejects a repeat); pass `sortOrder` to place one deliberately.
 */
let nextSortOrder = 0

export function buildTemplate(overrides: Partial<QuestTemplate> = {}): QuestTemplate {
  return {
    id: 'tpl_test',
    title: 'Test quest',
    difficulty: 'C',
    category: 'discipline',
    recurrence: { kind: 'daily' },
    role: 'standard',
    seedKey: null,
    activeFrom: d('2026-01-01'),
    activeUntil: null,
    status: 'active',
    sortOrder: nextSortOrder++,
    revision: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}

/** A template that has not been placed in the manual order yet (what `appendTemplate` takes; also a Phase 08 row). */
export function buildUnplacedTemplate(overrides: Partial<QuestTemplate> = {}): Omit<QuestTemplate, 'sortOrder'> {
  return withoutSortOrder(buildTemplate(overrides))
}

/** A copy of a stored template without its `sortOrder`. */
export function withoutSortOrder<T extends { sortOrder?: unknown }>(row: T): Omit<T, 'sortOrder'> {
  const copy = { ...row }
  delete copy.sortOrder
  return copy
}

export function buildOccurrence(
  overrides: Partial<QuestTemplate> = {},
  dateKey: DateKey = d('2026-10-03'),
): QuestOccurrence {
  const result = createOccurrence(buildTemplate(overrides), dateKey, 2_000)
  if (!result.ok) throw new Error(`Test occurrence is not eligible: ${result.error.code}`)
  return result.value
}

export function newFactory(): IDBFactory {
  return new IDBFactory()
}

/** A fresh, isolated in-memory database. Close it in `afterEach`. */
export async function openTestDatabase(
  factory: IDBFactory = newFactory(),
  name?: string,
): Promise<PersistenceDatabase> {
  return openDatabase({ factory, ...(name === undefined ? {} : { name }) })
}

/** Reads every raw record from a store, bypassing repositories and validation. */
export function readRaw(database: PersistenceDatabase, store: StoreName): Promise<unknown[]> {
  return runTransaction(database, [store], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(store).getAll()),
  )
}

/** Writes a raw value into a store, bypassing every check (to plant corrupt data). */
export function writeRaw(database: PersistenceDatabase, store: StoreName, value: unknown): Promise<unknown> {
  return runTransaction(database, [store], 'readwrite', (transaction) =>
    requestToPromise(transaction.objectStore(store).put(value)),
  )
}

export function deleteRaw(database: PersistenceDatabase, store: StoreName, key: string): Promise<unknown> {
  return runTransaction(database, [store], 'readwrite', (transaction) =>
    requestToPromise(transaction.objectStore(store).delete(key)),
  )
}

export async function snapshotAll(database: PersistenceDatabase): Promise<Record<StoreName, unknown[]>> {
  return {
    questTemplates: await readRaw(database, 'questTemplates'),
    questOccurrences: await readRaw(database, 'questOccurrences'),
    questCompletions: await readRaw(database, 'questCompletions'),
    xpTransactions: await readRaw(database, 'xpTransactions'),
    dailySummaries: await readRaw(database, 'dailySummaries'),
    weeklyBoards: await readRaw(database, 'weeklyBoards'),
    weeklyRewardClaims: await readRaw(database, 'weeklyRewardClaims'),
  }
}

/** The unique open-then-track pattern: closes every database it opened. */
export class DatabaseTracker {
  readonly #open: PersistenceDatabase[] = []

  async open(factory: IDBFactory = newFactory(), name?: string): Promise<PersistenceDatabase> {
    const database = await openTestDatabase(factory, name)
    this.#open.push(database)
    return database
  }

  track(database: PersistenceDatabase): PersistenceDatabase {
    this.#open.push(database)
    return database
  }

  closeAll(): void {
    for (const database of this.#open.splice(0)) database.close()
  }
}
