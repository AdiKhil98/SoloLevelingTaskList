/**
 * Weekly Goal Crusher economy and limits (MASTER_SPEC §12). Approved values
 * live here and nowhere else; the UI and persistence read them from the domain.
 */

/** Every board's goal weights must add up to exactly this many points. */
export const WEEKLY_BOARD_TOTAL_POINTS = 10

/** Real-life reward tiers: the minimum score that earns each (6+, 7+, 8+, 9+, 10). */
export const WEEKLY_REWARD_TIER_SCORES = [6, 7, 8, 9, 10] as const

export type WeeklyRewardTierScore = (typeof WEEKLY_REWARD_TIER_SCORES)[number]

export function isWeeklyRewardTierScore(value: unknown): value is WeeklyRewardTierScore {
  return (WEEKLY_REWARD_TIER_SCORES as readonly unknown[]).includes(value)
}

/**
 * Weekly bonus EXP by final score, indexed 0–10. A lookup, never cumulative:
 * 9 / 10 is 325, not 100 + 150 + 225 + 325.
 */
export const WEEKLY_BONUS_EXP: readonly number[] = [0, 0, 0, 0, 0, 0, 100, 150, 225, 325, 500]

/** The bonus EXP for a final score. Anything that is not a whole score of 0–10 earns nothing. */
export function weeklyBonusExpForScore(score: number): number {
  if (!Number.isInteger(score)) return 0
  return WEEKLY_BONUS_EXP[score] ?? 0
}

/** Input limits for the user's own text and numbers (not game rules). */
export const WEEKLY_LIMITS = {
  focusMaxLength: 200,
  goalTitleMaxLength: 80,
  unitMaxLength: 24,
  notesMaxLength: 500,
  rewardTextMaxLength: 120,
  /** Largest allowed goal target. */
  targetMax: 9999,
  /** Largest allowed manual progress value. */
  progressMax: 99999,
} as const
