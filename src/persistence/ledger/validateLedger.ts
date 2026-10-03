import { err, ok, type Result, type XPTransaction } from '@/domain'
import type { ValidationIssue } from '../errors'
import { IssueCollector, joinPath } from '../records/readers'

export interface LedgerSummary {
  /** Number of ledger rows. */
  readonly count: number
  /** Highest `seq` (0 for an empty ledger). */
  readonly lastSeq: number
  /** Total EXP implied by the ledger (0 for an empty ledger). */
  readonly totalExp: number
}

export const EMPTY_LEDGER: LedgerSummary = { count: 0, lastSeq: 0, totalExp: 0 }

/**
 * The one place the ledger chain is checked (DATA_MODEL INV-3, INV-5, INV-6).
 * Used by backup import, export, `verifyDatabaseIntegrity` and tests.
 *
 * `rows` is read in ledger order: the row at index `i` must carry `seq = i + 1`.
 * Rows must already be individually valid (`parseXpTransaction`); this function
 * re-checks amounts only because the chain arithmetic depends on them.
 *
 *  - `seq` starts at 1, is strictly increasing and gap-free
 *  - `totalExpAfter(n) = totalExpAfter(n-1) + amount(n)`, starting from 0
 *  - ids and idempotency keys are unique
 *  - total EXP never decreases (every amount is a positive safe integer)
 */
export function validateLedger(
  rows: readonly XPTransaction[],
  path = 'xpTransactions',
): Result<LedgerSummary, readonly ValidationIssue[]> {
  const collector = new IssueCollector()
  const seenSeq = new Set<number>()
  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()
  let running = 0

  rows.forEach((row, index) => {
    const at = joinPath(path, index)
    const expectedSeq = index + 1

    if (!Number.isSafeInteger(row.amount) || row.amount <= 0) {
      collector.add(joinPath(at, 'amount'), 'amount_not_positive', 'Amount must be a positive safe integer')
    }

    if (seenSeq.has(row.seq)) {
      collector.add(joinPath(at, 'seq'), 'duplicate_seq', `Sequence ${row.seq} appears more than once`)
    } else if (row.seq < expectedSeq) {
      collector.add(joinPath(at, 'seq'), 'seq_out_of_order', `Expected sequence ${expectedSeq}, found ${row.seq}`)
    } else if (row.seq > expectedSeq) {
      collector.add(joinPath(at, 'seq'), 'seq_gap', `Expected sequence ${expectedSeq}, found ${row.seq}`)
    }
    seenSeq.add(row.seq)

    const expectedTotal = running + row.amount
    if (!Number.isSafeInteger(expectedTotal)) {
      collector.add(joinPath(at, 'totalExpAfter'), 'total_exp_overflow', 'Running total leaves the safe integer range')
    } else if (row.totalExpAfter !== expectedTotal) {
      collector.add(
        joinPath(at, 'totalExpAfter'),
        'total_exp_mismatch',
        `Expected running total ${expectedTotal}, found ${row.totalExpAfter}`,
      )
    }
    // Resync to the stored value so one bad row is reported once, not forever.
    running = row.totalExpAfter

    if (seenIds.has(row.id)) {
      collector.add(joinPath(at, 'id'), 'duplicate_id', `Transaction id "${row.id}" appears more than once`)
    }
    seenIds.add(row.id)
    if (seenKeys.has(row.idempotencyKey)) {
      collector.add(joinPath(at, 'idempotencyKey'), 'duplicate_idempotency_key', `Idempotency key "${row.idempotencyKey}" appears more than once`)
    }
    seenKeys.add(row.idempotencyKey)
  })

  if (!collector.isClean) return err(collector.issues)
  const last = rows[rows.length - 1]
  if (last === undefined) return ok(EMPTY_LEDGER)
  return ok({ count: rows.length, lastSeq: last.seq, totalExp: last.totalExpAfter })
}
