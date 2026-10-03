import { fireEvent, screen, within } from '@testing-library/react'
import { getWeeklyBoard, listWeeklyBoards, openDatabase, saveWeeklyBoardAtomically } from '@/persistence'
import { asWeekKey, type WeeklyBoardDefinition } from '@/domain'
import { d, noonOn } from '@/application/test-utils/helpers'

/** Helpers for the Weekly Goal Crusher UI tests. Test-only. */

export const WEDNESDAY = '2026-10-07'
export const NEXT_MONDAY = '2026-10-12'
export const WEEK = asWeekKey('2026-10-05')

export const weeklyReady = () => screen.findByRole('heading', { name: 'WEEKLY' })
export const editorReady = (name: 'SET WEEKLY GOALS' | 'EDIT WEEKLY GOALS') => screen.findByRole('heading', { name })

/** Every goal card of the editor, in order (each is a list item of the "Goals" list). */
export function goalCards(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Goals' })).getAllByRole('listitem')
}

/** The `index`-th goal card of the editor (0-based). */
export function goalCard(index: number): HTMLElement {
  const card = goalCards()[index]
  if (card === undefined) throw new Error(`There is no goal card ${index + 1}`)
  return card
}

export function typeInto(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } })
}

/** Fills one goal card's text fields and presses + until it is worth `points` (from one point). */
export function fillGoal(index: number, goal: { title: string; target: string; points: number; unit?: string }) {
  const card = within(goalCard(index))
  typeInto(card.getByLabelText('Title'), goal.title)
  typeInto(card.getByLabelText('Target'), goal.target)
  if (goal.unit !== undefined) typeInto(card.getByLabelText('Unit (optional)'), goal.unit)
  for (let point = 1; point < goal.points; point += 1) {
    fireEvent.click(card.getByRole('button', { name: `Increase points for goal ${index + 1}` }))
  }
}

export function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save Goals' }))
}

/** Reads the stored boards through a second, independent connection to the same fake database. */
export async function readBoards(factory: IDBFactory) {
  const database = await openDatabase({ factory })
  try {
    return await listWeeklyBoards(database)
  } finally {
    database.close()
  }
}

export async function readBoard(factory: IDBFactory) {
  const database = await openDatabase({ factory })
  try {
    return await getWeeklyBoard(database, WEEK)
  } finally {
    database.close()
  }
}

/** Writes a board for the week of 2026-10-05 straight into storage (as the editor would have, on `today`). */
export async function plantBoard(factory: IDBFactory, definition: WeeklyBoardDefinition, today = WEDNESDAY) {
  const database = await openDatabase({ factory })
  try {
    const result = await saveWeeklyBoardAtomically(database, {
      weekKey: WEEK,
      definition,
      expectedRevision: null,
      today: d(today),
      now: noonOn(today),
    })
    if (result.status !== 'created') throw new Error(`plantBoard: ${result.status}`)
  } finally {
    database.close()
  }
}

/** Ten one-point goals of which the first `done` are achieved: a board scoring exactly `done`. */
export function scoringDefinition(done: number, rewardText = true): WeeklyBoardDefinition {
  return {
    focus: 'Frozen focus',
    goals: Array.from({ length: 10 }, (_, index) => ({
      id: `wg_s${index}`,
      title: `Task ${index + 1}`,
      maxPoints: 1,
      target: 1,
      unit: null,
      tracking: { mode: 'manual' as const },
      manualProgress: index < done ? 1 : 0,
      notes: null,
    })),
    rewardTiers: ([6, 7, 8, 9, 10] as const).map((minScore) => ({ minScore, text: rewardText ? `Reward ${minScore}` : '' })),
  }
}
