// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { asWeekKey, finalizeWeeklyBoard, nextWeekKey, type WeekKey } from '@/domain'
import {
  getWeeklyBoard,
  listCompletionsByTemplate,
  listWeeklyBoards,
  listWeeklyRewardClaims,
  listXpTransactions,
  saveWeeklyBoardAtomically,
  verifyDatabaseIntegrity,
  type PersistenceDatabase,
} from '@/persistence'
import { completeTodayQuest } from '../completion/completeTodayQuest'
import { startApplication } from '../initialize'
import { loadHome, synchronizeAndLoadHome } from '../home'
import { archiveQuest } from '../quests/archiveQuest'
import { createQuest } from '../quests/createQuest'
import { updateQuest } from '../quests/updateQuest'
import { buildFormValues, createTestContext, d, noonOn, type TestContext } from '../test-utils/helpers'
import { goalRow, REWARD_TEXTS, tenGoals, weeklyForm } from '../test-utils/weekly'
import { claimWeeklyReward } from './claimWeeklyReward'
import { loadWeeklyEditor } from './loadWeeklyEditor'
import { loadWeeklyHistory } from './loadWeeklyHistory'
import { loadWeeklyScreen, type WeeklyScreen } from './loadWeeklyScreen'
import { saveWeeklyBoard } from './saveWeeklyBoard'
import { setWeeklyGoalProgress } from './setWeeklyGoalProgress'
import { loadWeeklyHomeSummary } from './summary'
import { readClock } from '../clock'

const WEDNESDAY = '2026-10-07'
const THURSDAY = '2026-10-08'
const NEXT_MONDAY = '2026-10-12'
const WEEK = asWeekKey('2026-10-05')

const opened: PersistenceDatabase[] = []
afterEach(() => {
  vi.restoreAllMocks()
  while (opened.length > 0) opened.pop()?.close()
})

async function setup(date = WEDNESDAY): Promise<TestContext> {
  const t = await createTestContext(date)
  opened.push(t.database)
  await startApplication(t.context)
  return t
}

async function advanceTo(t: TestContext, date: string, trigger: 'startup' | 'resume' | 'midnight_tick' = 'resume') {
  t.clock.set(noonOn(date))
  return synchronizeAndLoadHome(t.context, trigger)
}

async function screenOf(t: TestContext): Promise<WeeklyScreen> {
  const result = await loadWeeklyScreen(t.context)
  if (result.status !== 'ok') throw new Error('the weekly screen failed to load')
  return result.screen
}

async function created(t: TestContext, values = weeklyForm()) {
  const result = await saveWeeklyBoard(t.context, values)
  if (result.status !== 'created') throw new Error(`save was ${result.status}`)
  return result
}

async function activeBoard(t: TestContext, weekKey: WeekKey = WEEK) {
  const board = await getWeeklyBoard(t.database, weekKey)
  if (board === null) throw new Error('no board')
  return board
}

async function gymQuest(t: TestContext): Promise<string> {
  const result = await createQuest(t.context, buildFormValues({ title: 'Gym' }, WEDNESDAY))
  if (result.status !== 'created') throw new Error('create failed')
  return result.templateId
}

async function completeQuestOn(t: TestContext, templateId: string, date: string) {
  const result = await completeTodayQuest(t.context, `occ:${templateId}@${date}`)
  if (result.status !== 'completed') throw new Error(`completion was ${result.status}`)
}

const weeklyRows = async (t: TestContext) => (await listXpTransactions(t.database)).filter((row) => row.source.type === 'weekly_goal_crusher')

/** Counts read-write transactions opened on the database while `work` runs. */
async function countWrites<T>(t: TestContext, work: () => Promise<T>): Promise<{ result: T; writes: number }> {
  const spy = vi.spyOn(t.database, 'openTransaction')
  const result = await work()
  const writes = spy.mock.calls.filter(([, mode]) => mode === 'readwrite').length
  spy.mockRestore()
  return { result, writes }
}

