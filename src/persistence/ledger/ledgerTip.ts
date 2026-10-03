import { levelStateOf, type LedgerState, type LevelState, type XPTransaction } from '@/domain'
import { INDEX, STORE } from '../config'
import { requestToPromise, runTransaction } from '../database/transaction'
import type { PersistenceDatabase } from '../database/connection'
import { PersistenceError } from '../errors'
import { parseXpTransaction } from '../records/xpTransaction'
import { validateLedger, type LedgerSummary } from './validateLedger'

/**
 * Reads the ledger tip inside an open transaction: the highest-`seq` row (via
 * the unique `seq` index, one cursor step) plus a row count. Cheap enough to
 * run on every completion, and it cross-checks that the tip's `seq` equals the
 * number of rows, which catches a missing or extra row immediately.
 *
 * Because it runs in the same read-write transaction that appends the next
 * row, no other tab can allocate that `seq` in between.
 */
export async function readLedgerState(transaction: IDBTransaction): Promise<LedgerState> {
  const store = transaction.objectStore(STORE.xpTransactions)
  const count = await requestToPromise(store.count())
  if (count === 0) return { totalExp: 0, lastSeq: 0 }

  const cursor = await requestToPromise(
    store.index(INDEX.xpTransactions.seq).openCursor(null, 'prev'),
  )
  if (cursor === null) {
    throw new PersistenceError(
      'ledger_integrity_failed',
      `The ledger holds ${count} rows but none is reachable through its sequence index`,
    )
  }
  const tip = parseXpTransaction(cursor.value, 'xpTransactions[tip]')
  if (!tip.ok) {
    throw new PersistenceError('record_validation_failed', 'The ledger tip row is invalid', {
      issues: tip.error,
    })
  }
  if (tip.value.seq !== count) {
    throw new PersistenceError(
      'ledger_integrity_failed',
      `The ledger tip has sequence ${tip.value.seq} but the ledger holds ${count} rows`,
    )
  }
  return { totalExp: tip.value.totalExpAfter, lastSeq: tip.value.seq }
}

/** Progression derived from total EXP; nothing here is stored separately. */
export interface PlayerProgression {
  readonly totalExp: number
  /** Highest ledger `seq` (0 when no EXP has been earned). */
  readonly lastSeq: number
  /** Level, EXP into level, EXP to next, and rank, all derived by the domain engine. */
  readonly levelState: LevelState
}

function progressionOf(summary: Pick<LedgerSummary, 'totalExp' | 'lastSeq'>): PlayerProgression {
  return {
    totalExp: summary.totalExp,
    lastSeq: summary.lastSeq,
    levelState: levelStateOf(summary.totalExp),
  }
}

/** Derives progression from an already-validated ledger summary. */
export const progressionFromLedger = progressionOf

/**
 * Fast read: total EXP comes from the ledger tip (see `readLedgerState`).
 * Level and rank are derived by the Phase 02 engine, never read from storage.
 */
export async function readProgression(database: PersistenceDatabase): Promise<PlayerProgression> {
  const state = await runTransaction(database, [STORE.xpTransactions], 'readonly', readLedgerState)
  return progressionOf(state)
}

/**
 * Full reconstruction: reads every ledger row, validates the whole chain with
 * `validateLedger` and derives progression from it. Throws
 * `ledger_integrity_failed` (with issues) if the chain is broken.
 */
export async function reconstructProgression(database: PersistenceDatabase): Promise<PlayerProgression> {
  const { raw, count } = await runTransaction(database, [STORE.xpTransactions], 'readonly', async (transaction) => {
    const store = transaction.objectStore(STORE.xpTransactions)
    const raw = await requestToPromise(store.index(INDEX.xpTransactions.seq).getAll())
    const count = await requestToPromise(store.count())
    return { raw, count }
  })
  if (raw.length !== count) {
    throw new PersistenceError(
      'ledger_integrity_failed',
      `The ledger holds ${count} rows but only ${raw.length} are reachable through the sequence index`,
    )
  }
  const rows: XPTransaction[] = []
  for (const [index, value] of raw.entries()) {
    const parsed = parseXpTransaction(value, `xpTransactions[${index}]`)
    if (!parsed.ok) {
      throw new PersistenceError('record_validation_failed', 'A stored ledger row is invalid', {
        issues: parsed.error,
      })
    }
    rows.push(parsed.value)
  }
  const ledger = validateLedger(rows)
  if (!ledger.ok) {
    throw new PersistenceError('ledger_integrity_failed', 'The stored ledger is inconsistent', {
      issues: ledger.error,
    })
  }
  return progressionOf(ledger.value)
}
