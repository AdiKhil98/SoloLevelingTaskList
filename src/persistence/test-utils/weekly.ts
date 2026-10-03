import { compareDateKeys, nextDate, type DateKey, type QuestTemplate, type WeeklyBoardDefinition, type WeeklyGoal } from '@/domain'
import { completeQuestAtomically } from '../commands/completeQuest'
import { finalizeDayAtomically } from '../commands/finalizeDay'
import { finalizeWeekAtomically, type FinalizeWeekResult } from '../commands/finalizeWeek'
import { saveWeeklyBoardAtomically } from '../commands/saveWeeklyBoard'
import type { PersistenceDatabase } from '../database/connection'
import { ensureOccurrence } from '../repositories/occurrences'
import { createTemplate } from '../repositories/templates'
import { buildTemplate, d, noonOn, ZONE } from './helpers'

/** Test-only helpers for the weekly persistence tests. Not part of the public persistence API. */

export const WEEK = d('2026-10-05') // Monday; Sunday is 2026-10-11
export const NEXT_WEEK = d('2026-10-12')
export const SUNDAY = d('2026-10-11')
export const WEDNESDAY = d('2026-10-07')
export const FINALIZED_AT = Date.UTC(2026, 9, 14, 8, 0, 0) // the Wednesday after the week ended

export const TIERS = [
  { minScore: 6 as const, text: 'Gaming' },
  { minScore: 7 as const, text: 'Dessert' },
  { minScore: 8 as const, text: 'Movie night' },
  { minScore: 9 as const, text: 'Budgeted purchase' },
  { minScore: 10 as const, text: 'Evening off' },
]

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

/** Five manual goals worth 3 + 3 + 2 + 1 + 1 = 10 points, none started. */
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

/** Ten one-point manual goals of which the first `done` are already achieved: scores exactly `done`. */
export function scoring(done: number): WeeklyBoardDefinition {
  return definition({
    goals: Array.from({ length: 10 }, (_, index) => goal({ id: `wg_${index}`, maxPoints: 1, manualProgress: index < done ? 1 : 0 })),
  })
}

export async function addTemplate(database: PersistenceDatabase, overrides: Partial<QuestTemplate> = {}): Promise<QuestTemplate> {
  const template = buildTemplate(overrides)
  await createTemplate(database, template)
  return template
}

/** Creates the occurrence of `template` on each date and completes it at midday. */
export async function completeOn(database: PersistenceDatabase, template: QuestTemplate, dates: readonly string[]): Promise<void> {
  for (const date of dates) {
    const made = await ensureOccurrence(database, template, d(date), 2_000)
    if (!made.ok) throw new Error(`completeOn: ${made.error.code}`)
    const done = await completeQuestAtomically(database, {
      occurrenceId: `occ:${template.id}@${date}`,
      completedAt: noonOn(date),
      timeZone: ZONE,
    })
    if (done.status !== 'completed') throw new Error(`completeOn: ${done.status}`)
  }
}

/** Finalizes every day from `from` through `through` (inclusive), in order, as the lifecycle would. */
export async function closeDays(database: PersistenceDatabase, from: DateKey, through: DateKey): Promise<void> {
  for (let date = from; compareDateKeys(date, through) <= 0; date = nextDate(date)) {
    const result = await finalizeDayAtomically(database, { dateKey: date, today: nextDate(date), finalizedAt: 6_000, finalizedLate: true })
    if (result.status === 'rejected') throw new Error(`closeDays: ${result.reason.code} on ${date}`)
  }
}

export async function saveBoard(
  database: PersistenceDatabase,
  board: WeeklyBoardDefinition = definition(),
  { today = WEDNESDAY, now = noonOn('2026-10-07') }: { today?: DateKey; now?: number } = {},
): Promise<void> {
  const result = await saveWeeklyBoardAtomically(database, { weekKey: WEEK, definition: board, expectedRevision: null, today, now })
  if (result.status !== 'created') throw new Error(`saveBoard: ${result.status === 'rejected' ? result.reason.code : result.status}`)
}

/** A quest with one completion on the week's first day (so the daily chain starts there), then every day of the week closed. */
export async function prepareClosedWeek(database: PersistenceDatabase): Promise<QuestTemplate> {
  const template = await addTemplate(database, { id: 'tpl_gym', title: 'Gym' })
  await completeOn(database, template, ['2026-10-05'])
  await closeDays(database, WEEK, SUNDAY)
  return template
}

export async function finalizeWeek(
  database: PersistenceDatabase,
  { weekKey = WEEK, today = NEXT_WEEK, finalizedAt = FINALIZED_AT }: { weekKey?: DateKey; today?: DateKey; finalizedAt?: number } = {},
): Promise<FinalizeWeekResult> {
  return finalizeWeekAtomically(database, { weekKey, today, finalizedAt })
}