describe('setting up the week', () => {
  it('shows the setup state when the week has no board, and invents nothing', async () => {
    const t = await setup()
    const screen = await screenOf(t)
    expect(screen).toMatchObject({ weekKey: '2026-10-05', startDate: '2026-10-05', endDate: '2026-10-11', current: { kind: 'none' }, latestFinalized: null })
    expect((await loadHome(t.context)).weekly).toEqual({ state: 'none' })
    expect(await listWeeklyBoards(t.database)).toEqual([])
  })

  it('the editor starts with one blank goal and empty rewards for a new week', async () => {
    const t = await setup()
    const editor = await loadWeeklyEditor(t.context)
    if (editor.status !== 'ok') throw new Error('editor')
    expect(editor).toMatchObject({ mode: 'create', weekKey: '2026-10-05', startDate: '2026-10-05', endDate: '2026-10-11' })
    expect(editor.values.revision).toBeNull()
    expect(editor.values.goals).toHaveLength(1)
    expect(editor.values.goals[0]).toMatchObject({ goalId: null, title: '', trackingMode: 'manual' })
    expect(editor.values.rewards).toEqual({ 6: '', 7: '', 8: '', 9: '', 10: '' })
    expect(editor.quests.map((quest) => quest.title)).toContain('Sleep before 00:00')
  })

  it('saves the board: goals get ids, nothing is paid, and Home shows the card', async () => {
    const t = await setup()
    const ledger = await listXpTransactions(t.database)
    const result = await created(t)
    expect(result.home?.weekly).toEqual({ state: 'board', score: 0, goalsCompleted: 0, goalCount: 2 })

    const board = await activeBoard(t)
    expect(board).toMatchObject({ status: 'active', revision: 1, focus: 'Build clean backtesting reps.', createdAt: noonOn(WEDNESDAY) })
    expect(board.goals.map((goal) => goal.id.startsWith('wg_'))).toEqual([true, true])
    expect(new Set(board.goals.map((goal) => goal.id)).size).toBe(2)
    expect(board.rewardTiers.map((tier) => tier.text)).toEqual(Object.values(REWARD_TEXTS))
    expect(await listXpTransactions(t.database)).toEqual(ledger) // saving a board awards nothing
  })

  it('refuses a board that does not total 10 and writes nothing', async () => {
    const t = await setup()
    const { result, writes } = await countWrites(t, () =>
      saveWeeklyBoard(t.context, weeklyForm({ goals: [goalRow('g1', { points: 6 }), goalRow('g2', { points: 3 })] })),
    )
    expect(result).toMatchObject({ status: 'invalid', errors: { board: ['points_total_invalid'], total: 9 } })
    expect(writes).toBe(0)
    expect(await listWeeklyBoards(t.database)).toEqual([])
  })

  it('refuses an empty board, an unknown quest and a stale form', async () => {
    const t = await setup()
    expect(await saveWeeklyBoard(t.context, weeklyForm({ goals: [] }))).toMatchObject({ status: 'invalid', errors: { board: ['no_goals'] } })
    expect(
      await saveWeeklyBoard(t.context, weeklyForm({ goals: [goalRow('g1', { points: 10, trackingMode: 'linked_quest', templateId: 'tpl_ghost' })] })),
    ).toMatchObject({ status: 'invalid', errors: { goals: { g1: { link: 'link_unknown' } } } })

    await created(t)
    const stale = await saveWeeklyBoard(t.context, weeklyForm()) // a second "create" form for the same week
    expect(stale).toEqual({ status: 'rejected', reason: 'stale' })
    expect(await listWeeklyBoards(t.database)).toHaveLength(1)
  })

  it('edits the board: the editor loads it with its revision, an edit keeps manual progress and bumps the revision', async () => {
    const t = await setup()
    await created(t)
    const board = await activeBoard(t)
    const first = board.goals[0]!
    expect(await setWeeklyGoalProgress(t.context, first.id, 14)).toMatchObject({ status: 'updated' })

    const editor = await loadWeeklyEditor(t.context)
    if (editor.status !== 'ok') throw new Error('editor')
    expect(editor.mode).toBe('edit')
    expect(editor.values.revision).toBe(2) // creation + one progress update
    const goals = editor.values.goals.map((row) => (row.goalId === first.id ? { ...row, title: 'Renamed backtests', points: 7 } : { ...row, points: 3 }))
    const saved = await saveWeeklyBoard(t.context, { ...editor.values, goals })
    expect(saved.status).toBe('updated')

    const after = await activeBoard(t)
    expect(after).toMatchObject({ revision: 3, createdAt: board.createdAt })
    expect(after.goals[0]).toMatchObject({ id: first.id, title: 'Renamed backtests', maxPoints: 7, manualProgress: 14 })
    expect(after.goals[1]).toMatchObject({ maxPoints: 3 })
  })

  it('pre-fills the five reward texts from the most recent board for a new week, but not the goals', async () => {
    const t = await setup()
    await created(t)
    await advanceTo(t, NEXT_MONDAY)
    const editor = await loadWeeklyEditor(t.context)
    if (editor.status !== 'ok') throw new Error('editor')
    expect(editor.mode).toBe('create')
    expect(editor.values.rewards).toEqual(REWARD_TEXTS)
    expect(editor.values.goals).toHaveLength(1)
    expect(editor.values.goals[0]).toMatchObject({ title: '', goalId: null })
  })
})

