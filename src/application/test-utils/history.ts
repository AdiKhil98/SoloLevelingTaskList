import { asDateKey } from '@/domain'
import {
  listCompletionsByDate,
  listOccurrencesByDate,
  listXpTransactions,
  readProgression,
  type PersistenceDatabase,
} from '@/persistence'

/**
 * Test-only: everything that counts as HISTORY and progression for a day, read
 * straight from storage, so a test can assert a management action changed none
 * of it.
 */
export async function readHistory(database: PersistenceDatabase, dateKey: string) {
  const date = asDateKey(dateKey)
  return {
    occurrences: await listOccurrencesByDate(database, date),
    completions: await listCompletionsByDate(database, date),
    ledger: await listXpTransactions(database),
    progression: await readProgression(database),
  }
}
