export const RANK_IDS = [
  'E',
  'D',
  'C',
  'B',
  'A',
  'S',
  'special_100_plus',
] as const

/**
 * `special_100_plus` is an opaque identifier. Its display name is an open
 * decision (OD-01) and must not be invented here.
 */
export type RankId = (typeof RANK_IDS)[number]

export interface RankBand {
  readonly rank: RankId
  /** First level (inclusive) belonging to this rank. */
  readonly minLevel: number
}

/**
 * Approved rank bands (MASTER_SPEC §9), ascending by `minLevel`. The last
 * band is open-ended: every level from 100 upward is `special_100_plus`.
 */
export const RANK_BANDS: readonly RankBand[] = [
  { rank: 'E', minLevel: 1 },
  { rank: 'D', minLevel: 10 },
  { rank: 'C', minLevel: 20 },
  { rank: 'B', minLevel: 35 },
  { rank: 'A', minLevel: 50 },
  { rank: 'S', minLevel: 75 },
  { rank: 'special_100_plus', minLevel: 100 },
]