describe('manual progress', () => {
  it('updates the count; reaching the target emits WeeklyGoalCompleted and moves the derived score', async () => {
    const t = await setup()
    await created(t)
    const [g1, g2] = (await activeBoard(t)).goals

    const below = await setWeeklyGoalProgress(t.context, g1!.id, 14)
    expect(below).toMatchObject({ status: 'updated', events: [] })
    expect((await screenOf(t)).current).toMatchObject({ kind: 'active', board: { score: 0, goalsCompleted: 0 } })

    const exact = await setWeeklyGoalProgress(t.context, g1!.id, 20)
    expect(exact).toMatchObject({ status: 'updated', events: [{ type: 'WeeklyGoalCompleted', goalId: g1!.id, earnedPoints: 6, scoreNow: 6 }] })
    expect(exact.status === 'updated' && exact.home?.weekly).toEqual({ state: 'board', score: 6, goalsCompleted: 1, goalCount: 2 })

    const above = await setWeeklyGoalProgress(t.context, g1!.id, 25) // more than the target earns nothing extra
    expect(above).toMatchObject({ status: 'updated', events: [] })
    expect((await screenOf(t)).current).toMatchObject({ board: { score: 6 } })

    const done = await setWeeklyGoalProgress(t.context, g2!.id, 1)
    expect(done).toMatchObject({ events: [{ type: 'WeeklyGoalCompleted', goalId: g2!.id, scoreNow: 10 }] })
  })

  it('shows the goals as derived: progress, completion, points and the reward tier that applies', async () => {
    const t = await setup()
    await created(t, weeklyForm({ goals: tenGoals() }))
    for (const goal of (await activeBoard(t)).goals.slice(0, 8)) await setWeeklyGoalProgress(t.context, goal.id, 1)
    const screen = await screenOf(t)
    if (screen.current.kind !== 'active') throw new Error('expected an active board')
    expect(screen.current.board).toMatchObject({ score: 8, goalsCompleted: 8, goalCount: 10 })
    expect(screen.current.board.rewardTiers.map((tier) => [tier.minScore, tier.reached, tier.current])).toEqual([
      [6, true, false],
      [7, true, false],
      [8, true, true], // only the highest reached tier is current
      [9, false, false],
      [10, false, false],
    ])
  })

  it('repeating the same value is a harmless no-op: the stored board is exactly as it was', async () => {
    const t = await setup()
    await created(t)
    const [g1] = (await activeBoard(t)).goals
    await setWeeklyGoalProgress(t.context, g1!.id, 5)
    const before = await getWeeklyBoard(t.database, WEEK)
    t.clock.set(noonOn(WEDNESDAY) + 3_600_000) // later the same day, so a rewrite would show in updatedAt
    expect(await setWeeklyGoalProgress(t.context, g1!.id, 5)).toEqual({ status: 'unchanged' })
    expect(await getWeeklyBoard(t.database, WEEK)).toEqual(before)
    expect(before?.revision).toBe(2) // creation + the first update
  })

  it('rejects an invalid number, an unknown goal and a missing board', async () => {
    const t = await setup()
    expect(await setWeeklyGoalProgress(t.context, 'wg_x', 1)).toEqual({ status: 'rejected', reason: 'board_not_found' })
    await created(t)
    const [g1] = (await activeBoard(t)).goals
    expect(await setWeeklyGoalProgress(t.context, g1!.id, -1)).toEqual({ status: 'rejected', reason: 'progress_invalid' })
    expect(await setWeeklyGoalProgress(t.context, g1!.id, 1.5)).toEqual({ status: 'rejected', reason: 'progress_invalid' })
    expect(await setWeeklyGoalProgress(t.context, 'wg_x', 1)).toEqual({ status: 'rejected', reason: 'goal_not_found' })
  })

  it('a stale screen cannot write into a new day: the lifecycle gate refuses it', async () => {
    const t = await setup()
    await created(t)
    const [g1] = (await activeBoard(t)).goals
    t.clock.set(noonOn(NEXT_MONDAY)) // the day moved on; nothing has reconciled yet
    const result = await setWeeklyGoalProgress(t.context, g1!.id, 3)
    expect(result).toMatchObject({ status: 'failed', reason: 'day_not_synchronized' })
    expect((await activeBoard(t)).goals[0]?.manualProgress).toBe(0)
  })
})

