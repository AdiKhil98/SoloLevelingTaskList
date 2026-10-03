import { describe, expect, it } from 'vitest'
import { applyExpAward } from './award'
import { totalExpToReachLevel } from './levels'

describe('applyExpAward', () => {
  it('reports no level change when the award stays inside a level', () => {
    const change = applyExpAward(0, 55)
    expect(change.totalExpAfter).toBe(55)
    expect(change.before.level).toBe(1)
    expect(change.after).toMatchObject({ level: 1, expIntoLevel: 55, expToNext: 100 })
    expect(change.levelsCrossed).toEqual([])
    expect(change.rankTransitions).toEqual([])
  })

  it('stops one EXP short of a level', () => {
    expect(applyExpAward(0, 99).levelsCrossed).toEqual([])
  })

  it('crosses exactly one level at the threshold', () => {
    const change = applyExpAward(0, 100)
    expect(change.levelsCrossed).toEqual([2])
    expect(change.after).toMatchObject({ level: 2, expIntoLevel: 0, expToNext: 135 })
  })

  it('crosses one level from partway through', () => {
    const change = applyExpAward(90, 35)
    expect(change.totalExpAfter).toBe(125)
    expect(change.levelsCrossed).toEqual([2])
    expect(change.after.expIntoLevel).toBe(25)
  })

  it('crosses multiple levels with one award (spec example: 500 EXP from 0)', () => {
    const change = applyExpAward(0, 500)
    expect(change.totalExpBefore).toBe(0)
    expect(change.totalExpAfter).toBe(500)
    expect(change.before.level).toBe(1)
    expect(change.after).toMatchObject({ level: 4, expIntoLevel: 82, expToNext: 238 })
    expect(change.levelsCrossed).toEqual([2, 3, 4])
  })

  it('lists levels ascending and without gaps across a large gain', () => {
    const change = applyExpAward(0, totalExpToReachLevel(60) + 1)
    expect(change.levelsCrossed).toEqual(Array.from({ length: 59 }, (_, i) => i + 2))
  })

  it('crosses a single rank boundary and names the level that caused it', () => {
    const change = applyExpAward(totalExpToReachLevel(10) - 1, 1)
    expect(change.levelsCrossed).toEqual([10])
    expect(change.rankTransitions).toEqual([
      { previousRank: 'E', newRank: 'D', atLevel: 10 },
    ])
  })

  it('reports every rank boundary when one award crosses several', () => {
    const change = applyExpAward(0, totalExpToReachLevel(36))
    expect(change.after.level).toBe(36)
    expect(change.rankTransitions).toEqual([
      { previousRank: 'E', newRank: 'D', atLevel: 10 },
      { previousRank: 'D', newRank: 'C', atLevel: 20 },
      { previousRank: 'C', newRank: 'B', atLevel: 35 },
    ])
  })

  it('crosses all six rank boundaries from a fresh player to Level 100', () => {
    const change = applyExpAward(0, 485_351)
    expect(change.after.level).toBe(100)
    expect(change.rankTransitions.map((t) => t.newRank)).toEqual([
      'D',
      'C',
      'B',
      'A',
      'S',
      'special_100_plus',
    ])
    expect(change.levelsCrossed).toHaveLength(99)
  })

  it('does not create another rank-up past Level 100', () => {
    const change = applyExpAward(485_351, 50_000)
    expect(change.before.level).toBe(100)
    expect(change.after.level).toBeGreaterThan(100)
    expect(change.levelsCrossed.length).toBeGreaterThan(0)
    expect(change.rankTransitions).toEqual([])
    expect(change.after.rank).toBe('special_100_plus')
  })

  it('rejects zero, negative, fractional and unsafe amounts', () => {
    for (const bad of [0, -5, 1.5, Number.NaN, 2 ** 53]) {
      expect(() => applyExpAward(0, bad)).toThrow(
        expect.objectContaining({ code: 'invalid_exp_amount' }),
      )
    }
  })

  it('rejects an invalid starting total', () => {
    expect(() => applyExpAward(-1, 10)).toThrow(
      expect.objectContaining({ code: 'invalid_total_exp' }),
    )
  })

  it('fails explicitly at the safe-integer boundary instead of losing precision', () => {
    expect(() => applyExpAward(Number.MAX_SAFE_INTEGER, 1)).toThrow(
      expect.objectContaining({ code: 'numeric_boundary' }),
    )
  })
})
