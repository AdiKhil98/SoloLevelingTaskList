import type { StoreName } from '../config'
import { PersistenceError, toPersistenceError } from '../errors'
import type { PersistenceDatabase } from './connection'

/** Wraps one IndexedDB request. The raw request never leaves persistence. */
export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(toPersistenceError(request.error, 'IndexedDB request failed'))
  })
}

/**
 * Issues several requests inside one transaction and waits for all of them.
 * If creating a later request throws synchronously, the requests already issued
 * are still observed, so their (abort) rejections never go unhandled.
 */
export async function allRequests<T>(
  creators: Iterable<() => IDBRequest<T>>,
): Promise<T[]> {
  const pending: Promise<T>[] = []
  try {
    for (const create of creators) pending.push(requestToPromise(create()))
  } catch (error) {
    for (const promise of pending) promise.catch(() => undefined)
    throw error
  }
  return Promise.all(pending)
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(
        toPersistenceError(
          transaction.error ?? new DOMException('Transaction aborted', 'AbortError'),
          'Transaction aborted',
        ),
      )
  })
}

function abortQuietly(transaction: IDBTransaction): void {
  try {
    transaction.abort()
  } catch {
    // Already finished or aborted (for example by the failing request).
  }
}

/**
 * Runs `work` inside one IndexedDB transaction and resolves with its result
 * once the transaction has committed.
 *
 * `work` may only await IndexedDB requests (via `requestToPromise`): awaiting
 * anything else lets the transaction auto-commit. If `work` throws, the whole
 * transaction is aborted, so nothing it wrote survives.
 */
export async function runTransaction<T>(
  database: PersistenceDatabase,
  stores: readonly StoreName[],
  mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const transaction = database.openTransaction(stores, mode)
  const done = transactionDone(transaction)
  // Observe rejections immediately; the real outcome is awaited below.
  done.catch(() => undefined)

  let result: T
  try {
    result = await work(transaction)
  } catch (error) {
    abortQuietly(transaction)
    await done.catch(() => undefined)
    throw error instanceof PersistenceError
      ? error
      : toPersistenceError(error, 'Transaction failed')
  }
  await done
  return result
}