describe('linked quest progress, through the real completion flow', () => {
  async function linkedWeek() {
    const t = await setup()
    const gym = await gymQuest(t)
    await created(
      t,
      weeklyForm({
        goals: [
          goalRow('g1', { title: 'Gym sessions', points: 6, target: '2', trackingMode: 'linked_quest', templateId: gym }),
          goalRow('g2', { title: 'Report', points: 4, target: '1' }),
        ],
      }),
    )
    return { t, gym }
  }

  it('counts each completion once, shows it on the screen and Home, and never pays the quest twice', async () => {
    const { t, gym } = await linkedWeek()
    const manual = (await activeBoard(t)).goals[1]!
    await setWeeklyGoalProgress(t.context, manual.id, 1) // g2 done: 4 points

    const ledgerBefore = await listXpTransactions(t.database)
    await completeQuestOn(t, gym, WEDNESDAY)
    const afterOne = await screenOf(t)
    expect(afterOne.current).toMatchObject({ kind: 'active', board: { score: 4, goalsCompleted: 1 } })
    if (afterOne.current.kind !== 'active') throw new Error('active')
    expect(afterOne.current.board.goals[0]).toMatchObject({ progress: 1, completed: false, templateTitle: 'Gym', trackingMode: 'linked_quest' })
    expect((await loadHome(t.context)).weekly).toEqual({ state: 'board', score: 4, goalsCompleted: 1, goalCount: 2 })

    // Reading it again and again changes nothing and never double counts.
    for (let reload = 0; reload < 3; reload += 1) expect((await screenOf(t)).current).toMatchObject({ board: { score: 4 } })

    await advanceTo(t, THURSDAY)
    await completeQuestOn(t, gym, THURSDAY)
    expect((await screenOf(t)).current).toMatchObject({ board: { score: 10, goalsCompleted: 2 } })

    // Exactly the two quest completions were paid: the linked goal adds no EXP of its own, and no bonus until the week ends.
    const questRows = (await listXpTransactions(t.database)).filter((row) => row.source.type === 'quest_completion')
    expect(questRows).toHaveLength(ledgerBefore.length + 2)
    expect(await weeklyRows(t)).toEqual([])
  })

  it('a linked goal has no number to set by hand', async () => {
    const { t } = await linkedWeek()
    const [linked] = (await activeBoard(t)).goals
    expect(await setWeeklyGoalProgress(t.context, linked!.id, 2)).toEqual({ status: 'rejected', reason: 'goal_not_manual' })
  })

  it('counts completions from the start of the week even if the goal was added later in it', async () => {
    const t = await setup(WEDNESDAY)
    const gym = await gymQuest(t)
    await completeQuestOn(t, gym, WEDNESDAY)
    await advanceTo(t, THURSDAY)
    await created(t, weeklyForm({ goals: [goalRow('g1', { points: 10, target: '1', trackingMode: 'linked_quest', templateId: gym })] }))
    expect((await screenOf(t)).current).toMatchObject({ board: { score: 10 } })
  })

  it('still counts an archived quest’s history, and keeps offering it in the editor while it is linked', async () => {
    const { t, gym } = await linkedWeek()
    await completeQuestOn(t, gym, WEDNESDAY)
    expect(await archiveQuest(t.context, gym)).toMatchObject({ status: 'archived' })
    const screen = await screenOf(t)
    if (screen.current.kind !== 'active') throw new Error('active')
    expect(screen.current.board.goals[0]).toMatchObject({ progress: 1, templateArchived: true })
    const editor = await loadWeeklyEditor(t.context)
    if (editor.status !== 'ok') throw new Error('editor')
    expect(editor.quests.find((quest) => quest.templateId === gym)).toMatchObject({ archived: true })
  })
})

