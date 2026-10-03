import { describe, expect, it } from 'vitest'
import { RANK_IDS } from '@/domain'
import { categoryLabel, dayQualityLabel, PLAYER_LABEL, rankLabel } from './displayLabels'

describe('display labels', () => {
  it('labels every known rank and shows ??? for the unnamed Level 100+ rank (OD-01)', () => {
    expect(['E', 'D', 'C', 'B', 'A', 'S'].map((rank) => rankLabel(rank as (typeof RANK_IDS)[number]))).toEqual([
      'E-RANK',
      'D-RANK',
      'C-RANK',
      'B-RANK',
      'A-RANK',
      'S-RANK',
    ])
    expect(rankLabel('special_100_plus')).toBe('???')
    for (const rank of RANK_IDS) expect(rankLabel(rank)).not.toBe('')
  })

  it('labels every day quality', () => {
    expect(dayQualityLabel('incomplete')).toBe('Incomplete')
    expect(dayQualityLabel('completed')).toBe('Completed')
    expect(dayQualityLabel('strong')).toBe('Strong')
    expect(dayQualityLabel('perfect')).toBe('Perfect')
    expect(dayQualityLabel('no_active_quests')).toBe('No Active Quests')
  })

  it('labels categories and uses a neutral player label', () => {
    expect(categoryLabel('discipline')).toBe('Discipline')
    expect(PLAYER_LABEL).toBe('PLAYER')
  })
})
