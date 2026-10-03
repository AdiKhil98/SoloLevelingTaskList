import { describe, expect, it } from 'vitest'
import {
  levelStateOf,
  questCompletionIdempotencyKey,
  questCompletionTransactionId,
  type XPTransaction,
} from '@/domain'
import { buildOccurrence, d } from '../test-utils/helpers'
import { EMPTY_LEDGER, validateLedger } from './validateLedger'

/** Builds a chain of quest rows with the given amounts, correct unless overridden. */
function chain(amounts: readonly number[]): XPTransaction[] {
  let total = 0
  return amounts.map((amount, index) => {
    const occurrence = buildOccurrence({ id: `tpl_${index}` })
    total += amount
    return {
      id: questCompletionTransactionId(occurrence.id),
      seq: index + 1,
      idempotencyKey: questCompletionIdempotencyKey(occurrence.id),
      source: { type: 'quest_completion', occurrenceId: occurrence.id, templateId: occurrence.templateId },
      amount,
      category: 'discipline',
      createdAt: 1_000 + index,
      effectiveDate: d('2026-10-03'),
      sourceWeekKey: null,
      totalExpAfter: total,
    }
  })
}

const codes = (result: ReturnType<typeof validateLedger>) =>
  result.ok ? [] : result.error.map((issue) => issue.code)

describe('validateLedger', () => {
  it('treats an empty ledger as 0 EXP, Level 1, E-Rank', () => {
    const result = validateLedger([])
    expect(result).toEqual({ ok: true, value: EMPTY_LEDGER })
    const levelState = levelStateOf(EMPTY_LEDGER.totalExp)
    expect(levelState).toMatchObject({ level: 1, rank: 'E', expIntoLevel: 0 })
  })

  it('accepts a correct chain and reports count, last seq and total', () => {
    const result = validateLedger(chain([10, 55, 120]))
    expect(result).toEqual({ ok: true, value: { count: 3, lastSeq: 3, totalExp: 185 } })
  })

  it('rejects a sequence that does not start at 1', () => {
    const rows = chain([10, 20]).map((row) => ({ ...row, seq: row.seq + 1 }))
    expect(codes(validateLedger(rows))).toContain('seq_gap')
  })

  it('rejects a gap in the sequence', () => {
    const rows = chain([10, 20, 30])
    rows[2] = { ...rows[2]!, seq: 4 }
    expect(codes(validateLedger(rows))).toContain('seq_gap')
  })

  it('rejects out-of-order sequence numbers', () => {
    const rows = chain([10, 20, 30])
    const [a, b, c] = rows as [XPTransaction, XPTransaction, XPTransaction]
    expect(codes(validateLedger([a, c, b]))).toContain('seq_out_of_order')
  })

  it('rejects a duplicate sequence number', () => {
    const rows = chain([10, 20])
    rows[1] = { ...rows[1]!, seq: 1 }
    expect(codes(validateLedger(rows))).toContain('duplicate_seq')
  })

  it('rejects an inconsistent totalExpAfter', () => {
    const rows = chain([10, 20, 30])
    rows[1] = { ...rows[1]!, totalExpAfter: 999 }
    expect(codes(validateLedger(rows))).toContain('total_exp_mismatch')
  })

  it('reports exactly one issue when a bad row is followed by rows consistent with it', () => {
    const rows = chain([10, 20, 30])
    rows[1] = { ...rows[1]!, totalExpAfter: 100 } // should be 30
    rows[2] = { ...rows[2]!, totalExpAfter: 130 } // consistent with 100 + 30
    const result = validateLedger(rows)
    expect(result.ok ? [] : result.error).toHaveLength(1)
  })

  it('rejects total EXP that would decrease', () => {
    const rows = chain([10, 20])
    rows[1] = { ...rows[1]!, totalExpAfter: 5 }
    expect(codes(validateLedger(rows))).toContain('total_exp_mismatch')
  })

  it('rejects zero and negative amounts', () => {
    const rows = chain([10, 20])
    rows[1] = { ...rows[1]!, amount: -20, totalExpAfter: -10 }
    expect(codes(validateLedger(rows))).toContain('amount_not_positive')
    rows[1] = { ...rows[1]!, amount: 0, totalExpAfter: 10 }
    expect(codes(validateLedger(rows))).toContain('amount_not_positive')
  })

  it('rejects a duplicate transaction id', () => {
    const rows = chain([10, 20])
    rows[1] = { ...rows[1]!, id: rows[0]!.id }
    expect(codes(validateLedger(rows))).toContain('duplicate_id')
  })

  it('rejects a duplicate idempotency key', () => {
    const rows = chain([10, 20])
    rows[1] = { ...rows[1]!, idempotencyKey: rows[0]!.idempotencyKey }
    expect(codes(validateLedger(rows))).toContain('duplicate_idempotency_key')
  })

  it('rejects running totals outside the safe integer range', () => {
    const rows = chain([Number.MAX_SAFE_INTEGER - 1])
    rows.push({ ...chain([1, 1])[1]!, seq: 2, amount: 2, totalExpAfter: Number.MAX_SAFE_INTEGER })
    expect(codes(validateLedger(rows))).toContain('total_exp_overflow')
  })

  it('reconstructs level and rank for a long ledger through the Phase 02 engine', () => {
    const result = validateLedger(chain(Array.from({ length: 600 }, () => 120)))
    if (!result.ok) throw new Error('fixture')
    expect(result.value.totalExp).toBe(72_000)
    const state = levelStateOf(result.value.totalExp)
    expect(state.level).toBeGreaterThanOrEqual(35)
    expect(state.rank).toBe('B')
  })
})
