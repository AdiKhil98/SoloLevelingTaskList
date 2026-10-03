export const DIFFICULTIES = ['E', 'D', 'C', 'B', 'A', 'S'] as const

export type Difficulty = (typeof DIFFICULTIES)[number]

/** Approved V1 quest EXP by difficulty (MASTER_SPEC §5.3). The only source. */
export const DIFFICULTY_EXP: Readonly<Record<Difficulty, number>> = {
  E: 10,
  D: 20,
  C: 35,
  B: 55,
  A: 80,
  S: 120,
}

export function isDifficulty(value: unknown): value is Difficulty {
  return (
    typeof value === 'string' &&
    (DIFFICULTIES as readonly string[]).includes(value)
  )
}

/** Quest EXP is derived from difficulty alone; there are no overrides in V1. */
export function expRewardForDifficulty(difficulty: Difficulty): number {
  return DIFFICULTY_EXP[difficulty]
}
