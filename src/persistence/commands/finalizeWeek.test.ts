// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { asWeekKey, nextWeekKey, questCompletionTransactionId, type WeeklyBoardDefinition, type XPTransaction } from '@/domain'
import { PersistenceError } from '../errors'
import { verifyDatabaseIntegrity } from '../integrity/verify'
import { readProgression } from '../ledger/ledgerTip'
import { archiveTemplate, getTemplate, updateTemplate } from '../repositories/templates'
import { countCompletionsByTemplate, getWeeklyBoard, listDueWeeklyBoardKeys } from '../repositories/weeklyBoards'
import { listXpTransactions, listXpTransactionsByEffectiveDate } from '../repositories/xpLedger'
import { DatabaseTracker, d, newFactory, noonOn, readRaw, snapshotAll, writeRaw } from '../test-utils/helpers'
import {
  addTemplate,
  closeDays,
  completeOn,
  definition,
  finalizeWeek,
  FINALIZED_AT,
  goal,
  NEXT_WEEK,
  prepareClosedWeek,
  saveBoard,
  scoring,
  SUNDAY,
  WEEK,
} from '../test-utils/weekly'
import { finalizeWeekAtomically } from './finalizeWeek'
import { saveWeeklyBoardAtomically } from './saveWeeklyBoard'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

/** A closed week (all seven days finalized) with a board that scores exactly `score`, ready to be finalized. */
async function closedWeekScoring(score: number) {
  const database = await tracker.open()
  await prepareClosedWeek(database)
  await saveBoard(database, scoring(score), { today: d('2026-10-06') })
  return database
}

async function requireGym(database: Awaited<ReturnType<typeof tracker.open>>) {
  const template = await getTemplate(database, 'tpl_gym')
  if (template === null) throw new Error('tpl_gym is missing')
  return template
}

const weeklyRows = (rows: readonly XPTransaction[]) => rows.filter((row) => row.source.type === 'weekly_goal_crusher')

