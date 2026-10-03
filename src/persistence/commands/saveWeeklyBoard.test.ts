// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { archiveTemplate } from '../repositories/templates'
import { getWeeklyBoard, listWeeklyBoards } from '../repositories/weeklyBoards'
import { DatabaseTracker, d, noonOn, readRaw } from '../test-utils/helpers'
import { addTemplate, definition, finalizeWeek, goal, NEXT_WEEK, prepareClosedWeek, saveBoard, SUNDAY, WEDNESDAY, WEEK } from '../test-utils/weekly'
import { saveWeeklyBoardAtomically, type SaveWeeklyBoardInput } from './saveWeeklyBoard'
import { setWeeklyGoalProgressAtomically } from './setWeeklyGoalProgress'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

function input(overrides: Partial<SaveWeeklyBoardInput> = {}): SaveWeeklyBoardInput {
  return { weekKey: WEEK, definition: definition(), expectedRevision: null, today: WEDNESDAY, now: noonOn('2026-10-07'), ...overrides }
}

describe('saveWeeklyBoardAtomically — create', () => {
  it('creates the current week’s board as revision 1, active, with the week’s dates', async () => {
    const database = await tracker.open()
    const result = await saveWeeklyBoardAtomically(database, input())
    expect(result.status).toBe('created')
    expect(await getWeeklyBoard(database, WEEK)).toMatchObject({
      weekKey: '2026-10-05',
      startDate: '2026-10-05',
      endDate: '2026-10-11',
      status: 'active',
      revision: 1,
      createdAt: noonOn('2026-10-07'),
      updatedAt: noonOn('2026-10-07'),
      focus: 'Keep the rules consistent.',
      finalization: null,
    })
  })

  it.each([
    ['below ten', [3, 3, 2, 1]],
    ['above ten', [3, 3, 2, 1, 2]],
    ['a single goal over ten', [11]],
  ])('refuses a board whose weights are %s and writes nothing', async (_name, points) => {
    const database = await tracker.open()
    const goals = points.map((maxPoints, index) => goal({ id: `wg_${index}`, maxPoints }))
    const result = await saveWeeklyBoardAtomically(database, input({ definition: definition({ goals }) }))
    expect(result).toMatchObject({ status: 'rejected', reason: { code: 'invalid' } })
    expect(await readRaw(database, 'weeklyBoards')).toEqual([])
  })

  it('refuses an empty board', async () => {
    const database = await tracker.open()
    const result = await saveWeeklyBoardAtomically(database, input({ definition: definition({ goals: [] }) }))
    expect(result).toMatchObject({ status: 'rejected', reason: { code: 'invalid', problems: [{ code: 'no_goals' }, ...[]] } })
    expect(await readRaw(database, 'weeklyBoards')).toEqual([])
  })

  it('accepts every valid weighting', async () => {
    for (const points of [[3, 3, 2, 1, 1], [4, 3, 2, 1], [5, 3, 2], [10]]) {
      const database = await tracker.open()
      const goals = points.map((maxPoints, index) => goal({ id: `wg_${index}`, maxPoints }))
      expect((await saveWeeklyBoardAtomically(database, input({ definition: definition({ goals }) }))).status).toBe('created')
    }
  })

  it('creates a board only for the current week: not a finished one, not a future one', async () => {
    const database = await tracker.open()
    expect(await saveWeeklyBoardAtomically(database, input({ today: NEXT_WEEK }))).toEqual({
      status: 'rejected',
      reason: { code: 'week_over', endDate: SUNDAY, today: NEXT_WEEK },
    })
    expect(await saveWeeklyBoardAtomically(database, input({ today: d('2026-10-04') }))).toEqual({
      status: 'rejected',
      reason: { code: 'week_not_started', startDate: WEEK, today: d('2026-10-04') },
    })
    expect(await readRaw(database, 'weeklyBoards')).toEqual([])
  })

  it('allows creating on the first day (Monday) and the last day (Sunday) of the week', async () => {
    for (const today of ['2026-10-05', '2026-10-11']) {
      const database = await tracker.open()
      expect((await saveWeeklyBoardAtomically(database, input({ today: d(today) }))).status).toBe('created')
    }
  })

  it('refuses a second board for the same week, sequentially and concurrently: exactly one wins', async () => {
    const database = await tracker.open()
    const first = await saveWeeklyBoardAtomically(database, input())
    const second = await saveWeeklyBoardAtomically(database, input({ definition: definition({ focus: 'Other' }) }))
    expect(first.status).toBe('created')
    expect(second).toEqual({ status: 'rejected', reason: { code: 'board_exists' } })
    expect((await getWeeklyBoard(database, WEEK))?.focus).toBe('Keep the rules consistent.')

    const racing = await tracker.open()
    const results = await Promise.all(Array.from({ length: 6 }, () => saveWeeklyBoardAtomically(racing, input())))
    expect(results.filter((result) => result.status === 'created')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected' && result.reason.code === 'board_exists')).toHaveLength(5)
    expect(await listWeeklyBoards(racing)).toHaveLength(1)
  })

  it('refuses a linked goal whose quest is not stored, and writes nothing', async () => {
    const database = await tracker.open()
    const linked = definition({ goals: [goal({ id: 'wg_l', maxPoints: 10, tracking: { mode: 'linked_quest', templateId: 'tpl_ghost' } })] })
    expect(await saveWeeklyBoardAtomically(database, input({ definition: linked }))).toEqual({
      status: 'rejected',
      reason: { code: 'unknown_template', templateId: 'tpl_ghost' },
    })
    expect(await readRaw(database, 'weeklyBoards')).toEqual([])
  })

  it('accepts a link to a stored quest, active or archived', async () => {
    const database = await tracker.open()
    await addTemplate(database, { id: 'tpl_gym' })
    await addTemplate(database, { id: 'tpl_old' })
    await archiveTemplate(database, 'tpl_old', { activeUntil: d('2026-10-01'), updatedAt: 5 })
    const linked = definition({
      goals: [
        goal({ id: 'wg_1', maxPoints: 5, tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } }),
        goal({ id: 'wg_2', maxPoints: 5, tracking: { mode: 'linked_quest', templateId: 'tpl_old' } }),
      ],
    })
    expect((await saveWeeklyBoardAtomically(database, input({ definition: linked }))).status).toBe('created')
  })
})

