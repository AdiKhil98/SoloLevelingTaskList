/** Every player starts at Level 1 with 0 total EXP. */
export const STARTING_LEVEL = 1

/**
 * `XP_TO_NEXT(L) = round(BASE + COEFFICIENT × (L − 1)^EXPONENT)` for L ≥ 1
 * (MASTER_SPEC §8). There is no level cap.
 */
export const XP_CURVE = {
  base: 100,
  coefficient: 35,
  exponent: 1.25,
} as const
