// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DIFFICULTIES, CATEGORIES } from '@/domain'
import { buildFormValues, buildTemplate, d } from '../test-utils/helpers'
import { defaultQuestFormValues, formValuesFromTemplate, parseQuestForm, type QuestFormValues } from './questForm'

// 2026-10-05 is a Monday.
const TODAY = d('2026-10-05')

function parse(overrides: Partial<QuestFormValues> = {}, current?: ReturnType<typeof buildTemplate>) {
  return parseQuestForm(buildFormValues(overrides), { today: TODAY, ...(current === undefined ? {} : { current }) })
}

function errorsOf(overrides: Partial<QuestFormValues>, current?: ReturnType<typeof buildTemplate>) {
  const result = parse(overrides, current)
  if (result.ok) throw new Error('expected the form to be invalid')
  return result.error
}

function definitionOf(overrides: Partial<QuestFormValues>, current?: ReturnType<typeof buildTemplate>) {
  const result = parse(overrides, current)
  if (!result.ok) throw new Error(`expected a valid form: ${JSON.stringify(result.error)}`)
  return result.value
}

describe('defaults', () => {
  it('start as Daily, Normal (C), Discipline, starting today', () => {
    expect(defaultQuestFormValues(TODAY)).toEqual({
      title: '',
      recurrence: 'daily',
      difficulty: 'C',
      category: 'discipline',
      weekdays: [],
      startDate: TODAY,
      intervalDays: '2',
      questDate: TODAY,
    })
  })

  it('require a title before a new quest is valid', () => {
    expect(parseQuestForm(defaultQuestFormValues(TODAY), { today: TODAY })).toEqual({
      ok: false,
      error: { title: 'title_required' },
    })
  })
})

describe('title', () => {
  it('is trimmed', () => {
    expect(definitionOf({ title: '  Backtesting  ' }).title).toBe('Backtesting')
  })

  it.each(['', '   ', '\t\n'])('rejects %j as empty', (title) => {
    expect(errorsOf({ title })).toEqual({ title: 'title_required' })
  })

  it('has no length limit beyond non-empty (the domain has none)', () => {
    expect(definitionOf({ title: 'x'.repeat(500) }).title).toHaveLength(500)
  })
})

describe('difficulty and category', () => {
  it.each(DIFFICULTIES)('accepts difficulty %s', (difficulty) => {
    expect(definitionOf({ difficulty }).difficulty).toBe(difficulty)
  })

  it.each(['', 'F', 'c', 'SS', '35'])('rejects difficulty %j', (difficulty) => {
    expect(errorsOf({ difficulty })).toEqual({ difficulty: 'difficulty_required' })
  })

  it.each(CATEGORIES)('accepts category %s', (category) => {
    expect(definitionOf({ category }).category).toBe(category)
  })

  it.each(['', 'gym', 'Fitness', 'health'])('rejects category %j (only the five approved categories exist)', (category) => {
    expect(errorsOf({ category })).toEqual({ category: 'category_required' })
  })

  it('carries no EXP: the definition is title, difficulty, category, recurrence and start only', () => {
    const definition = definitionOf({ difficulty: 'B' })
    expect(Object.keys(definition).sort()).toEqual(['activeFrom', 'category', 'difficulty', 'recurrence', 'title'])
  })
})

describe('Daily', () => {
  it('builds a daily recurrence active from the start date', () => {
    expect(definitionOf({ startDate: '2026-10-09' })).toMatchObject({
      recurrence: { kind: 'daily' },
      activeFrom: '2026-10-09',
    })
  })

  it('defaults to starting today', () => {
    expect(definitionOf({}).activeFrom).toBe(TODAY)
  })

  it.each([
    ['', 'date_required'],
    ['   ', 'date_required'],
    ['not a date', 'date_invalid'],
    ['2026-02-30', 'date_invalid'],
    ['2027-02-29', 'date_invalid'],
    ['2026-13-01', 'date_invalid'],
    ['2026-1-5', 'date_invalid'],
    ['2026-10-04', 'date_in_past'],
    ['2020-01-01', 'date_in_past'],
  ])('rejects start date %j with %s', (startDate, code) => {
    expect(errorsOf({ startDate })).toEqual({ startDate: code })
  })

  it('accepts a leap day', () => {
    expect(definitionOf({ startDate: '2028-02-29' }).activeFrom).toBe('2028-02-29')
  })
})

