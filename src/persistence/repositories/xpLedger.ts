import type { DateKey, XPTransaction } from '@/domain'
import { INDEX, STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { parseXpTransaction } from '../records/xpTransaction'
import { parseStored } from './stored'

/**
 * Read-only by design: the ledger is append-only (DATA_MODEL §6) and rows are
 * only ever appended inside a command's transaction (see
 * `completeQuestAtomically`), which allocates `seq`.
 */

export async function getXpTransaction(database: PersistenceDatabase, id: string): Promise<XPTransaction | null> {
  const raw = await runTransaction(database, [STORE.xpTransactions], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.xpTransactions).get(id)),
  )
  return raw === undefined ? null : parseStored(parseXpTransaction, raw, `XP transaction "${id}"`)
}

export async function getXpTransactionByIdempotencyKey(database: PersistenceDatabase, idempotencyKey: string): Promise<XPTransaction | null> {
  const raw = await runTransaction(database, [STORE.xpTransactions], 'readonly', (transaction) =>
    requestToPromise(
      transaction.objectStore(STORE.xpTransactions).index(INDEX.xpTransactions.idempotencyKey).get(idempotencyKey),
    ),
  )
  return raw === undefined ? null : parseStored(parseXpTransaction, raw, `XP transaction with key "${idempotencyKey}"`)
}

/** The whole ledger in ledger order (ascending `seq`). */
export async function listXpTransactions(database: PersistenceDatabase): Promise<readonly XPTransaction[]> {
  const raw = await runTransaction(database, [STORE.xpTransactions], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.xpTransactions).index(INDEX.xpTransactions.seq).getAll()),
  )
  return raw.map((value, index) => parseStored(parseXpTransaction, value, `XP transaction [${index}]`))
}

/** Ledger rows reported on a date (`effectiveDate`), in ledger order. */
export async function listXpTransactionsByEffectiveDate(database: PersistenceDatabase, dateKey: DateKey): Promise<readonly XPTransaction[]> {
  const raw = await runTransaction(database, [STORE.xpTransactions], 'readonly', (transaction) =>
    requestToPromise(
      transaction.objectStore(STORE.xpTransactions).index(INDEX.xpTransactions.effectiveDate).getAll(dateKey),
    ),
  )
  const rows = raw.map((value, index) => parseStored(parseXpTransaction, value, `XP transaction [${index}]`))
  return rows.sort((a, b) => a.seq - b.seq)
}
