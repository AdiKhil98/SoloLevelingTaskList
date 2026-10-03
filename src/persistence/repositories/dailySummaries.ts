import { nextDate, type DailySummary, type DateKey } from '@/domain'
import { INDEX, STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { PersistenceError } from '../errors'
import { parseDailySummary } from '../records/dailySummary'
import { parseStored } from './stored'

/**
 * Daily summaries are the authoritative result of finalized days and are
 * insert-only: they are written once, by `finalizeDayAtomically`, and never
 * updated or deleted. This module only reads them.
 */

export async function getDailySummary(database: PersistenceDatabase, dateKey: DateKey): Promise<DailySummary | null> {
  const raw = await runTransaction(database, [STORE.dailySummaries], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.dailySummaries).get(dateKey)),
  )
  return raw === undefined ? null : parseStored(parseDailySummary, raw, `daily summary "${dateKey}"`)
}

/** Every summary, oldest first. */
export async function listDailySummaries(database: PersistenceDatabase): Promise<readonly DailySummary[]> {
  const raw = await runTransaction(database, [STORE.dailySummaries], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.dailySummaries).getAll()),
  )
  return raw.map((value, index) => parseStored(parseDailySummary, value, `daily summary [${index}]`))
}

/** The newest summary (the tip of the chain), or null before any day was finalized. */
export async function getLatestDailySummary(database: PersistenceDatabase): Promise<DailySummary | null> {
  return runTransaction(database, [STORE.dailySummaries], 'readonly', (transaction) => readLatestSummary(transaction))
}

/** @internal Reads the newest summary inside an open transaction that includes `dailySummaries`. */
export async function readLatestSummary(transaction: IDBTransaction): Promise<DailySummary | null> {
  const cursor = await requestToPromise(transaction.objectStore(STORE.dailySummaries).openCursor(null, 'prev'))
  return cursor === null ? null : parseStored(parseDailySummary, cursor.value, `daily summary "${String(cursor.key)}"`)
}

/** @internal The earliest date with an occurrence, inside an open transaction that includes `questOccurrences`. */
export async function readEarliestOccurrenceDate(transaction: IDBTransaction): Promise<DateKey | null> {
  const cursor = await requestToPromise(
    transaction.objectStore(STORE.occurrences).index(INDEX.occurrences.dateKey).openKeyCursor(null, 'next'),
  )
  return cursor === null ? null : (cursor.key as DateKey)
}

/**
 * The first date that is not finalized yet: the day after the newest summary
 * or, before any day was finalized, the earliest date that has occurrences.
 * Null when there is no history at all (nothing exists to finalize).
 *
 * This is the reconciliation cursor and also the clock-safety reference: the
 * active day is never earlier than it, so a device date before the cursor
 * means the clock moved backwards. It is derived, never stored.
 */
export async function readFinalizationCursor(database: PersistenceDatabase): Promise<DateKey | null> {
  return runTransaction(database, [STORE.dailySummaries, STORE.occurrences], 'readonly', async (transaction) => {
    const latest = await readLatestSummary(transaction)
    if (latest !== null) return nextDate(latest.dateKey)
    return readEarliestOccurrenceDate(transaction)
  })
}

/** The tip of the summary chain plus the finalized Perfect Day total. */
export interface DailyChainTip {
  /** Null before any day was finalized. */
  readonly latest: DailySummary | null
  readonly totalPerfectDays: number
}

/**
 * Reads what the streak statistics derive from, in one snapshot: the newest
 * summary carries the current/best/perfect streaks (`*After` values of the
 * verified chain) and the Perfect Day total is a count on the `quality` index.
 */
export async function readDailyChainTip(database: PersistenceDatabase): Promise<DailyChainTip> {
  return runTransaction(database, [STORE.dailySummaries], 'readonly', async (transaction) => {
    const latest = await readLatestSummary(transaction)
    const totalPerfectDays = await requestToPromise(
      transaction.objectStore(STORE.dailySummaries).index(INDEX.dailySummaries.quality).count('perfect'),
    )
    return { latest, totalPerfectDays }
  })
}

/**
 * @internal Backstop for writers: nothing may be added to a date that already
 * has a summary. Needs `dailySummaries` in the transaction.
 */
export async function assertDateNotFinalized(transaction: IDBTransaction, dateKey: DateKey): Promise<void> {
  const existing = await requestToPromise(transaction.objectStore(STORE.dailySummaries).getKey(dateKey))
  if (existing !== undefined) {
    throw new PersistenceError('constraint_violation', `${dateKey} is already finalized; its records are closed`)
  }
}
