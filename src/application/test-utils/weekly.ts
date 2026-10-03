import type { WeeklyBoardFormValues, WeeklyGoalFormValues } from '../weekly/weeklyBoardForm'

/** Test-only builders of Weekly Goal Crusher form values. Not part of the public application API. */

export const REWARD_TEXTS = {
  6: 'Gaming',
  7: 'Dessert',
  8: 'Movie night',
  9: 'Budgeted purchase',
  10: 'Evening off',
} as const

/** A manual goal row (worth `points`, target `target`); override what a test cares about. */
export function goalRow(key: string, overrides: Partial<WeeklyGoalFormValues> = {}): WeeklyGoalFormValues {
  return {
    key,
    goalId: null,
    title: `Goal ${key}`,
    points: 1,
    target: '1',
    unit: '',
    trackingMode: 'manual',
    templateId: '',
    notes: '',
    ...overrides,
  }
}

/** A valid create form: 6 + 4 = 10 points over two manual goals, with all five reward texts. */
export function weeklyForm(overrides: Partial<WeeklyBoardFormValues> = {}): WeeklyBoardFormValues {
  return {
    revision: null,
    focus: 'Build clean backtesting reps.',
    goals: [
      goalRow('g1', { title: 'Complete backtests', points: 6, target: '20', unit: 'backtests' }),
      goalRow('g2', { title: 'Finish the report', points: 4, target: '1' }),
    ],
    rewards: { ...REWARD_TEXTS },
    ...overrides,
  }
}

/** Ten one-point manual goals (digits-only target `1`): a board whose manual progress can reach any score 0–10. */
export function tenGoals(): WeeklyGoalFormValues[] {
  return Array.from({ length: 10 }, (_, index) => goalRow(`t${index}`, { title: `Task ${index}`, points: 1, target: '1' }))
}
