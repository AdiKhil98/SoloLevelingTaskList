import { describe, expect, it } from 'vitest'
import { dropIndex, moveItem, shiftFor } from './sortable'

describe('moveItem', () => {
  const items = ['a', 'b', 'c', 'd']

  it('moves an item down, up, to the top and to the bottom', () => {
    expect(moveItem(items, 0, 1)).toEqual(['b', 'a', 'c', 'd'])
    expect(moveItem(items, 3, 2)).toEqual(['a', 'b', 'd', 'c'])
    expect(moveItem(items, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(items, 0, 3)).toEqual(['b', 'c', 'd', 'a'])
    expect(moveItem(items, 1, 3)).toEqual(['a', 'c', 'd', 'b'])
  })

  it('returns an untouched copy for a no-op or an out-of-range request, and never changes its input', () => {
    expect(moveItem(items, 2, 2)).toEqual(items)
    expect(moveItem(items, -1, 2)).toEqual(items)
    expect(moveItem(items, 1, 9)).toEqual(items)
    expect(moveItem(items, 1, 2)).not.toBe(items)
    expect(items).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('dropIndex', () => {
  // Four rows, 100 px tall with 10 px gaps: centres at 50, 160, 270, 380.
  const centers = [50, 160, 270, 380]

  it('keeps the dragged item in its own place until it crosses a neighbour’s centre', () => {
    expect(dropIndex(centers, 1, 160)).toBe(1) // not moved
    expect(dropIndex(centers, 1, 160 + 109)).toBe(1) // just short of Asr's centre
    expect(dropIndex(centers, 1, 160 - 109)).toBe(1) // just short of Fajr's centre
  })

  it('lands one slot lower or higher once a centre is passed', () => {
    expect(dropIndex(centers, 1, 271)).toBe(2)
    expect(dropIndex(centers, 1, 49)).toBe(0)
    expect(dropIndex(centers, 0, 381)).toBe(3)
    expect(dropIndex(centers, 3, -500)).toBe(0)
  })

  it('clamps to the ends however far the pointer goes', () => {
    expect(dropIndex(centers, 0, 99_999)).toBe(3)
    expect(dropIndex(centers, 2, -99_999)).toBe(0)
  })

  it('works for a single item and an empty list', () => {
    expect(dropIndex([50], 0, 500)).toBe(0)
    expect(dropIndex([], 0, 10)).toBe(0)
  })
})

describe('shiftFor', () => {
  const slot = 110

  it('moves the rows the dragged row has passed out of its way, in the opposite direction', () => {
    // Dragging index 1 down onto index 3: rows 2 and 3 move up by one slot.
    expect([0, 1, 2, 3, 4].map((index) => shiftFor(index, 1, 3, slot))).toEqual([0, 0, -110, -110, 0])
    // Dragging index 3 up onto index 1: rows 1 and 2 move down by one slot.
    expect([0, 1, 2, 3, 4].map((index) => shiftFor(index, 3, 1, slot))).toEqual([0, 110, 110, 0, 0])
  })

  it('shifts nothing when the dragged row is over its own slot, and never shifts the dragged row itself', () => {
    expect([0, 1, 2, 3].map((index) => shiftFor(index, 2, 2, slot))).toEqual([0, 0, 0, 0])
    expect(shiftFor(1, 1, 3, slot)).toBe(0)
  })
})