describe('Selected weekdays', () => {
  it('builds ISO weekdays, sorted and unique', () => {
    const definition = definitionOf({ recurrence: 'weekdays', weekdays: [5, 1, 3, 3, 1] })
    expect(definition.recurrence).toEqual({ kind: 'weekdays', weekdays: [1, 3, 5] })
  })

  it('requires at least one weekday', () => {
    expect(errorsOf({ recurrence: 'weekdays', weekdays: [] })).toEqual({ weekdays: 'weekdays_required' })
  })

  it.each([[[0]], [[8]], [[1, 9]], [[1.5]], [[-1]]])('rejects out-of-range weekday list %j', (weekdays) => {
    expect(errorsOf({ recurrence: 'weekdays', weekdays })).toEqual({ weekdays: 'weekdays_invalid' })
  })

  it('accepts every day of the week (Monday = 1 … Sunday = 7)', () => {
    const definition = definitionOf({ recurrence: 'weekdays', weekdays: [7, 6, 5, 4, 3, 2, 1] })
    expect(definition.recurrence).toEqual({ kind: 'weekdays', weekdays: [1, 2, 3, 4, 5, 6, 7] })
  })

  it('also validates the start date', () => {
    expect(errorsOf({ recurrence: 'weekdays', weekdays: [1], startDate: '2026-10-04' })).toEqual({
      startDate: 'date_in_past',
    })
  })

  it('reports both problems at once', () => {
    expect(errorsOf({ recurrence: 'weekdays', weekdays: [], startDate: '' })).toEqual({
      weekdays: 'weekdays_required',
      startDate: 'date_required',
    })
  })
})

describe('Interval', () => {
  it('builds an interval whose anchor is the start date, and the anchor is the first active day', () => {
    const definition = definitionOf({ recurrence: 'interval', intervalDays: '3', startDate: '2026-10-08' })
    expect(definition.recurrence).toEqual({ kind: 'interval', everyNDays: 3, anchor: '2026-10-08' })
    expect(definition.activeFrom).toBe('2026-10-08')
  })

  it('trims the number', () => {
    expect(definitionOf({ recurrence: 'interval', intervalDays: ' 4 ' }).recurrence).toMatchObject({ everyNDays: 4 })
  })

  it.each([
    ['', 'interval_required'],
    ['  ', 'interval_required'],
    ['abc', 'interval_not_integer'],
    ['2.5', 'interval_not_integer'],
    ['2,5', 'interval_not_integer'],
    ['-3', 'interval_not_integer'],
    ['+3', 'interval_not_integer'],
    ['1e1', 'interval_not_integer'],
    ['0x10', 'interval_not_integer'],
    ['99999999999999999999', 'interval_not_integer'],
    ['0', 'interval_too_small'],
    ['1', 'interval_too_small'],
    ['01', 'interval_too_small'],
  ])('rejects %j with %s', (intervalDays, code) => {
    expect(errorsOf({ recurrence: 'interval', intervalDays })).toEqual({ intervalDays: code })
  })

  it('accepts 2 (the smallest interval) and large intervals', () => {
    expect(definitionOf({ recurrence: 'interval', intervalDays: '2' }).recurrence).toMatchObject({ everyNDays: 2 })
    expect(definitionOf({ recurrence: 'interval', intervalDays: '365' }).recurrence).toMatchObject({ everyNDays: 365 })
  })

  it('requires a start date', () => {
    expect(errorsOf({ recurrence: 'interval', startDate: '' })).toEqual({ startDate: 'date_required' })
  })
})

describe('One-Time', () => {
  it('builds a one-time recurrence on the quest date, active from today', () => {
    const definition = definitionOf({ recurrence: 'one_time', questDate: '2026-10-20' })
    expect(definition.recurrence).toEqual({ kind: 'one_time', date: '2026-10-20' })
    expect(definition.activeFrom).toBe(TODAY)
  })

  it('accepts today', () => {
    expect(definitionOf({ recurrence: 'one_time', questDate: TODAY }).recurrence).toEqual({
      kind: 'one_time',
      date: TODAY,
    })
  })

  it.each([
    ['', 'date_required'],
    ['2026-02-30', 'date_invalid'],
    ['2026-10-04', 'date_in_past'],
  ])('rejects quest date %j with %s', (questDate, code) => {
    expect(errorsOf({ recurrence: 'one_time', questDate })).toEqual({ questDate: code })
  })

  it('ignores the fields that belong to other types', () => {
    const definition = definitionOf({
      recurrence: 'one_time',
      questDate: '2026-10-07',
      startDate: 'garbage',
      intervalDays: 'garbage',
      weekdays: [99],
    })
    expect(definition.recurrence).toEqual({ kind: 'one_time', date: '2026-10-07' })
  })
})

