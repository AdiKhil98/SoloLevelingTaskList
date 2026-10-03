import { describe, expect, it } from 'vitest'
import { buildTemplate, d } from '../test-utils/builders'
import { occurrenceIdOf } from './keys'
import { createOccurrence } from './occurrence'
import { validateQuestTemplate } from './template'
import type { QuestTemplate } from './types'

function create(template: QuestTemplate, date: string, at = 1_000) {
  return createOccurrence(template, d(date), at)
}

describe('createOccurrence', () => {
  it('uses the deterministic id occ:{templateId}@{dateKey}', () => {
    const result = create(buildTemplate({ id: 'tpl_abc' }), '2026-10-03')
    expect(result.ok && result.value.id).toBe('occ:tpl_abc@2026-10-03')
    expect(occurrenceIdOf('tpl_abc', d('2026-10-03'))).toBe('occ:tpl_abc@2026-10-03')
  })

  it('gives the same template and date the same identity every time', () => {
    const template = buildTemplate()
    const ids = [1, 2, 3].map((n) => {
      const r = create(template, '2026-10-03', n * 1000)
      return r.ok ? r.value.id : null
    })
    expect(new Set(ids).size).toBe(1)
  })

  it('gives different dates and different templates different identities', () => {
    const a = create(buildTemplate({ id: 'tpl_a' }), '2026-10-03')
    const nextDay = create(buildTemplate({ id: 'tpl_a' }), '2026-10-04')
    const other = create(buildTemplate({ id: 'tpl_b' }), '2026-10-03')
    if (!a.ok || !nextDay.ok || !other.ok) throw new Error('expected eligible')
    expect(a.value.id).not.toBe(nextDay.value.id)
    expect(a.value.id).not.toBe(other.value.id)
  })

  it('snapshots title, difficulty, category, reward EXP, role and recurrence kind', () => {
    const result = create(
      buildTemplate({
        title: 'Backtest session',
        difficulty: 'B',
        category: 'trading',
        role: 'standard',
        recurrence: { kind: 'weekdays', weekdays: [6] },
        revision: 4,
      }),
      '2026-10-03', // Saturday
      42,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      id: 'occ:tpl_test@2026-10-03',
      templateId: 'tpl_test',
      dateKey: '2026-10-03',
      templateRevision: 4,
      snapshot: {
        title: 'Backtest session',
        difficulty: 'B',
        category: 'trading',
        expReward: 55,
        role: 'standard',
        recurrenceKind: 'weekdays',
      },
      materializedAt: 42,
    })
  })

  it('derives reward EXP from difficulty', () => {
    const rewards = (['E', 'D', 'C', 'B', 'A', 'S'] as const).map((difficulty) => {
      const r = create(buildTemplate({ difficulty }), '2026-10-03')
      return r.ok ? r.value.snapshot.expReward : null
    })
    expect(rewards).toEqual([10, 20, 35, 55, 80, 120])
  })

  it('is not changed by editing the template afterwards', () => {
    const template: { -readonly [K in keyof QuestTemplate]: QuestTemplate[K] } = {
      ...buildTemplate({ title: 'Original', difficulty: 'E', category: 'fitness' }),
    }
    const result = create(template, '2026-10-03')
    if (!result.ok) throw new Error('expected eligible')
    const frozenCopy = structuredClone(result.value)

    template.title = 'Renamed next month'
    template.difficulty = 'S'
    template.category = 'business'
    template.revision = 99

    expect(result.value).toEqual(frozenCopy)
    expect(result.value.snapshot).toMatchObject({
      title: 'Original',
      difficulty: 'E',
      category: 'fitness',
      expReward: 10,
    })
  })

  it('returns a typed not_eligible failure on an ineligible date', () => {
    const template = buildTemplate({ recurrence: { kind: 'weekdays', weekdays: [1] } })
    expect(create(template, '2026-10-06')).toEqual({
      ok: false,
      error: { code: 'not_eligible', reason: 'recurrence_mismatch' },
    })
    expect(create(buildTemplate({ activeFrom: d('2026-11-01') }), '2026-10-03')).toEqual({
      ok: false,
      error: { code: 'not_eligible', reason: 'before_active_from' },
    })
    expect(
      create(buildTemplate({ activeUntil: d('2026-10-01') }), '2026-10-03'),
    ).toEqual({
      ok: false,
      error: { code: 'not_eligible', reason: 'after_active_until' },
    })
  })

  it('does not create a missed one-time quest on the following day', () => {
    const template = buildTemplate({
      recurrence: { kind: 'one_time', date: d('2026-10-03') },
    })
    expect(create(template, '2026-10-03').ok).toBe(true)
    expect(create(template, '2026-10-04').ok).toBe(false)
  })

  it('returns a typed failure for an invalid template instead of an occurrence', () => {
    const bad = buildTemplate({
      recurrence: { kind: 'interval', everyNDays: 0, anchor: d('2026-10-01') },
    })
    expect(create(bad, '2026-10-03')).toEqual({
      ok: false,
      error: {
        code: 'invalid_template',
        detail: { code: 'invalid_recurrence', detail: { code: 'interval_too_small', everyNDays: 0 } },
      },
    })
  })

  it('rejects an invalid date or materialization time', () => {
    expect(createOccurrence(buildTemplate(), '2026-02-30' as never, 0)).toMatchObject({
      ok: false,
      error: { code: 'invalid_date' },
    })
    expect(createOccurrence(buildTemplate(), d('2026-10-03'), -1)).toMatchObject({
      ok: false,
      error: { code: 'invalid_materialized_at' },
    })
  })
})

describe('validateQuestTemplate', () => {
  it('accepts a well-formed template', () => {
    expect(validateQuestTemplate(buildTemplate()).ok).toBe(true)
  })

  it.each([
    ['empty title', { title: '  ' }, 'empty_title'],
    ['empty id', { id: '' }, 'empty_id'],
    ['unknown difficulty', { difficulty: 'Z' as never }, 'invalid_difficulty'],
    ['unknown category', { category: 'cooking' as never }, 'invalid_category'],
    ['unknown role', { role: 'boss' as never }, 'invalid_role'],
    ['negative revision', { revision: -1 }, 'invalid_revision'],
    ['malformed activeFrom', { activeFrom: 'soon' as never }, 'invalid_active_from'],
    ['malformed activeUntil', { activeUntil: '2026-13-01' as never }, 'invalid_active_until'],
    [
      'activeUntil before activeFrom',
      { activeFrom: d('2026-10-05'), activeUntil: d('2026-10-04') },
      'active_period_inverted',
    ],
    [
      'one-time date outside the active period',
      {
        recurrence: { kind: 'one_time', date: d('2026-12-01') } as const,
        activeUntil: d('2026-11-01'),
      },
      'one_time_outside_active_period',
    ],
  ])('rejects %s', (_label, overrides, code) => {
    const result = validateQuestTemplate(buildTemplate(overrides))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
  })
})
