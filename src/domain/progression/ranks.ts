import { RANK_BANDS, type RankId } from '../config/ranks'
import { DomainError } from '../types/errors'

/** One rank boundary crossed while gaining levels. */
export interface RankTransition {
  readonly previousRank: RankId
  readonly newRank: RankId
  /** The level at which the new rank begins. */
  readonly atLevel: number
}

function assertLevel(level: number): void {
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new DomainError(
      'invalid_level',
      `Level must be a safe integer ≥ 1, got ${level}`,
    )
  }
}

/** Rank derived only from Player Level (MASTER_SPEC §9). */
export function rankOfLevel(level: number): RankId {
  assertLevel(level)
  let rank = RANK_BANDS[0]!.rank
  for (const band of RANK_BANDS) {
    if (level >= band.minLevel) rank = band.rank
  }
  return rank
}

/**
 * Every rank boundary crossed going from `fromLevel` to `toLevel`, ascending.
 * A large gain can cross several; none is dropped. Level 100 → 101 crosses
 * nothing because both are `special_100_plus`.
 */
export function rankTransitionsBetween(
  fromLevel: number,
  toLevel: number,
): readonly RankTransition[] {
  assertLevel(fromLevel)
  assertLevel(toLevel)
  if (toLevel < fromLevel) {
    throw new DomainError(
      'invalid_level',
      `Level cannot decrease (from ${fromLevel} to ${toLevel})`,
    )
  }

  const transitions: RankTransition[] = []
  for (const band of RANK_BANDS) {
    if (band.minLevel > fromLevel && band.minLevel <= toLevel) {
      transitions.push({
        previousRank: rankOfLevel(band.minLevel - 1),
        newRank: band.rank,
        atLevel: band.minLevel,
      })
    }
  }
  return transitions
}
