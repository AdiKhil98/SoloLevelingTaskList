import { IDBFactory } from 'fake-indexeddb'
import { asDateKey, type DateKey, type QuestTemplate } from '@/domain'
import { openDatabase, type PersistenceDatabase } from '@/persistence'
import type { Clock } from '../clock'
import type { ApplicationContext } from '../context'

/** Test-only helpers. Not part of the public application API. */

export const ZONE = 'Europe/Berlin'

export const d = (key: string): DateKey => asDateKey(key)

/** A Berlin-midday instant on `dateKey` (UTC 10:00 is 11:00 or 12:00 in Berlin). */
export function noonOn(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day, 10, 0, 0)
}

/** Berlin local time on `dateKey` (summer time, UTC+2): `hour`:`minute`. */
export function berlinSummerTime(dateKey: string, hour: number, minute = 0): number {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day, hour - 2, minute, 0)
}

/** A valid custom (non-seed) daily template; override what a test cares about. */
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
    revision: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}

export interface TestClock extends Clock {
  set(epochMs: number): void
}

/** A clock that only moves when the test says so. */
export function createTestClock(epochMs: number, timeZone: string = ZONE): TestClock {
  let current = epochMs
  return {
    now: () => current,
    timeZone: () => timeZone,
    set: (value) => {
      current = value
    },
  }
}

/** A fresh, isolated fake IndexedDB (one per test). */
export const newFactory = (): IDBFactory => new IDBFactory()

export interface TestContext {
  readonly context: ApplicationContext
  readonly clock: TestClock
  readonly factory: IDBFactory
  readonly database: PersistenceDatabase
}

/** Opens a database on a fresh fake factory, with a clock at Berlin midday on `dateKey`. */
export async function createTestContext(dateKey = '2026-10-05'): Promise<TestContext> {
  const factory = newFactory()
  const database = await openDatabase({ factory })
  const clock = createTestClock(noonOn(dateKey))
  return { context: { database, clock }, clock, factory, database }
}
