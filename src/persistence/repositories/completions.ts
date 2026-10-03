import type { DateKey, QuestCompletion } from '@/domain'
import { INDEX, STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { parseCompletion } from '../records/completion'
import { parseStored } from './stored'

/**
 * Read-only by design (MASTER_SPEC §5.6, INV-24): a completion is written
 * exactly once, together with its XP transaction, by `completeQuestAtomically`.
 * There is no update or delete path.
 */

export async function getCompletion(database: PersistenceDatabase, occurrenceId: string): Promise<QuestCompletion | null> {
  const raw = await runTransaction(database, [STORE.completions], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.completions).get(occurrenceId)),
  )
  return raw === undefined ? null : parseStored(parseCompletion, raw, `quest completion "${occurrenceId}"`)
}

/** Every completion attributed to a date, ordered by occurrence id. */
export async function listCompletionsByDate(database: PersistenceDatabase, dateKey: DateKey): Promise<readonly QuestCompletion[]> {
  const raw = await runTransaction(database, [STORE.completions], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.completions).index(INDEX.completions.dateKey).getAll(dateKey)),
  )
  return raw.map((value, index) => parseStored(parseCompletion, value, `quest completion [${index}]`))
}

/** Every completion of a template, ordered by occurrence id (so by date). */
export async function listCompletionsByTemplate(database: PersistenceDatabase, templateId: string): Promise<readonly QuestCompletion[]> {
  const raw = await runTransaction(database, [STORE.completions], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.completions).index(INDEX.completions.templateId).getAll(templateId)),
  )
  return raw.map((value, index) => parseStored(parseCompletion, value, `quest completion [${index}]`))
}