describe('finalization through the lifecycle', () => {
  async function finishedWeek(score = 10) {
    const t = await setup()
    const gym = await gymQuest(t)
    await created(
      t,
      weeklyForm({
        goals: [
          goalRow('g1', { title: 'Gym sessions', points: 6, target: '2', trackingMode: 'linked_quest', templateId: gym }),
          goalRow('g2', { title: 'Report', points: 4, target: '1' }),
        ],
      }),
    )
    if (score >= 4) await setWeeklyGoalProgress(t.context, (await activeBoard(t)).goals[1]!.id, 1)
    if (score >= 10) {
      await completeQuestOn(t, gym, WEDNESDAY)
      await advanceTo(t, THURSDAY)
      await completeQuestOn(t, gym, THURSDAY)
    }
    return { t, gym }
  }

  it('finalizes on the first reconcile of the next Monday and pays the bonus once, dated honestly', async () => {
    const { t } = await finishedWeek(10)
    const expBefore = (await loadHome(t.context)).player.totalExp
    t.clock.set(noonOn(NEXT_MONDAY) + 3_600_000)
    const synced = await synchronizeAndLoadHome(t.context, 'resume')

    expect(synced.finalizedWeeks).toHaveLength(1)
    expect(synced.finalizedWeeks[0]).toMatchObject({ weekKey: '2026-10-05', score: 10, bonusExp: 500, rewardTierMinScore: 10 })
    expect(synced.finalizedWeeks[0]?.events.map((event) => event.type).slice(0, 2)).toEqual(['WeeklyBoardFinalized', 'XPAwarded'])
    const [row] = await weeklyRows(t)
    expect(row).toMatchObject({ amount: 500, category: null, createdAt: noonOn(NEXT_MONDAY) + 3_600_000, effectiveDate: '2026-10-11', sourceWeekKey: '2026-10-05' })
    expect(synced.home.player.totalExp).toBe(expBefore + 500)
    expect(synced.home.weekly).toEqual({ state: 'none' }) // the new week has no board yet
    expect(await verifyDatabaseIntegrity(t.database)).toMatchObject({ ok: true })
  })

  it('is idempotent: repeats, resumes and concurrent syncs never pay twice', async () => {
    const { t } = await finishedWeek(10)
    t.clock.set(noonOn(NEXT_MONDAY))
    const results = await Promise.all([synchronizeAndLoadHome(t.context, 'resume'), synchronizeAndLoadHome(t.context, 'startup'), synchronizeAndLoadHome(t.context, 'resume')])
    expect(results.flatMap((result) => result.finalizedWeeks)).toHaveLength(1)
    expect(await synchronizeAndLoadHome(t.context, 'resume')).toMatchObject({ finalizedWeeks: [] })
    expect(await synchronizeAndLoadHome(t.context, 'startup')).toMatchObject({ finalizedWeeks: [] })
    expect(await weeklyRows(t)).toHaveLength(1)
  })

  it('finalizes a week with no bonus (below 6) and writes no ledger row', async () => {
    const { t } = await finishedWeek(4)
    const synced = await advanceTo(t, NEXT_MONDAY)
    expect(synced.finalizedWeeks).toMatchObject([{ score: 4, bonusExp: 0, rewardTierMinScore: null }])
    expect(await weeklyRows(t)).toEqual([])
  })

  it('does not finalize a week that is still running (the Sunday itself)', async () => {
    const { t } = await finishedWeek(10)
    const synced = await advanceTo(t, '2026-10-11')
    expect(synced.finalizedWeeks).toEqual([])
    expect((await activeBoard(t)).status).toBe('active')
  })

  it('the midnight tick finalizes the board together with Sunday’s day, in order', async () => {
    const { t } = await finishedWeek(10)
    t.clock.set(noonOn('2026-10-11'))
    await synchronizeAndLoadHome(t.context, 'resume')
    const sundayEnds = Date.UTC(2026, 9, 11, 22, 0, 1) // Monday 00:00:01 in Berlin (UTC+2)
    t.clock.set(sundayEnds)
    const synced = await synchronizeAndLoadHome(t.context, 'midnight_tick')
    expect(synced.finalized.map((summary) => summary.dateKey)).toEqual(['2026-10-11'])
    expect(synced.finalizedWeeks).toHaveLength(1)
    expect((await activeBoard(t)).status).toBe('finalized')
  })

  it('a week without a board is not finalized and not penalised: it is simply absent', async () => {
    const t = await setup()
    const ledger = await listXpTransactions(t.database)
    const synced = await advanceTo(t, NEXT_MONDAY)
    expect(synced.finalizedWeeks).toEqual([])
    expect(await listWeeklyBoards(t.database)).toEqual([])
    expect(await weeklyRows(t)).toEqual([])
    expect(await listXpTransactions(t.database)).toEqual(ledger)
    const history = await loadWeeklyHistory(t.context)
    expect(history).toEqual({ status: 'ok', weeks: [] })
  })

  it('catches up several closed weeks at startup: each existing board once, oldest first, a skipped week left alone', async () => {
    const t = await setup()
    const week2 = nextWeekKey(WEEK)
    const week3 = nextWeekKey(week2)
    // Boards for weeks 1 and 3 only (week 2 was skipped), written as the player would have on those weeks.
    for (const [weekKey, today, score] of [[WEEK, WEDNESDAY, 9], [week3, '2026-10-21', 6]] as const) {
      const definition = weeklyDefinitionScoring(score)
      const saved = await saveWeeklyBoardAtomically(t.database, { weekKey, definition, expectedRevision: null, today: d(today), now: noonOn(today) })
      expect(saved.status).toBe('created')
    }
    const ledgerBefore = (await listXpTransactions(t.database)).length

    const synced = await advanceTo(t, '2026-11-12', 'startup') // the app was closed for five weeks
    expect(synced.finalizedWeeks.map((week) => [week.weekKey, week.score, week.bonusExp])).toEqual([
      ['2026-10-05', 9, 325],
      ['2026-10-19', 6, 100],
    ])
    expect(synced.finalizedWeeks.every((week) => week.events.length > 0)).toBe(true)
    const rows = await weeklyRows(t)
    expect(rows.map((row) => [row.sourceWeekKey, row.amount])).toEqual([['2026-10-05', 325], ['2026-10-19', 100]])
    expect((await listXpTransactions(t.database)).length).toBe(ledgerBefore + 2)
    expect(rows.every((row) => row.createdAt === noonOn('2026-11-12'))).toBe(true) // the real moment, not the Sunday
    expect(rows.map((row) => row.effectiveDate)).toEqual(['2026-10-11', '2026-10-25'])

    // A second startup finds nothing to do.
    expect(await advanceTo(t, '2026-11-12', 'startup')).toMatchObject({ finalizedWeeks: [] })
    expect(await weeklyRows(t)).toHaveLength(2)
    // Skipped weeks leave no board and no history entry.
    const history = await loadWeeklyHistory(t.context)
    if (history.status !== 'ok') throw new Error('history')
    expect(history.weeks.map((week) => week.weekKey)).toEqual(['2026-10-19', '2026-10-05'])
    expect(await getWeeklyBoard(t.database, week2)).toBeNull()
    expect(await verifyDatabaseIntegrity(t.database)).toMatchObject({ ok: true })
  })

  it('replays no cinematic events: the reconciliation result is informational and the Home snapshot stays plain', async () => {
    const { t } = await finishedWeek(10)
    const synced = await advanceTo(t, '2026-10-28', 'startup')
    expect(Object.keys(synced).sort()).toEqual(['finalized', 'finalizedWeeks', 'home'])
    expect(Object.keys(synced.home).sort()).toEqual(['clock', 'dailyMessage', 'player', 'streaks', 'today', 'weekly'])
  })
})