describe('saveWeeklyBoardAtomically — edit', () => {
  it('replaces the definition, keeps identity and creation time, and bumps the revision', async () => {
    const database = await tracker.open()
    await saveBoard(database)
    const result = await saveWeeklyBoardAtomically(
      database,
      input({ expectedRevision: 1, now: noonOn('2026-10-08'), definition: definition({ focus: 'Edited', goals: [goal({ id: 'wg_a', maxPoints: 10 })] }) }),
    )
    expect(result.status).toBe('updated')
    expect(await getWeeklyBoard(database, WEEK)).toMatchObject({
      weekKey: '2026-10-05',
      createdAt: noonOn('2026-10-07'),
      updatedAt: noonOn('2026-10-08'),
      revision: 2,
      focus: 'Edited',
      status: 'active',
      goals: [{ id: 'wg_a', maxPoints: 10 }],
    })
  })

  it('refuses a save whose weights no longer total 10 and leaves the stored board untouched', async () => {
    const database = await tracker.open()
    await saveBoard(database)
    const before = await readRaw(database, 'weeklyBoards')
    const result = await saveWeeklyBoardAtomically(
      database,
      input({ expectedRevision: 1, definition: definition({ goals: [goal({ id: 'wg_a', maxPoints: 4 })] }) }),
    )
    expect(result).toMatchObject({ status: 'rejected', reason: { code: 'invalid' } })
    expect(await readRaw(database, 'weeklyBoards')).toEqual(before)
  })

  it('refuses a stale revision: someone else saved in between', async () => {
    const database = await tracker.open()
    await saveBoard(database)
    expect((await saveWeeklyBoardAtomically(database, input({ expectedRevision: 1, definition: definition({ focus: 'Tab A' }) }))).status).toBe('updated')
    const stale = await saveWeeklyBoardAtomically(database, input({ expectedRevision: 1, definition: definition({ focus: 'Tab B' }) }))
    expect(stale).toEqual({ status: 'rejected', reason: { code: 'stale_revision', expected: 1, actual: 2 } })
    expect((await getWeeklyBoard(database, WEEK))?.focus).toBe('Tab A')
  })

  it('two tabs saving from the same revision: exactly one wins', async () => {
    const database = await tracker.open()
    await saveBoard(database)
    const results = await Promise.all(
      ['A', 'B', 'C', 'D'].map((focus) => saveWeeklyBoardAtomically(database, input({ expectedRevision: 1, definition: definition({ focus }) }))),
    )
    expect(results.filter((result) => result.status === 'updated')).toHaveLength(1)
    expect((await getWeeklyBoard(database, WEEK))?.revision).toBe(2)
  })

  it('refuses to edit a week that has no board', async () => {
    const database = await tracker.open()
    expect(await saveWeeklyBoardAtomically(database, input({ expectedRevision: 1 }))).toEqual({ status: 'rejected', reason: { code: 'board_not_found' } })
  })

  it('refuses to edit once the week is over, even before it is finalized', async () => {
    const database = await tracker.open()
    await saveBoard(database)
    const result = await saveWeeklyBoardAtomically(database, input({ expectedRevision: 1, today: NEXT_WEEK }))
    expect(result).toEqual({ status: 'rejected', reason: { code: 'week_over', endDate: SUNDAY, today: NEXT_WEEK } })
    expect((await getWeeklyBoard(database, WEEK))?.revision).toBe(1)
  })

  it('carries a goal’s manual progress through an edit that keeps the goal (the board is rebuilt from the stored one)', async () => {
    const database = await tracker.open()
    await saveBoard(database)
    await setWeeklyGoalProgressAtomically(database, { weekKey: WEEK, goalId: 'wg_a', progress: 1, today: WEDNESDAY, now: noonOn('2026-10-08') })
    const stored = await getWeeklyBoard(database, WEEK)
    if (stored === null) throw new Error('board')
    const result = await saveWeeklyBoardAtomically(database, input({ expectedRevision: stored.revision, definition: { ...definition(), goals: stored.goals } }))
    expect(result.status).toBe('updated')
    expect((await getWeeklyBoard(database, WEEK))?.goals[0]?.manualProgress).toBe(1)
  })
})

