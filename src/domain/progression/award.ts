import { DomainError } from '../types/errors'
import { levelStateOf, type LevelState } from './levels'
import { rankTransitionsBetween, type RankTransition } from './ranks'

/** What a single EXP award did to the player's derived progression. */
export interface ProgressionChange {
  readonly totalExpBefore: number
  readonly totalExpAfter: number
  readonly before: LevelState
  readonly after: LevelState
  /** Every level newly reached, ascending (empty when none). */
  readonly levelsCrossed: readonly number[]
  /** Every rank boundary newly crossed, ascending by level (empty when none). */
  readonly rankTransitions: readonly RankTransition[]
}

/**
 * Applies a positive EXP award to `totalExpBefore` and reports the truth
 * about level and rank changes. One award may cross many levels and several
 * rank boundaries; all are reported.
 */
export function applyExpAward(
  totalExpBefore: number,
  amount: number,
): ProgressionChange {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new DomainError(
      'invalid_exp_amount',
      `EXP amount must be a positive safe integer, got ${amount}`,
    )
  }
  const totalExpAfter = totalExpBefore + amount
  if (Number.isSafeInteger(totalExpBefore) && !Number.isSafeInteger(totalExpAfter)) {
    throw new DomainError(
      'numeric_boundary',
      'Total EXP would exceed the safe integer range',
    )
  }

  const before = levelStateOf(totalExpBefore)
  const after = levelStateOf(totalExpAfter)
  const levelsCrossed: number[] = []
  for (let level = before.level + 1; level <= after.level; level += 1) {
    levelsCrossed.push(level)
  }

  return {
    totalExpBefore,
    totalExpAfter,
    before,
    after,
    levelsCrossed,
    rankTransitions: rankTransitionsBetween(before.level, after.level),
  }
}
