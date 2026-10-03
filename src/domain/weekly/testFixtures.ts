import { asDateKey } from '../time/dateKey'
import { asWeekKey } from '../time/weekKey'
import type { WeeklyBoardDefinition, WeeklyGoal, WeeklyGoalBoard, WeeklyRewardTier } from './types'

/** Test-only builders for the weekly domain tests. Not part of the public domain API. */

export const WEEK = asWeekKey('2026-10-05') // Monday; its Sunday is 2026-10-11
export const SUNDAY = asDateKey('2026-10-11')
export const NEXT_MONDAY = asDateKey('2026-10-12')

export function goal(overrides: Partial<WeeklyGoal> & Pick<WeeklyGoal, 'id'>): WeeklyGoal {
  return {
    title: `Goal ${overrides.id}`,
    maxPoints: 1,
    target: 1,
    unit: null,
    tracking: { mode: 'manual' },
    manualProgress: 0,
    notes: null,
    ...overrides,
  }
}

export const TIERS: readonly WeeklyRewardTier[] = [
  { minScore: 6, text: 'Gaming' },
  { minScore: 7, text: 'Dessert' },
  { minScore: 8, text: 'Movie night' },
  { minScore: 9, text: 'Budgeted purchase' },
  { minScore: 10, text: 'Evening off' },
]

/** 3 + 3 + 2 + 1 + 1 = 10 manual goals with target 1 each. */
export function definition(overrides: Partial<WeeklyBoardDefinition> = {}): WeeklyBoardDefinition {
  return {
    focus: 'Keep the rules consistent.',
    goals: [
      goal({ id: 'wg_a', maxPoints: 3 }),
      goal({ id: 'wg_b', maxPoints: 3 }),
      goal({ id: 'wg_c', maxPoints: 2 }),
      goal({ id: 'wg_d', maxPoints: 1 }),
      goal({ id: 'wg_e', maxPoints: 1 }),
    ],
    rewardTiers: TIERS,
    ...overrides,
  }
}

export function activeBoard(overrides: Partial<WeeklyGoalBoard> = {}): WeeklyGoalBoard {
  return {
    weekKey: WEEK,
    startDate: WEEK,
    endDate: SUNDAY,
    status: 'active',
    createdAt: 1_000,
    updatedAt: 1_000,
    revision: 1,
    finalization: null,
    ...definition(),
    ...overrides,
  }
}
