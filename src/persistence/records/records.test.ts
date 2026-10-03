import { describe, expect, it } from 'vitest'
import { completeQuest, type XPTransaction } from '@/domain'
import { buildOccurrence, buildTemplate, noonOn, ZONE } from '../test-utils/helpers'
import { parseCompletion } from './completion'
import { parseOccurrence } from './occurrence'
import { parseTemplate } from './template'
import { parseXpTransaction } from './xpTransaction'

function issueCodes(result: { ok: boolean; error?: readonly { code: string }[] }): string[] {
  return result.ok ? [] : (result.error ?? []).map((issue) => issue.code)
}

const occurrence = buildOccurrence({ id: 'tpl_gym', difficulty: 'B', category: 'fitness' })
const completed = (() => {
  const result = completeQuest({
    occurrence,
    existingCompletion: null,
    ledger: { totalExp: 0, lastSeq: 0 },
    completedAt: noonOn('2026-10-03'),
    timeZone: ZONE,
  })
  if (result.status !== 'completed') throw new Error('fixture')
  return result
})()

describe('parseTemplate', () => {
  it('accepts a valid template and returns a fresh copy', () => {
    const input = buildTemplate({ description: 'Lift', recurrence: { kind: 'weekdays', weekdays: [1, 3, 5] } })
    const parsed = parseTemplate(input)
    expect(parsed).toEqual({ ok: true, value: input })
    if (parsed.ok) expect(parsed.value).not.toBe(input)
  })

  it('accepts a template without a description', () => {
    expect(parseTemplate(buildTemplate()).ok).toBe(true)
  })

  it.each([
    ['not an object', 'nope', 'not_an_object'],
    ['null', null, 'not_an_object'],
    ['an array', [], 'not_an_object'],
  ])('rejects %s', (_label, value, code) => {
    expect(issueCodes(parseTemplate(value))).toContain(code)
  })

  it('rejects non-string and empty titles', () => {
    expect(issueCodes(parseTemplate({ ...buildTemplate(), title: 5 }))).toContain('not_a_string')
    expect(issueCodes(parseTemplate({ ...buildTemplate(), title: '  ' }))).toContain('empty_string')
  })

  it('rejects malformed dates, difficulty, category and counters', () => {
    expect(issueCodes(parseTemplate({ ...buildTemplate(), activeFrom: '2026-02-30' }))).toContain('invalid_date_key')
    expect(issueCodes(parseTemplate({ ...buildTemplate(), activeUntil: '26-1-1' }))).toContain('invalid_date_key')
    expect(issueCodes(parseTemplate({ ...buildTemplate(), difficulty: 'Z' }))).toContain('invalid_value')
    expect(issueCodes(parseTemplate({ ...buildTemplate(), category: 'gaming' }))).toContain('invalid_value')
    expect(issueCodes(parseTemplate({ ...buildTemplate(), revision: 1.5 }))).toContain('not_a_safe_integer')
    expect(issueCodes(parseTemplate({ ...buildTemplate(), createdAt: -1 }))).toContain('out_of_range')
  })

  it.each([
    ['empty weekdays', { kind: 'weekdays', weekdays: [] }, 'recurrence_weekdays_empty'],
    ['duplicate weekdays', { kind: 'weekdays', weekdays: [1, 1] }, 'recurrence_weekday_duplicate'],
    ['weekday 8', { kind: 'weekdays', weekdays: [8] }, 'recurrence_weekday_out_of_range'],
    ['interval of 1', { kind: 'interval', everyNDays: 1, anchor: '2026-01-01' }, 'recurrence_interval_too_small'],
    ['interval with a bad anchor', { kind: 'interval', everyNDays: 3, anchor: 'x' }, 'recurrence_invalid_anchor'],
    ['one-time with a bad date', { kind: 'one_time', date: '2026-13-01' }, 'recurrence_invalid_one_time_date'],
    ['unknown kind', { kind: 'monthly' }, 'recurrence_unknown_kind'],
  ])('rejects a malformed recurrence: %s', (_label, recurrence, code) => {
    expect(issueCodes(parseTemplate({ ...buildTemplate(), recurrence }))).toContain(code)
  })

  it('rejects unexpected fields, including inside the recurrence', () => {
    expect(issueCodes(parseTemplate({ ...buildTemplate(), exp: 9999 }))).toContain('unexpected_field')
    expect(issueCodes(parseTemplate({ ...buildTemplate(), recurrence: { kind: 'daily', extra: 1 } }))).toContain('unexpected_field')
  })

  it('applies the Phase 02 template rules (inverted active period)', () => {
    const inverted = { ...buildTemplate(), activeFrom: '2026-05-01', activeUntil: '2026-04-01' }
    expect(issueCodes(parseTemplate(inverted))).toContain('template_active_period_inverted')
  })
})