describe('a finalized week is protected at the application level', () => {
  /**
   * The current week's board, frozen by the domain and planted directly in storage. A finalized board can only be
   * reached by these use cases if the stored state says so, so this is how the application's own guard is exercised
   * (the persistence commands have their own independent tests).
   */
  async function currentWeekFinalized() {
    const t = await setup()
    await created(t)
    const board = await activeBoard(t)
    await setWeeklyGoalProgress(t.context, board.goals[0]!.id, 20)
    const frozen = finalizeWeeklyBoard({
      board: await activeBoard(t),
      linkedCounts: new Map(),
      ledger: { totalExp: 0, lastSeq: 0 },
      today: d(NEXT_MONDAY),
      finalizedAt: noonOn(NEXT_MONDAY),
    })
    if (frozen.status !== 'finalized') throw new Error('fixture')
    await new Promise<void>((resolve, reject) => {
      const transaction = t.database.openTransaction(['weeklyBoards'], 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.objectStore('weeklyBoards').put(frozen.board)
    })
    return { t, frozen: frozen.board }
  }

  it('refuses to edit it, from the stored state, without opening a single write transaction', async () => {
    const { t, frozen } = await currentWeekFinalized()
    const before = await getWeeklyBoard(t.database, WEEK)
    const { result, writes } = await countWrites(t, () => saveWeeklyBoard(t.context, { ...weeklyForm(), revision: frozen.revision }))
    expect(result).toEqual({ status: 'rejected', reason: 'board_finalized' })
    expect(writes).toBe(0)
    expect(await getWeeklyBoard(t.database, WEEK)).toEqual(before)
  })

  it('refuses a progress change on it, before any write', async () => {
    const { t, frozen } = await currentWeekFinalized()
    const { result, writes } = await countWrites(t, () => setWeeklyGoalProgress(t.context, frozen.goals[0]!.id, 0))
    expect(result).toEqual({ status: 'rejected', reason: 'board_finalized' })
    expect(writes).toBe(0)
    expect((await getWeeklyBoard(t.database, WEEK))?.goals[0]?.manualProgress).toBe(20)
  })

  it('the editor offers no form for it, and the screen shows it frozen', async () => {
    const { t } = await currentWeekFinalized()
    expect(await loadWeeklyEditor(t.context)).toEqual({ status: 'finalized' })
    const screen = await screenOf(t)
    expect(screen.current).toMatchObject({ kind: 'finalized', week: { weekKey: '2026-10-05', score: 6, bonusExp: 100 } })
  })

  it('a stale form for a finished week cannot reach it once the week has moved on', async () => {
    const t = await setup()
    await created(t)
    const board = await activeBoard(t)
    await advanceTo(t, NEXT_MONDAY)
    const before = await getWeeklyBoard(t.database, WEEK)
    // The old screen's form (revision 1 of last week's board) is now addressed at the NEW week, which has no board.
    const { result } = await countWrites(t, () => saveWeeklyBoard(t.context, { ...weeklyForm(), revision: board.revision }))
    expect(result).toEqual({ status: 'rejected', reason: 'stale' })
    expect(await getWeeklyBoard(t.database, WEEK)).toEqual(before)
    expect(before?.status).toBe('finalized')
    expect(await getWeeklyBoard(t.database, nextWeekKey(WEEK))).toBeNull()
  })

  it('with the clock set back into the finished week, the lifecycle gate refuses first and nothing is written', async () => {
    const t = await setup()
    await created(t)
    await advanceTo(t, NEXT_MONDAY)
    t.clock.set(noonOn('2026-10-09'))
    const board = await getWeeklyBoard(t.database, WEEK)
    expect(board?.status).toBe('finalized')
    const { result, writes } = await countWrites(t, () => saveWeeklyBoard(t.context, weeklyForm({ revision: board!.revision })))
    expect(result).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(writes).toBe(0)
  })
})

describe('history never recomputes a finished week', () => {
  it('lists finalized weeks newest first from their frozen snapshot, unaffected by later quest changes', async () => {
    const t = await setup()
    const gym = await gymQuest(t)
    await created(
      t,
      weeklyForm({
        focus: 'Frozen focus',
        goals: [
          goalRow('g1', { title: 'Gym sessions', points: 6, target: '1', trackingMode: 'linked_quest', templateId: gym }),
          goalRow('g2', { title: 'Report', points: 4, target: '1' }),
        ],
      }),
    )
    await completeQuestOn(t, gym, WEDNESDAY)
    await setWeeklyGoalProgress(t.context, (await activeBoard(t)).goals[1]!.id, 1)
    await advanceTo(t, NEXT_MONDAY)

    const first = await loadWeeklyHistory(t.context)
    if (first.status !== 'ok') throw new Error('history')
    expect(first.weeks).toHaveLength(1)
    expect(first.weeks[0]).toMatchObject({
      weekKey: '2026-10-05',
      startDate: '2026-10-05',
      endDate: '2026-10-11',
      focus: 'Frozen focus',
      score: 10,
      goalCount: 2,
      goalsCompleted: 2,
      bonusExp: 500,
      rewardTier: { minScore: 10, text: 'Evening off' },
      claimedAt: null,
      claimable: true,
    })
    expect(first.weeks[0]?.goals.map((goal) => [goal.title, goal.progress, goal.completed, goal.earnedPoints])).toEqual([
      ['Gym sessions', 1, true, 6],
      ['Report', 1, true, 4],
    ])

    // Later: the quest is renamed, archived, more days pass, other quests are done.
    await updateQuest(t.context, gym, buildFormValues({ title: 'Totally different', difficulty: 'S' }, NEXT_MONDAY))
    await archiveQuest(t.context, gym)
    await advanceTo(t, '2026-10-20')
    expect(await loadWeeklyHistory(t.context)).toEqual(first)
  })

  it('lists several weeks newest first', async () => {
    const t = await setup()
    for (const [weekKey, today] of [[WEEK, WEDNESDAY], [nextWeekKey(WEEK), '2026-10-14']] as const) {
      await saveWeeklyBoardAtomically(t.database, { weekKey, definition: weeklyDefinitionScoring(7), expectedRevision: null, today: d(today), now: noonOn(today) })
    }
    await advanceTo(t, '2026-10-20', 'startup')
    const history = await loadWeeklyHistory(t.context)
    if (history.status !== 'ok') throw new Error('history')
    expect(history.weeks.map((week) => week.weekKey)).toEqual(['2026-10-12', '2026-10-05'])
  })

  it('shows the last finished week on the Weekly screen, and a current week that is final as read-only', async () => {
    const t = await setup()
    await created(t)
    await advanceTo(t, NEXT_MONDAY)
    const screen = await screenOf(t)
    expect(screen.current).toEqual({ kind: 'none' })
    expect(screen.latestFinalized).toMatchObject({ weekKey: '2026-10-05', score: 0, bonusExp: 0, rewardTier: null, claimable: false })
  })
})

describe('claiming the real-life reward', () => {
  async function finishedWeek(score = 10) {
    const t = await setup()
    await created(t, weeklyForm({ goals: tenGoals() }))
    for (const goal of (await activeBoard(t)).goals.slice(0, score)) await setWeeklyGoalProgress(t.context, goal.id, 1)
    await advanceTo(t, NEXT_MONDAY)
    return t
  }

  it('cannot be claimed before the week is finalized', async () => {
    const t = await setup()
    await created(t)
    expect(await claimWeeklyReward(t.context, WEEK)).toEqual({ status: 'rejected', reason: 'not_finalized' })
    expect(await claimWeeklyReward(t.context, nextWeekKey(WEEK))).toEqual({ status: 'rejected', reason: 'board_not_found' })
    expect(await listWeeklyRewardClaims(t.database)).toEqual([])
  })

  it('claims the highest tier once, awards no EXP, and shows as claimed in the history', async () => {
    const t = await finishedWeek(8)
    const expBefore = (await loadHome(t.context)).player.totalExp
    const ledger = await listXpTransactions(t.database)

    expect(await claimWeeklyReward(t.context, WEEK)).toEqual({ status: 'claimed' })
    expect(await claimWeeklyReward(t.context, WEEK)).toEqual({ status: 'already_claimed' })

    const [claim] = await listWeeklyRewardClaims(t.database)
    expect(claim).toEqual({ weekKey: WEEK, tierMinScore: 8, rewardTextSnapshot: 'Movie night', claimedAt: noonOn(NEXT_MONDAY) })
    expect(await listXpTransactions(t.database)).toEqual(ledger)
    expect((await loadHome(t.context)).player.totalExp).toBe(expBefore)
    const history = await loadWeeklyHistory(t.context)
    expect(history).toMatchObject({ status: 'ok', weeks: [{ claimedAt: noonOn(NEXT_MONDAY), claimable: false }] })
  })

  it('has nothing to claim for a week that earned no tier', async () => {
    const t = await finishedWeek(5)
    expect(await claimWeeklyReward(t.context, WEEK)).toEqual({ status: 'rejected', reason: 'no_reward' })
  })

  it('has nothing to claim when the earned tier has no reward text', async () => {
    const t = await setup()
    await created(t, weeklyForm({ goals: tenGoals(), rewards: { 6: '', 7: '', 8: '', 9: '', 10: '' } }))
    for (const goal of (await activeBoard(t)).goals) await setWeeklyGoalProgress(t.context, goal.id, 1)
    await advanceTo(t, NEXT_MONDAY)
    expect(await claimWeeklyReward(t.context, WEEK)).toEqual({ status: 'rejected', reason: 'reward_text_blank' })
    const history = await loadWeeklyHistory(t.context)
    expect(history).toMatchObject({ weeks: [{ claimable: false, rewardTier: { minScore: 10, text: '' } }] })
  })
})

describe('the clock and the weekly system', () => {
  it('pauses every weekly change when the device clock is behind the recorded history', async () => {
    const t = await setup()
    await created(t)
    const [g1] = (await activeBoard(t)).goals
    await advanceTo(t, NEXT_MONDAY)
    t.clock.set(noonOn(WEDNESDAY)) // set back into a finished week

    expect(await saveWeeklyBoard(t.context, weeklyForm())).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await setWeeklyGoalProgress(t.context, g1!.id, 5)).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await claimWeeklyReward(t.context, WEEK)).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    const screen = await screenOf(t)
    expect(screen.clock).toMatchObject({ status: 'behind' })
    expect(screen.current).toMatchObject({ kind: 'finalized' }) // shown frozen, read-only
    expect(await weeklyRows(t)).toHaveLength(0) // a 0/10 week pays nothing
  })

  it('computes the Home summary for the current week only', async () => {
    const t = await setup()
    await created(t)
    expect(await loadWeeklyHomeSummary(t.context, readClock(t.context.clock))).toEqual({ state: 'board', score: 0, goalsCompleted: 0, goalCount: 2 })
    t.clock.set(noonOn(NEXT_MONDAY))
    expect(await loadWeeklyHomeSummary(t.context, readClock(t.context.clock))).toEqual({ state: 'none' })
  })

  it('weekly use cases never touch the daily denominator, streaks or quests', async () => {
    const t = await setup()
    const before = await loadHome(t.context)
    await created(t)
    await setWeeklyGoalProgress(t.context, (await activeBoard(t)).goals[0]!.id, 20)
    const after = await loadHome(t.context)
    expect(after.today.progress).toEqual(before.today.progress)
    expect(after.today.quests).toEqual(before.today.quests)
    expect(after.streaks).toEqual(before.streaks)
    expect((await listCompletionsByTemplate(t.database, 'tpl_seed_sleep'))).toEqual([])
  })
})

/** Ten one-point manual goals, `score` of them already achieved: a definition scoring exactly `score`. */
function weeklyDefinitionScoring(score: number) {
  return {
    focus: null,
    goals: Array.from({ length: 10 }, (_, index) => ({
      id: `wg_s${index}`,
      title: `Task ${index}`,
      maxPoints: 1,
      target: 1,
      unit: null,
      tracking: { mode: 'manual' as const },
      manualProgress: index < score ? 1 : 0,
      notes: null,
    })),
    rewardTiers: ([6, 7, 8, 9, 10] as const).map((minScore) => ({ minScore, text: REWARD_TEXTS[minScore] })),
  }
}
