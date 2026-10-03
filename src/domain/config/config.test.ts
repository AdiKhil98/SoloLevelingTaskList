import { describe, expect, it } from 'vitest'
import { CATEGORIES } from './categories'
import { DIFFICULTIES, DIFFICULTY_EXP, expRewardForDifficulty } from './difficulty'
import { RANK_BANDS, RANK_IDS } from './ranks'

describe('difficulty rewards', () => {
  it.each([
    ['E', 10],
    ['D', 20],
    ['C', 35],
    ['B', 55],
    ['A', 80],
    ['S', 120],
  ] as const)('%s awards %i EXP', (difficulty, exp) => {
    expect(expRewardForDifficulty(difficulty)).toBe(exp)
    expect(DIFFICULTY_EXP[difficulty]).toBe(exp)
  })

  it('covers exactly the six difficulties', () => {
    expect([...DIFFICULTIES]).toEqual(['E', 'D', 'C', 'B', 'A', 'S'])
    expect(Object.keys(DIFFICULTY_EXP).sort()).toEqual([...DIFFICULTIES].sort())
  })
})

describe('categories', () => {
  it('are exactly the five approved categories', () => {
    expect([...CATEGORIES]).toEqual([
      'discipline',
      'fitness',
      'business',
      'knowledge',
      'trading',
    ])
  })
})

describe('rank configuration', () => {
  it('lists the six letter ranks plus the opaque 100+ tier, with no display name', () => {
    expect([...RANK_IDS]).toEqual(['E', 'D', 'C', 'B', 'A', 'S', 'special_100_plus'])
    expect(RANK_BANDS.map((band) => band.minLevel)).toEqual([1, 10, 20, 35, 50, 75, 100])
    for (const band of RANK_BANDS) {
      expect(Object.keys(band).sort()).toEqual(['minLevel', 'rank'])
    }
  })
})
