import { STARTING_LEVEL, XP_CURVE } from '../config/progression'
import { DomainError } from '../types/errors'
import { rankOfLevel } from './ranks'
import type { RankId } from '../config/ranks'

/**
 * Level math. Total EXP is authoritative; level is always derived from it.
 *
 * There is no gameplay level cap. The only limit is technical: totals and
 * cumulative sums must stay within `Number.MAX_SAFE_INTEGER` so that every
 * result is exact. Inputs that would leave that range throw a
 * `numeric_boundary` `DomainError` instead of silently losing precision.
 * (`Number.MAX_SAFE_INTEGER` of total EXP corresponds to a level in the
 * millions, far beyond anything reachable through play.)
 */

export interface LevelState {
  readonly level: number
  /** EXP accumulated inside the current level. */
  readonly expIntoLevel: number
  /** EXP the current level requires to reach the next one. */
  readonly expToNext: number
  readonly rank: RankId
}

function assertLevel(level: number): void {
  if (!Number.isSafeInteger(level) || level < STARTING_LEVEL) {
    throw new DomainError(
      'invalid_level',
      `Level must be a safe integer ≥ ${STARTING_LEVEL}, got ${level}`,
    )
  }
}

function assertTotalExp(totalExp: number): void {
  if (!Number.isSafeInteger(totalExp) || totalExp < 0) {
    throw new DomainError(
      'invalid_total_exp',
      `Total EXP must be a non-negative safe integer, got ${totalExp}`,
    )
  }
}

/** `XP_TO_NEXT(level)`: EXP needed to advance from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  assertLevel(level)
  const raw =
    XP_CURVE.base + XP_CURVE.coefficient * (level - 1) ** XP_CURVE.exponent
  const rounded = Math.round(raw)
  if (!Number.isSafeInteger(rounded)) {
    throw new DomainError(
      'numeric_boundary',
      `XP_TO_NEXT(${level}) is not representable as a safe integer`,
    )
  }
  return rounded
}

/** Total EXP required to reach `level` (0 for Level 1). */
export function totalExpToReachLevel(level: number): number {
  assertLevel(level)
  let total = 0
  for (let current = STARTING_LEVEL; current < level; current += 1) {
    const step = xpToNext(current)
    if (step > Number.MAX_SAFE_INTEGER - total) {
      throw new DomainError(
        'numeric_boundary',
        `Total EXP to reach level ${level} exceeds the safe integer range`,
      )
    }
    total += step
  }
  return total
}

/** Derives level, in-level progress and rank from permanent total EXP. */
export function levelStateOf(totalExp: number): LevelState {
  assertTotalExp(totalExp)
  let level = STARTING_LEVEL
  let levelFloor = 0
  for (;;) {
    const expToNext = xpToNext(level)
    // `totalExp - levelFloor` never overflows and `levelFloor ≤ totalExp`.
    if (totalExp - levelFloor < expToNext) {
      return {
        level,
        expIntoLevel: totalExp - levelFloor,
        expToNext,
        rank: rankOfLevel(level),
      }
    }
    levelFloor += expToNext
    level += 1
  }
}

export function levelOf(totalExp: number): number {
  return levelStateOf(totalExp).level
}