describe('parseOccurrence', () => {
  it('accepts a domain-built occurrence', () => {
    expect(parseOccurrence(occurrence)).toEqual({ ok: true, value: occurrence })
  })

  it('accepts a snapshot whose EXP differs from the current configuration', () => {
    // A snapshot records what the quest was worth at the time; config may change later.
    const historical = { ...occurrence, snapshot: { ...occurrence.snapshot, expReward: 999 } }
    expect(parseOccurrence(historical).ok).toBe(true)
  })

  it('rejects an id that is not the deterministic key', () => {
    expect(issueCodes(parseOccurrence({ ...occurrence, id: 'occ:other@2026-10-03' }))).toContain('occurrence_id_mismatch')
  })

  it('rejects malformed snapshots', () => {
    expect(issueCodes(parseOccurrence({ ...occurrence, snapshot: { ...occurrence.snapshot, expReward: 0 } }))).toContain('out_of_range')
    expect(issueCodes(parseOccurrence({ ...occurrence, snapshot: { ...occurrence.snapshot, category: 'x' } }))).toContain('invalid_value')
    expect(issueCodes(parseOccurrence({ ...occurrence, snapshot: null }))).toContain('not_an_object')
    expect(issueCodes(parseOccurrence({ ...occurrence, dateKey: '2026-00-10' }))).toContain('invalid_date_key')
  })

  it('rejects unexpected fields', () => {
    expect(issueCodes(parseOccurrence({ ...occurrence, completed: true }))).toContain('unexpected_field')
  })
})

describe('parseCompletion', () => {
  it('accepts a domain-built completion', () => {
    expect(parseCompletion(completed.completion).ok).toBe(true)
  })

  it('rejects ids that break the deterministic keys', () => {
    expect(issueCodes(parseCompletion({ ...completed.completion, occurrenceId: 'occ:x@2026-10-03' }))).toContain('occurrence_id_mismatch')
    expect(issueCodes(parseCompletion({ ...completed.completion, xpTransactionId: 'xp:wrong' }))).toContain('xp_transaction_id_mismatch')
  })

  it('rejects non-positive EXP and an absurd UTC offset', () => {
    expect(issueCodes(parseCompletion({ ...completed.completion, expAwarded: 0 }))).toContain('out_of_range')
    expect(issueCodes(parseCompletion({ ...completed.completion, utcOffsetMinutes: 5000 }))).toContain('out_of_range')
  })
})

describe('parseXpTransaction', () => {
  const row = completed.xpTransaction

  it('accepts a domain-built quest transaction', () => {
    expect(parseXpTransaction(row)).toEqual({ ok: true, value: row })
  })

  it('rejects zero, negative and fractional amounts', () => {
    expect(issueCodes(parseXpTransaction({ ...row, amount: 0 }))).toContain('out_of_range')
    expect(issueCodes(parseXpTransaction({ ...row, amount: -55 }))).toContain('out_of_range')
    expect(issueCodes(parseXpTransaction({ ...row, amount: 5.5 }))).toContain('not_a_safe_integer')
    expect(issueCodes(parseXpTransaction({ ...row, amount: Number.MAX_SAFE_INTEGER + 2 }))).toContain('not_a_safe_integer')
  })

  it('rejects bad sequence numbers', () => {
    expect(issueCodes(parseXpTransaction({ ...row, seq: 0 }))).toContain('out_of_range')
    expect(issueCodes(parseXpTransaction({ ...row, seq: 1.5 }))).toContain('not_a_safe_integer')
  })

  it('rejects idempotency keys and ids that do not match the source', () => {
    expect(issueCodes(parseXpTransaction({ ...row, idempotencyKey: 'quest_completion:other' }))).toContain('idempotency_key_mismatch')
    expect(issueCodes(parseXpTransaction({ ...row, id: 'xp:other' }))).toContain('transaction_id_mismatch')
  })

  it('rejects a quest transaction without a category or with a source week', () => {
    expect(issueCodes(parseXpTransaction({ ...row, category: null }))).toContain('category_required')
    expect(issueCodes(parseXpTransaction({ ...row, sourceWeekKey: '2026-09-28' }))).toContain('source_week_key_not_allowed')
  })

  it('rejects a running total smaller than the amount', () => {
    expect(issueCodes(parseXpTransaction({ ...row, totalExpAfter: 10 }))).toContain('total_exp_below_amount')
  })

  describe('weekly_goal_crusher rows (shape only; no weekly logic exists yet)', () => {
    const weekly: XPTransaction = {
      id: 'xp:weekly:2026-09-28',
      seq: 1,
      idempotencyKey: 'weekly_goal_crusher:2026-09-28',
      source: { type: 'weekly_goal_crusher', weekKey: '2026-09-28' as never, score: 9 },
      amount: 325,
      category: null,
      createdAt: noonOn('2026-10-07'),
      effectiveDate: '2026-10-04' as never,
      sourceWeekKey: '2026-09-28' as never,
      totalExpAfter: 325,
    }

    it('accepts a correctly dated weekly bonus', () => {
      expect(parseXpTransaction(weekly).ok).toBe(true)
    })

    it('enforces the dating invariants (INV-25)', () => {
      expect(issueCodes(parseXpTransaction({ ...weekly, effectiveDate: '2026-10-07' }))).toContain('effective_date_mismatch')
      expect(issueCodes(parseXpTransaction({ ...weekly, sourceWeekKey: null }))).toContain('source_week_key_mismatch')
      expect(issueCodes(parseXpTransaction({ ...weekly, category: 'trading' }))).toContain('category_not_allowed')
      expect(issueCodes(parseXpTransaction({ ...weekly, source: { ...weekly.source, weekKey: '2026-09-29' } }))).toContain('week_key_not_monday')
      expect(issueCodes(parseXpTransaction({ ...weekly, source: { ...weekly.source, score: 5 } }))).toContain('out_of_range')
    })
  })

  it('rejects an unknown source type', () => {
    expect(issueCodes(parseXpTransaction({ ...row, source: { type: 'achievement' } }))).toContain('unknown_source_type')
  })
})