describe('a finalized board is immutable at the persistence level', () => {
  async function finalizedBoard() {
    const database = await tracker.open()
    await prepareClosedWeek(database)
    await saveBoard(database, definition({ goals: [goal({ id: 'wg_a', maxPoints: 10, manualProgress: 1 })] }), { today: d('2026-10-06') })
    const result = await finalizeWeek(database)
    if (result.status !== 'finalized') throw new Error('expected finalization')
    return { database, board: result.board }
  }

  it('refuses to edit it, whatever revision the caller believes it has', async () => {
    const { database, board } = await finalizedBoard()
    const before = await readRaw(database, 'weeklyBoards')
    for (const expectedRevision of [1, board.revision, board.revision + 1]) {
      const result = await saveWeeklyBoardAtomically(database, input({ expectedRevision, today: d('2026-10-11') }))
      expect(result).toEqual({ status: 'rejected', reason: { code: 'board_finalized' } })
    }
    expect(await readRaw(database, 'weeklyBoards')).toEqual(before)
  })

  it('refuses to change a goal’s progress', async () => {
    const { database } = await finalizedBoard()
    const before = await readRaw(database, 'weeklyBoards')
    const result = await setWeeklyGoalProgressAtomically(database, { weekKey: WEEK, goalId: 'wg_a', progress: 0, today: d('2026-10-11'), now: noonOn('2026-10-11') })
    expect(result).toEqual({ status: 'rejected', reason: { code: 'board_finalized' } })
    expect(await readRaw(database, 'weeklyBoards')).toEqual(before)
  })
})

