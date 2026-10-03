import { describe, expect, it } from 'vitest'
import { levelOf, levelStateOf, totalExpToReachLevel, xpToNext } from './levels'

// MASTER_SPEC §8.1 golden table.
const XP_TO_NEXT_GOLDEN: ReadonlyArray<readonly [number, number]> = [
  [1, 100],
  [2, 135],
  [3, 183],
  [4, 238],
  [5, 298],
  [6, 362],
  [7, 429],
  [8, 499],
  [9, 571],
  [10, 646],
  [20, 1488],
  [35, 2974],
  [50, 4637],
  [75, 7696],
  [99, 10892],
]

const CUMULATIVE_GOLDEN: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [2, 100],
  [3, 235],
  [4, 418],
  [5, 656],
  [6, 954],
  [7, 1316],
  [8, 1745],
  [9, 2244],
  [10, 2815],
  [20, 12937],
  [35, 45392],
  [50, 101454],
  [75, 253446],
  [99, 474459],
  [100, 485351],
]

describe('xpToNext', () => {
  it.each(XP_TO_NEXT_GOLDEN)('level %i → next costs %i', (level, cost) => {
    expect(xpToNext(level)).toBe(cost)
  })

  it('matches the formula round(100 + 35 × (L − 1)^1.25) at every level to 500', () => {
    for (let level = 1; level <= 500; level += 1) {
      expect(xpToNext(level)).toBe(Math.round(100 + 35 * Math.pow(level - 1, 1.25)))
    }
  })

  it('is strictly increasing', () => {
    for (let level = 1; level < 500; level += 1) {
      expect(xpToNext(level + 1)).toBeGreaterThan(xpToNext(level))
    }
  })

  it('rejects levels below 1, fractions and non-finite values', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => xpToNext(bad)).toThrow(expect.objectContaining({ code: 'invalid_level' }))
    }
  })
})

describe('totalExpToReachLevel', () => {
  it.each(CUMULATIVE_GOLDEN)('reaching level %i takes %i total EXP', (level, total) => {
    expect(totalExpToReachLevel(level)).toBe(total)
  })

  it('reaching Level 100 takes 485,351 EXP', () => {
    expect(totalExpToReachLevel(100)).toBe(485_351)
  })

  it('is the running sum of xpToNext', () => {
    let running = 0
    for (let level = 1; level <= 300; level += 1) {
      expect(totalExpToReachLevel(level)).toBe(running)
      running += xpToNext(level)
    }
  })

  it('terminates with a numeric-boundary error for absurd levels instead of hanging', () => {
    expect(() => totalExpToReachLevel(Number.MAX_SAFE_INTEGER)).toThrow(
      expect.objectContaining({ code: 'numeric_boundary' }),
    )
    expect(() => totalExpToReachLevel(1e9)).toThrow(
      expect.objectContaining({ code: 'numeric_boundary' }),
    )
  })

  it('rejects invalid levels', () => {
    expect(() => totalExpToReachLevel(0)).toThrow(expect.objectContaining({ code: 'invalid_level' }))
    expect(() => totalExpToReachLevel(2.5)).toThrow(expect.objectContaining({ code: 'invalid_level' }))
  })
})

describe('levelStateOf', () => {
  it('starts at Level 1 with 0 EXP', () => {
    expect(levelStateOf(0)).toEqual({ level: 1, expIntoLevel: 0, expToNext: 100, rank: 'E' })
  })

  it('handles the exact boundary around every golden threshold', () => {
    for (const [level, total] of CUMULATIVE_GOLDEN) {
      expect(levelOf(total)).toBe(level)
      expect(levelStateOf(total).expIntoLevel).toBe(0)
      if (total > 0) {
        expect(levelOf(total - 1)).toBe(level - 1)
        expect(levelStateOf(total - 1).expIntoLevel).toBe(xpToNext(level - 1) - 1)
      }
      expect(levelOf(total + 1)).toBe(level)
      expect(levelStateOf(total + 1).expIntoLevel).toBe(1)
    }
  })

  it('is exactly one level boundary at 99 / 100 / 101 EXP', () => {
    expect(levelOf(99)).toBe(1)
    expect(levelOf(100)).toBe(2)
    expect(levelOf(101)).toBe(2)
  })

  it('places the spec example of 500 total EXP at Level 4, 82 / 238 in', () => {
    expect(levelStateOf(500)).toEqual({
      level: 4,
      expIntoLevel: 82,
      expToNext: 238,
      rank: 'E',
    })
  })

  it('has no level cap: Level 100 is an ordinary level and play continues past it', () => {
    const at100 = levelStateOf(485_351)
    expect(at100).toMatchObject({ level: 100, expIntoLevel: 0, rank: 'special_100_plus' })
    expect(at100.expToNext).toBe(xpToNext(100))

    expect(levelOf(485_351 + xpToNext(100))).toBe(101)
    expect(levelOf(totalExpToReachLevel(250))).toBe(250)
    expect(levelOf(totalExpToReachLevel(1000) + 5)).toBe(1000)
    expect(levelStateOf(totalExpToReachLevel(1000) + 5).rank).toBe('special_100_plus')
  })

  it('derives exact progress at the largest safe total EXP', () => {
    const state = levelStateOf(Number.MAX_SAFE_INTEGER)
    expect(state.level).toBeGreaterThan(1_000_000)
    expect(state.expIntoLevel).toBeGreaterThanOrEqual(0)
    expect(state.expIntoLevel).toBeLessThan(state.expToNext)
    // The decomposition is exact: floor of this level + progress = the total.
    expect(totalExpToReachLevel(state.level) + state.expIntoLevel).toBe(
      Number.MAX_SAFE_INTEGER,
    )
  })

  it('rejects negative, fractional, non-finite and unsafe totals', () => {
    for (const bad of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => levelStateOf(bad)).toThrow(expect.objectContaining({ code: 'invalid_total_exp' }))
    }
  })
})
