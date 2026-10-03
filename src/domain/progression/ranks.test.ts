import { describe, expect, it } from 'vitest'
import { rankOfLevel, rankTransitionsBetween } from './ranks'

describe('rankOfLevel', () => {
  it.each([
    [1, 'E'],
    [9, 'E'],
    [10, 'D'],
    [19, 'D'],
    [20, 'C'],
    [34, 'C'],
    [35, 'B'],
    [49, 'B'],
    [50, 'A'],
    [74, 'A'],
    [75, 'S'],
    [99, 'S'],
    [100, 'special_100_plus'],
    [101, 'special_100_plus'],
    [5_000, 'special_100_plus'],
    [3_000_000, 'special_100_plus'],
  ] as const)('level %i is %s', (level, rank) => {
    expect(rankOfLevel(level)).toBe(rank)
  })

  it('rejects invalid levels', () => {
    for (const bad of [0, -3, 2.5, Number.NaN]) {
      expect(() => rankOfLevel(bad)).toThrow(expect.objectContaining({ code: 'invalid_level' }))
    }
  })
})

describe('rankTransitionsBetween', () => {
  it.each([
    [9, 10, 'E', 'D'],
    [19, 20, 'D', 'C'],
    [34, 35, 'C', 'B'],
    [49, 50, 'B', 'A'],
    [74, 75, 'A', 'S'],
    [99, 100, 'S', 'special_100_plus'],
  ] as const)('crossing %i → %i is a %s → %s rank-up', (from, to, previousRank, newRank) => {
    expect(rankTransitionsBetween(from, to)).toEqual([
      { previousRank, newRank, atLevel: to },
    ])
  })

  it('reports no transition inside a band', () => {
    expect(rankTransitionsBetween(1, 9)).toEqual([])
    expect(rankTransitionsBetween(10, 19)).toEqual([])
    expect(rankTransitionsBetween(50, 74)).toEqual([])
    expect(rankTransitionsBetween(7, 7)).toEqual([])
  })

  it('treats 100 → 101 and beyond as no further rank-up', () => {
    expect(rankTransitionsBetween(100, 101)).toEqual([])
    expect(rankTransitionsBetween(100, 100_000)).toEqual([])
  })

  it('keeps every boundary when a gain crosses several, ascending', () => {
    expect(rankTransitionsBetween(8, 36)).toEqual([
      { previousRank: 'E', newRank: 'D', atLevel: 10 },
      { previousRank: 'D', newRank: 'C', atLevel: 20 },
      { previousRank: 'C', newRank: 'B', atLevel: 35 },
    ])
    expect(rankTransitionsBetween(1, 100).map((t) => t.atLevel)).toEqual([
      10, 20, 35, 50, 75, 100,
    ])
  })

  it('does not count the starting level of the band you are already in', () => {
    expect(rankTransitionsBetween(10, 20)).toEqual([
      { previousRank: 'D', newRank: 'C', atLevel: 20 },
    ])
  })

  it('rejects a decreasing level range', () => {
    expect(() => rankTransitionsBetween(10, 9)).toThrow(
      expect.objectContaining({ code: 'invalid_level' }),
    )
  })
})