describe('finalizeWeekAtomically — the weekly bonus', () => {
  it('freezes the board and writes the single bonus row, continuing the ledger', async () => {
    const database = await closedWeekScoring(9)
    const result = await finalizeWeek(database)
    if (result.status !== 'finalized') throw new Error(`expected finalization, got ${result.status}`)

    const ledger = await listXpTransactions(database)
    expect(ledger).toHaveLength(2) // the gym quest, then the weekly bonus
    expect(ledger[1]).toEqual({
      id: 'xp:weekly_goal_crusher:2026-10-05',
      seq: 2,
      idempotencyKey: 'weekly_goal_crusher:2026-10-05',
      source: { type: 'weekly_goal_crusher', weekKey: '2026-10-05', score: 9 },
      amount: 325,
      category: null, // the weekly bonus has no category
      createdAt: FINALIZED_AT,
      effectiveDate: '2026-10-11',
      sourceWeekKey: '2026-10-05',
      totalExpAfter: 35 + 325,
    })
    expect(await readProgression(database)).toMatchObject({ totalExp: 360, lastSeq: 2 })
    expect(await getWeeklyBoard(database, WEEK)).toMatchObject({
      status: 'finalized',
      finalization: { score: 9, bonusExp: 325, xpTransactionId: 'xp:weekly_goal_crusher:2026-10-05', rewardTier: { minScore: 9, text: 'Budgeted purchase' } },
    })
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it.each([
    [6, 100],
    [7, 150],
    [8, 225],
    [9, 325],
    [10, 500],
  ])('a score of %i pays exactly %i EXP, once', async (score, bonus) => {
    const database = await closedWeekScoring(score)
    await finalizeWeek(database)
    const rows = weeklyRows(await listXpTransactions(database))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: bonus, source: { score } })
    expect((await readProgression(database)).totalExp).toBe(35 + bonus) // quest EXP + one bonus, not cumulative tiers
  })

  it.each([[0], [1], [3], [5]])('a score of %i finalizes the board but pays nothing', async (score) => {
    const database = await closedWeekScoring(score)
    const before = await listXpTransactions(database)
    const result = await finalizeWeek(database)
    expect(result.status).toBe('finalized')
    expect(await listXpTransactions(database)).toEqual(before) // no ledger row
    expect((await getWeeklyBoard(database, WEEK))?.finalization).toMatchObject({ score, bonusExp: 0, xpTransactionId: null, rewardTier: null })
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it('keeps the real creation time apart from the reporting date: finalized on the Wednesday, effective on the Sunday', async () => {
    const database = await closedWeekScoring(8)
    const wednesday = Date.UTC(2026, 9, 14, 9, 30, 0)
    await finalizeWeek(database, { today: d('2026-10-14'), finalizedAt: wednesday })
    const [row] = weeklyRows(await listXpTransactions(database))
    expect(row).toMatchObject({ createdAt: wednesday, effectiveDate: '2026-10-11', sourceWeekKey: '2026-10-05' })
    // Reporting by the effective date finds it on the Sunday it belongs to, not on the Wednesday it was written.
    expect(weeklyRows(await listXpTransactionsByEffectiveDate(database, d('2026-10-11')))).toHaveLength(1)
    expect(weeklyRows(await listXpTransactionsByEffectiveDate(database, d('2026-10-14')))).toHaveLength(0)
    expect((await getWeeklyBoard(database, WEEK))?.finalization?.finalizedAt).toBe(wednesday)
  })

  it('does not back-date the audit timestamp, however late the app is opened', async () => {
    const database = await closedWeekScoring(7)
    const muchLater = Date.UTC(2027, 2, 1, 12, 0, 0)
    await finalizeWeek(database, { today: d('2027-03-01'), finalizedAt: muchLater })
    expect(weeklyRows(await listXpTransactions(database))[0]).toMatchObject({ createdAt: muchLater, effectiveDate: '2026-10-11' })
  })
})

describe('finalizeWeekAtomically — exactly once', () => {
  it('a second finalization returns the stored board and writes nothing', async () => {
    const database = await closedWeekScoring(9)
    const first = await finalizeWeek(database)
    if (first.status !== 'finalized') throw new Error('expected finalization')
    const snapshot = await snapshotAll(database)

    const second = await finalizeWeek(database, { finalizedAt: FINALIZED_AT + 86_400_000 })
    expect(second).toEqual({ status: 'already_finalized', board: first.board })
    expect(await snapshotAll(database)).toEqual(snapshot)
    expect(weeklyRows(await listXpTransactions(database))).toHaveLength(1)
    expect((await readProgression(database)).totalExp).toBe(360)
  })

  it('many concurrent finalizations on one connection pay exactly once', async () => {
    const database = await closedWeekScoring(10)
    const results = await Promise.all(Array.from({ length: 10 }, () => finalizeWeek(database)))
    expect(results.filter((result) => result.status === 'finalized')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'already_finalized')).toHaveLength(9)
    expect(weeklyRows(await listXpTransactions(database))).toHaveLength(1)
    expect((await readProgression(database)).totalExp).toBe(35 + 500)
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it('concurrent finalizations from two tabs (two connections) pay exactly once', async () => {
    const factory = newFactory()
    const tabA = await tracker.open(factory)
    await prepareClosedWeek(tabA)
    await saveBoard(tabA, scoring(8), { today: d('2026-10-06') })
    const tabB = await tracker.open(factory)

    const results = await Promise.all([finalizeWeek(tabA), finalizeWeek(tabB), finalizeWeek(tabA), finalizeWeek(tabB)])
    expect(results.filter((result) => result.status === 'finalized')).toHaveLength(1)
    expect(weeklyRows(await listXpTransactions(tabA))).toHaveLength(1)
    expect(weeklyRows(await listXpTransactions(tabB))).toHaveLength(1)
    expect((await readProgression(tabA)).totalExp).toBe(35 + 225)
  })

  it('rolls everything back if the bonus row cannot be written: the board stays active and nothing is paid', async () => {
    const database = await closedWeekScoring(9)
    // A foreign row already holds this week's idempotency key (under another id), so the bonus insert violates the unique index
    // AFTER the board was rewritten: the whole transaction must abort.
    await writeRaw(database, 'xpTransactions', {
      id: 'xp:foreign',
      seq: 2,
      idempotencyKey: 'weekly_goal_crusher:2026-10-05',
      source: { type: 'weekly_goal_crusher', weekKey: '2026-10-05', score: 6 },
      amount: 100,
      category: null,
      createdAt: 1,
      effectiveDate: '2026-10-11',
      sourceWeekKey: '2026-10-05',
      totalExpAfter: 135,
    })
    const boardBefore = await readRaw(database, 'weeklyBoards')
    const ledgerBefore = await readRaw(database, 'xpTransactions')

    await expect(finalizeWeek(database)).rejects.toMatchObject({ code: 'constraint_violation' })

    expect(await readRaw(database, 'weeklyBoards')).toEqual(boardBefore)
    expect(await readRaw(database, 'xpTransactions')).toEqual(ledgerBefore)
    expect((await getWeeklyBoard(database, WEEK))?.status).toBe('active')
  })

  it('refuses to finalize when the stored board is corrupt, instead of guessing', async () => {
    const database = await closedWeekScoring(9)
    const [raw] = await readRaw(database, 'weeklyBoards')
    await writeRaw(database, 'weeklyBoards', { ...(raw as object), goals: 'nope' })
    await expect(finalizeWeek(database)).rejects.toBeInstanceOf(PersistenceError)
    expect(weeklyRows(await listXpTransactions(database))).toHaveLength(0)
  })
})

describe('finalizeWeekAtomically — when it must not finalize', () => {
  it('has nothing to do for a week without a board: no row, no record, no penalty', async () => {
    const database = await tracker.open()
    await prepareClosedWeek(database)
    const snapshot = await snapshotAll(database)
    expect(await finalizeWeek(database)).toEqual({ status: 'rejected', reason: { code: 'board_not_found' } })
    expect(await snapshotAll(database)).toEqual(snapshot)
    expect(await readRaw(database, 'weeklyBoards')).toEqual([])
  })

  it.each(['2026-10-05', '2026-10-08', '2026-10-11'])('refuses a week that is not over (today is %s)', async (today) => {
    const database = await closedWeekScoring(9)
    const snapshot = await snapshotAll(database)
    expect(await finalizeWeek(database, { today: d(today) })).toEqual({
      status: 'rejected',
      reason: { code: 'week_not_over', endDate: '2026-10-11', today },
    })
    expect(await snapshotAll(database)).toEqual(snapshot)
  })

  it('waits for the daily chain: the week’s last day must be finalized first', async () => {
    const database = await tracker.open()
    await addTemplate(database, { id: 'tpl_gym' })
    await completeOn(database, await requireGym(database), ['2026-10-05'])
    await closeDays(database, WEEK, d('2026-10-09')) // Saturday and Sunday are still open
    await saveBoard(database, scoring(9), { today: d('2026-10-06') })
    const snapshot = await snapshotAll(database)

    expect(await finalizeWeek(database)).toEqual({ status: 'rejected', reason: { code: 'days_not_finalized', cursor: '2026-10-10' } })
    expect(await snapshotAll(database)).toEqual(snapshot)

    await closeDays(database, d('2026-10-10'), SUNDAY)
    expect((await finalizeWeek(database)).status).toBe('finalized')
  })
})

describe('finalizeWeekAtomically — several weeks, closed app', () => {
  it('finalizes each week once, in chronological order, so the ledger order is deterministic', async () => {
    const database = await tracker.open()
    await addTemplate(database, { id: 'tpl_gym' })
    await completeOn(database, await requireGym(database), ['2026-10-05'])
    const week2 = nextWeekKey(WEEK)
    const week3 = nextWeekKey(week2)
    await closeDays(database, WEEK, d('2026-10-25')) // three whole weeks closed
    for (const [weekKey, today, score] of [
      [week2, d('2026-10-14'), 7],
      [WEEK, d('2026-10-08'), 9],
      [week3, d('2026-10-21'), 6],
    ] as const) {
      await saveWeeklyBoardAtomically(database, { weekKey, definition: scoring(score), expectedRevision: null, today, now: noonOn(today) })
    }
    expect(await listDueWeeklyBoardKeys(database, d('2026-10-26'))).toEqual([WEEK, week2, week3]) // oldest first, whatever order they were created in

    for (const weekKey of await listDueWeeklyBoardKeys(database, d('2026-10-26'))) {
      expect((await finalizeWeekAtomically(database, { weekKey, today: d('2026-10-26'), finalizedAt: noonOn('2026-10-26') })).status).toBe('finalized')
    }
    const rows = weeklyRows(await listXpTransactions(database))
    expect(rows.map((row) => [row.sourceWeekKey, row.amount, row.seq])).toEqual([
      ['2026-10-05', 325, 2],
      ['2026-10-12', 150, 3],
      ['2026-10-19', 100, 4],
    ])
    expect(await listDueWeeklyBoardKeys(database, d('2026-10-26'))).toEqual([]) // nothing left to do: a repeat is a no-op
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it('does not list boards whose week is not over, or that are already final', async () => {
    const database = await closedWeekScoring(9)
    expect(await listDueWeeklyBoardKeys(database, d('2026-10-11'))).toEqual([])
    expect(await listDueWeeklyBoardKeys(database, NEXT_WEEK)).toEqual([WEEK])
    await finalizeWeek(database)
    expect(await listDueWeeklyBoardKeys(database, NEXT_WEEK)).toEqual([])
  })
})

describe('linked progress, counted from the completions of the week', () => {
  const linkedGym = (target: number): WeeklyBoardDefinition =>
    definition({
      goals: [
        goal({ id: 'wg_gym', title: 'Gym sessions', maxPoints: 6, target, tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } }),
        goal({ id: 'wg_done', maxPoints: 4, manualProgress: 1 }),
      ],
    })

  /** Completions of `gym` and `other` on the given dates, every day of the week closed, the board saved on `savedOn`. */
  async function week(options: { gym: string[]; other?: string[]; target: number; savedOn?: string; gymAfterWeek?: string[] }) {
    const database = await tracker.open()
    const gym = await addTemplate(database, { id: 'tpl_gym', title: 'Gym' })
    const other = await addTemplate(database, { id: 'tpl_other', title: 'Other' })
    await completeOn(database, gym, options.gym)
    await completeOn(database, other, options.other ?? [])
    const first = [...options.gym, ...(options.other ?? [])].sort()[0] ?? '2026-10-05'
    await closeDays(database, d(first), SUNDAY)
    if (options.gymAfterWeek !== undefined) await completeOn(database, gym, options.gymAfterWeek)
    await saveBoard(database, linkedGym(options.target), { today: d(options.savedOn ?? '2026-10-07'), now: noonOn(options.savedOn ?? '2026-10-07') })
    return { database, gym }
  }

  const goalResult = async (database: Awaited<ReturnType<typeof tracker.open>>) =>
    (await getWeeklyBoard(database, WEEK))?.finalization?.goalResults.find((result) => result.goalId === 'wg_gym')

  it('counts the completions inside the week, Monday and Sunday included', async () => {
    const { database } = await week({ gym: ['2026-10-05', '2026-10-08', '2026-10-11'], target: 3 })
    await finalizeWeek(database)
    expect(await goalResult(database)).toMatchObject({ finalProgress: 3, completed: true, earnedPoints: 6, trackingMode: 'linked_quest', templateId: 'tpl_gym' })
    expect((await getWeeklyBoard(database, WEEK))?.finalization?.score).toBe(10)
  })

  it('does not count completions outside the week (the Sunday before, the Monday after)', async () => {
    const { database } = await week({ gym: ['2026-10-04', '2026-10-06', '2026-10-07'], target: 3, gymAfterWeek: ['2026-10-12'] })
    await finalizeWeek(database, { today: d('2026-10-13') })
    expect(await goalResult(database)).toMatchObject({ finalProgress: 2, completed: false, earnedPoints: 0 })
    expect((await getWeeklyBoard(database, WEEK))?.finalization?.score).toBe(4)
  })

  it('does not count completions of a different quest', async () => {
    const { database } = await week({ gym: ['2026-10-06'], other: ['2026-10-05', '2026-10-07', '2026-10-08', '2026-10-09'], target: 2 })
    await finalizeWeek(database)
    expect(await goalResult(database)).toMatchObject({ finalProgress: 1, completed: false })
  })

  it('still counts the history of an archived quest', async () => {
    const { database } = await week({ gym: ['2026-10-05', '2026-10-06'], target: 2 })
    await archiveTemplate(database, 'tpl_gym', { activeUntil: d('2026-10-09'), updatedAt: 99 })
    await finalizeWeek(database)
    expect(await goalResult(database)).toMatchObject({ finalProgress: 2, completed: true })
  })

  it('counts completions from the start of the week even when the goal was added mid-week', async () => {
    const { database } = await week({ gym: ['2026-10-05', '2026-10-06', '2026-10-07'], target: 3, savedOn: '2026-10-10' })
    await finalizeWeek(database)
    expect(await goalResult(database)).toMatchObject({ finalProgress: 3, completed: true })
  })

  it('is derived, so reading it repeatedly never changes or duplicates it', async () => {
    const { database } = await week({ gym: ['2026-10-05', '2026-10-06'], target: 5 })
    const counts = await Promise.all(Array.from({ length: 5 }, () => countCompletionsByTemplate(database, WEEK, SUNDAY)))
    for (const count of counts) expect([...count]).toEqual([['tpl_gym', 2]])
    expect([...(await countCompletionsByTemplate(database, d('2026-10-06'), d('2026-10-06')))]).toEqual([['tpl_gym', 1]]) // a narrower range
    expect([...(await countCompletionsByTemplate(database, d('2026-10-12'), d('2026-10-18')))]).toEqual([]) // an empty week
  })

  it('does not award the linked quest’s own EXP again: only the bonus row is added', async () => {
    const { database } = await week({ gym: ['2026-10-05', '2026-10-06'], target: 2 })
    const questRows = (await listXpTransactions(database)).filter((row) => row.source.type === 'quest_completion')
    await finalizeWeek(database)
    const after = await listXpTransactions(database)
    expect(after.filter((row) => row.source.type === 'quest_completion')).toEqual(questRows)
    expect(after).toHaveLength(questRows.length + 1)
  })
})

describe('a finalized week never changes with later data', () => {
  it('keeps its snapshot when quests are renamed, archived or completed again, and when it is finalized again', async () => {
    const database = await tracker.open()
    const gym = await addTemplate(database, { id: 'tpl_gym', title: 'Gym' })
    await completeOn(database, gym, ['2026-10-05', '2026-10-06'])
    await closeDays(database, WEEK, SUNDAY)
    await saveBoard(
      database,
      definition({
        goals: [
          goal({ id: 'wg_gym', title: 'Gym sessions', maxPoints: 6, target: 2, tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } }),
          goal({ id: 'wg_m', title: 'Report', maxPoints: 4, target: 20, manualProgress: 12 }),
        ],
      }),
    )
    const first = await finalizeWeek(database)
    if (first.status !== 'finalized') throw new Error('expected finalization')
    const frozenBoard = await readRaw(database, 'weeklyBoards')
    const frozenLedger = await readRaw(database, 'xpTransactions')
    expect(first.board.finalization?.goalResults.map((result) => [result.goalId, result.finalProgress, result.earnedPoints])).toEqual([
      ['wg_gym', 2, 6],
      ['wg_m', 12, 0],
    ])

    // Later data: the quest is renamed and archived, and (planted directly) more completions appear in the finished week.
    await updateTemplate(database, { ...gym, title: 'Renamed gym', revision: 2, updatedAt: 500 })
    await archiveTemplate(database, 'tpl_gym', { activeUntil: d('2026-10-11'), updatedAt: 501 })
    for (const date of ['2026-10-08', '2026-10-09', '2026-10-10']) {
      await writeRaw(database, 'questCompletions', {
        occurrenceId: `occ:tpl_gym@${date}`,
        templateId: 'tpl_gym',
        dateKey: date,
        category: 'discipline',
        expAwarded: 35,
        completedAt: noonOn(date),
        utcOffsetMinutes: 120,
        timeZone: 'Europe/Berlin',
        xpTransactionId: questCompletionTransactionId(`occ:tpl_gym@${date}`),
      })
    }
    expect([...(await countCompletionsByTemplate(database, WEEK, SUNDAY))]).toEqual([['tpl_gym', 5]]) // the live count moved on…

    // …but the finalized board did not, and finalizing again changes nothing.
    expect(await readRaw(database, 'weeklyBoards')).toEqual(frozenBoard)
    expect(await finalizeWeek(database, { finalizedAt: FINALIZED_AT + 1 })).toEqual({ status: 'already_finalized', board: first.board })
    expect(await readRaw(database, 'weeklyBoards')).toEqual(frozenBoard)
    expect(await readRaw(database, 'xpTransactions')).toEqual(frozenLedger)
    expect((await getWeeklyBoard(database, WEEK))?.finalization?.goalResults[0]).toMatchObject({ finalProgress: 2, title: 'Gym sessions' })
  })

  it('records the same week’s week-key math across a year boundary', async () => {
    const database = await tracker.open()
    const gym = await addTemplate(database, { id: 'tpl_gym' })
    const monday = asWeekKey('2026-12-28')
    await completeOn(database, gym, ['2026-12-28', '2027-01-01', '2027-01-03'])
    await closeDays(database, d('2026-12-28'), d('2027-01-03'))
    await saveWeeklyBoardAtomically(database, {
      weekKey: monday,
      definition: definition({ goals: [goal({ id: 'wg_gym', maxPoints: 10, target: 3, tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } })] }),
      expectedRevision: null,
      today: d('2027-01-01'),
      now: noonOn('2027-01-01'),
    })
    const result = await finalizeWeekAtomically(database, { weekKey: monday, today: d('2027-01-04'), finalizedAt: noonOn('2027-01-04') })
    expect(result.status).toBe('finalized')
    expect(weeklyRows(await listXpTransactions(database))[0]).toMatchObject({
      sourceWeekKey: '2026-12-28',
      effectiveDate: '2027-01-03', // the Sunday, in the next year
      amount: 500,
    })
  })
})