describe('unknown recurrence', () => {
  it('is rejected', () => {
    expect(errorsOf({ recurrence: 'monthly' as never })).toEqual({ recurrence: 'recurrence_invalid' })
    expect(errorsOf({ recurrence: 'cron' as never })).toEqual({ recurrence: 'recurrence_invalid' })
  })
})

describe('editing an existing template', () => {
  const stored = buildTemplate({ activeFrom: d('2026-09-01'), recurrence: { kind: 'daily' } })

  it('keeps an unchanged start date even though it is in the past', () => {
    expect(definitionOf({ startDate: '2026-09-01' }, stored).activeFrom).toBe('2026-09-01')
  })

  it('still rejects a CHANGED start date in the past', () => {
    expect(errorsOf({ startDate: '2026-09-02' }, stored)).toEqual({ startDate: 'date_in_past' })
  })

  it('accepts moving a future start date to today', () => {
    const future = buildTemplate({ activeFrom: d('2026-10-20') })
    expect(definitionOf({ startDate: TODAY }, future).activeFrom).toBe(TODAY)
  })

  it('keeps an interval’s stored past anchor when the start date is untouched', () => {
    const interval = buildTemplate({
      activeFrom: d('2026-09-30'),
      recurrence: { kind: 'interval', everyNDays: 2, anchor: d('2026-09-30') },
    })
    const definition = definitionOf({ recurrence: 'interval', intervalDays: '5', startDate: '2026-09-30' }, interval)
    expect(definition.recurrence).toEqual({ kind: 'interval', everyNDays: 5, anchor: '2026-09-30' })
  })

  it('keeps a stored past one-time date, and rejects a different past one', () => {
    const oneTime = buildTemplate({
      activeFrom: d('2026-09-28'),
      recurrence: { kind: 'one_time', date: d('2026-10-01') },
    })
    expect(definitionOf({ recurrence: 'one_time', questDate: '2026-10-01' }, oneTime).activeFrom).toBe('2026-09-28')
    expect(errorsOf({ recurrence: 'one_time', questDate: '2026-10-02' }, oneTime)).toEqual({
      questDate: 'date_in_past',
    })
  })

  it('never lets a one-time quest start after its own date', () => {
    const laterStart = buildTemplate({ activeFrom: d('2026-10-20') })
    const definition = definitionOf({ recurrence: 'one_time', questDate: '2026-10-08' }, laterStart)
    expect(definition.activeFrom).toBe('2026-10-08')
  })
})

describe('formValuesFromTemplate', () => {
  it('describes a weekday template', () => {
    const template = buildTemplate({
      title: 'Gym',
      difficulty: 'B',
      category: 'fitness',
      recurrence: { kind: 'weekdays', weekdays: [1, 3, 5] },
      activeFrom: d('2026-10-01'),
    })
    expect(formValuesFromTemplate(template, TODAY)).toMatchObject({
      title: 'Gym',
      recurrence: 'weekdays',
      difficulty: 'B',
      category: 'fitness',
      weekdays: [1, 3, 5],
      startDate: '2026-10-01',
    })
  })

  it('shows an interval’s anchor as its start date and its N', () => {
    const template = buildTemplate({
      activeFrom: d('2026-10-03'),
      recurrence: { kind: 'interval', everyNDays: 4, anchor: d('2026-10-03') },
    })
    expect(formValuesFromTemplate(template, TODAY)).toMatchObject({
      recurrence: 'interval',
      intervalDays: '4',
      startDate: '2026-10-03',
    })
  })

  it('shows a one-time quest’s date', () => {
    const template = buildTemplate({ recurrence: { kind: 'one_time', date: d('2026-10-08') } })
    expect(formValuesFromTemplate(template, TODAY)).toMatchObject({ recurrence: 'one_time', questDate: '2026-10-08' })
  })

  it('never exposes internal fields', () => {
    const values = formValuesFromTemplate(buildTemplate({ seedKey: 'sleep', role: 'sleep', id: 'tpl_seed_sleep' }), TODAY)
    expect(Object.keys(values).sort()).toEqual(
      ['category', 'difficulty', 'intervalDays', 'questDate', 'recurrence', 'startDate', 'title', 'weekdays'].sort(),
    )
    expect(JSON.stringify(values)).not.toMatch(/sleep|tpl_|seed/i)
  })
})
