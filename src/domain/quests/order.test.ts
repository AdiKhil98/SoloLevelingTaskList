import { describe, expect, it } from 'vitest'
import {
  compareQuestOrder,
  hasUniqueSortOrders,
  isSortOrder,
  questOrderKeyOf,
  renumberInOrder,
  sortTemplatesByOrder,
  validateQuestTemplate,
} from '../index'
import { buildTemplate } from '../test-utils/builders'

const key = (sortOrder: number, templateCreatedAt: number, templateId: string) => ({ sortOrder, templateCreatedAt, templateId })

describe('isSortOrder', () => {
  it('accepts non-negative safe integers only', () => {
    for (const value of [0, 1, 41, Number.MAX_SAFE_INTEGER]) expect(isSortOrder(value)).toBe(true)
    for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '3', null, undefined]) {
      expect(isSortOrder(value)).toBe(false)
    }
  })

  it('is part of template validation', () => {
    expect(validateQuestTemplate(buildTemplate({ sortOrder: 0 })).ok).toBe(true)
    for (const sortOrder of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateQuestTemplate(buildTemplate({ sortOrder }))).toMatchObject({ ok: false, error: { code: 'invalid_sort_order' } })
    }
  })
})

describe('compareQuestOrder', () => {
  it('orders by sortOrder first, whatever the creation time or id', () => {
    const sorted = [key(2, 1, 'tpl_a'), key(0, 99, 'tpl_z'), key(1, 50, 'tpl_m')].sort(compareQuestOrder)
    expect(sorted.map((item) => item.templateId)).toEqual(['tpl_z', 'tpl_m', 'tpl_a'])
  })

  it('breaks a repeated sortOrder (damaged data only) by creation time, then template id, deterministically', () => {
    const items = [key(3, 2, 'tpl_b'), key(3, 1, 'tpl_z'), key(3, 2, 'tpl_a')]
    const expected = ['tpl_z', 'tpl_a', 'tpl_b']
    expect([...items].sort(compareQuestOrder).map((item) => item.templateId)).toEqual(expected)
    expect([...items].reverse().sort(compareQuestOrder).map((item) => item.templateId)).toEqual(expected)
  })

  it('compares large values exactly (no subtraction overflow)', () => {
    const high = key(Number.MAX_SAFE_INTEGER, 0, 'tpl_high')
    const low = key(0, 0, 'tpl_low')
    expect(compareQuestOrder(low, high)).toBeLessThan(0)
    expect(compareQuestOrder(high, low)).toBeGreaterThan(0)
    expect(compareQuestOrder(high, high)).toBe(0)
  })

  it('sorts a quest with no template (Infinity) after every real quest, then by creation time and id', () => {
    const orphan = (createdAt: number, id: string) => key(Number.POSITIVE_INFINITY, createdAt, id)
    const sorted = [orphan(5, 'tpl_x'), key(Number.MAX_SAFE_INTEGER, 0, 'tpl_real'), orphan(2, 'tpl_y'), orphan(2, 'tpl_a')].sort(compareQuestOrder)
    expect(sorted.map((item) => item.templateId)).toEqual(['tpl_real', 'tpl_a', 'tpl_y', 'tpl_x'])
  })
})

describe('template helpers', () => {
  const templates = [
    buildTemplate({ id: 'tpl_c', sortOrder: 7, createdAt: 1 }),
    buildTemplate({ id: 'tpl_a', sortOrder: 2, createdAt: 9 }),
    buildTemplate({ id: 'tpl_b', sortOrder: 5, createdAt: 3 }),
  ]

  it('questOrderKeyOf reads the three ordering fields', () => {
    expect(questOrderKeyOf(templates[0]!)).toEqual({ sortOrder: 7, templateCreatedAt: 1, templateId: 'tpl_c' })
  })

  it('sortTemplatesByOrder returns a new sorted array and leaves the input alone', () => {
    const before = templates.map((template) => template.id)
    expect(sortTemplatesByOrder(templates).map((template) => template.id)).toEqual(['tpl_a', 'tpl_b', 'tpl_c'])
    expect(templates.map((template) => template.id)).toEqual(before)
  })

  it('hasUniqueSortOrders', () => {
    expect(hasUniqueSortOrders(templates)).toBe(true)
    expect(hasUniqueSortOrders([...templates, buildTemplate({ id: 'tpl_d', sortOrder: 5 })])).toBe(false)
    expect(hasUniqueSortOrders([])).toBe(true)
  })

  it('renumberInOrder maps only the templates whose value changes, keeping the order', () => {
    const changes = renumberInOrder(templates)
    expect([...changes]).toEqual([
      ['tpl_a', 0],
      ['tpl_b', 1],
      ['tpl_c', 2],
    ])
    expect(renumberInOrder([buildTemplate({ id: 'tpl_a', sortOrder: 0 }), buildTemplate({ id: 'tpl_b', sortOrder: 1 })]).size).toBe(0)
  })

  it('renumberInOrder gives repeated values distinct numbers, ordered by creation time then id', () => {
    const repeated = [
      buildTemplate({ id: 'tpl_b', sortOrder: 4, createdAt: 2 }),
      buildTemplate({ id: 'tpl_a', sortOrder: 4, createdAt: 2 }),
      buildTemplate({ id: 'tpl_z', sortOrder: 4, createdAt: 1 }),
    ]
    expect([...renumberInOrder(repeated)]).toEqual([
      ['tpl_z', 0],
      ['tpl_a', 1],
      ['tpl_b', 2],
    ])
  })
})