describe('setWeeklyGoalProgressAtomically', () => {
  const set = (database: Awaited<ReturnType<typeof tracker.open>>, goalId: string, progress: number, today = WEDNESDAY) =>
    setWeeklyGoalProgressAtomically(database, { weekKey: WEEK, goalId, progress, today, now: noonOn('2026-10-08') })

  it('sets the player’s count, bumps the revision and returns the previous board', async () => {
    const database = await tracker.open()
    await saveBoard(database)
    const result = await set(database, 'wg_a', 1)
    if (result.status !== 'updated') throw new Error('expected an update')
    expect(result.board.goals[0]?.manualProgress).toBe(1)
    expect(result.previous.goals[0]?.manualProgress).toBe(0)
    expect(result.board).toMatchObject({ revision: 2, updatedAt: noonOn('2026-10-08') })
    expect(await getWeeklyBoard(database, WEEK)).toEqual(result.board)
  })

  it('accepts below target, exactly the target and above it (progress is stored as typed)', async () => {
    const database = await tracker.open()
    await saveBoard(database, definition({ goals: [goal({ id: 'wg_a', maxPoints: 10, target: 20 })] }))
    for (const progress of [14, 20, 25, 0]) {
      const result = await set(database, 'wg_a', progress)
      expect(result.status).toBe(progress === 14 || progress === 20 || progress === 25 || progress === 0 ? 'updated' : 'unchanged')
      expect((await getWeeklyBoard(database, WEEK))?.goals[0]?.manualProgress).toBe(progress)
    }
  })

  it('repeating the same value writes nothing: the revision moves once', async () => {
    const database = await tracker.open()
    await saveBoard(database)
    expect((await set(database, 'wg_a', 1)).status).toBe('updated')
    expect((await set(database, 'wg_a', 1)).status).toBe('unchanged')
    expect((await getWeeklyBoard(database, WEEK))?.revision).toBe(2)
  })

  it('a burst of identical taps changes the board exactly once', async () => {
    const database = await tracker.open()
    await saveBoard(database)
    const results = await Promise.all(Array.from({ length: 8 }, () => set(database, 'wg_a', 1)))
    expect(results.filter((result) => result.status === 'updated')).toHaveLength(1)
    expect((await getWeeklyBoard(database, WEEK))?.revision).toBe(2)
  })

  it('rejects a linked goal, an unknown goal, a bad number, a missing board and a finished week', async () => {
    const database = await tracker.open()
    await addTemplate(database, { id: 'tpl_gym' })
    await saveBoard(
      database,
      definition({ goals: [goal({ id: 'wg_m', maxPoints: 5 }), goal({ id: 'wg_l', maxPoints: 5, tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } })] }),
    )
    expect(await set(database, 'wg_l', 2)).toEqual({ status: 'rejected', reason: { code: 'goal_not_manual', goalId: 'wg_l' } })
    expect(await set(database, 'wg_x', 2)).toEqual({ status: 'rejected', reason: { code: 'goal_not_found', goalId: 'wg_x' } })
    for (const progress of [-1, 1.5, Number.NaN, 100_000]) {
      expect(await set(database, 'wg_m', progress)).toEqual({ status: 'rejected', reason: { code: 'progress_invalid' } })
    }
    expect(await set(database, 'wg_m', 1, NEXT_WEEK)).toMatchObject({ status: 'rejected', reason: { code: 'week_over' } })
    expect(await set(database, 'wg_m', 1, d('2026-10-04'))).toMatchObject({ status: 'rejected', reason: { code: 'week_not_started' } })
    expect((await getWeeklyBoard(database, WEEK))?.revision).toBe(1)

    const empty = await tracker.open()
    expect(await set(empty, 'wg_m', 1)).toEqual({ status: 'rejected', reason: { code: 'board_not_found' } })
  })
})
