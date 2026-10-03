// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTemplate,
  getCompletion,
  listDailySummaries,
  listXpTransactions,
  type PersistenceDatabase,
} from '@/persistence'
import { loadHome } from '../home'
import { initializeApplication } from '../initialize'
import { synchronizeDay } from '../lifecycle/synchronization'
import { completeTodayQuest } from './completeTodayQuest'
import { buildTemplate, createTestContext, noonOn, type TestContext } from '../test-utils/helpers'

const TODAY = '2026-10-05'
const FAJR = `occ:tpl_seed_prayer_fajr@${TODAY}`
const SLEEP = `occ:tpl_seed_sleep@${TODAY}`

const opened: PersistenceDatabase[] = []
async function setup(): Promise<TestContext> {
  const testContext = await createTestContext(TODAY)
  opened.push(testContext.database)
  await initializeApplication(testContext.context)
  return testContext
}

afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

describe('completeTodayQuest', () => {
  it('completes an active quest and persists the completion and its EXP transaction', async () => {
    const { context, database, clock } = await setup()

    const result = await completeTodayQuest(context, FAJR)

    expect(result.status).toBe('completed')
    const completion = await getCompletion(database, FAJR)
    expect(completion).toMatchObject({
      occurrenceId: FAJR,
      dateKey: TODAY,
      expAwarded: 10,
      completedAt: clock.now(),
      timeZone: 'Europe/Berlin',
    })
    const ledger = await listXpTransactions(database)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({
      amount: 10,
      seq: 1,
      totalExpAfter: 10,
      category: 'discipline',
      effectiveDate: TODAY,
      source: { type: 'quest_completion', occurrenceId: FAJR },
    })
  })

  it('returns the refreshed visible state: completion, daily progress and progression', async () => {
    const { context } = await setup()

    const result = await completeTodayQuest(context, FAJR)

    if (result.status !== 'completed' || result.home === null) throw new Error('expected a refreshed completion')
    const fajr = result.home.today.quests.find((quest) => quest.occurrenceId === FAJR)
    expect(fajr).toMatchObject({ title: 'Fajr', completed: true, expReward: 10 })
    expect(result.home.today.quests.filter((quest) => quest.completed)).toHaveLength(1)
    expect(result.home.today.progress).toMatchObject({
      eligibleCount: 6,
      completedCount: 1,
      displayPercent: 16,
      quality: 'incomplete',
    })
    expect(result.home.player).toEqual({
      totalExp: 10,
      level: 1,
      expIntoLevel: 10,
      expToNext: 100,
      rank: 'E',
    })
  })

  it('awards the Sleep quest its own EXP', async () => {
    const { context } = await setup()

    const result = await completeTodayQuest(context, SLEEP)

    if (result.status !== 'completed' || result.home === null) throw new Error('expected a refreshed completion')
    expect(result.home.player.totalExp).toBe(20)
  })

  it('does not award EXP again when the same quest is completed twice', async () => {
    const { context, database } = await setup()

    const first = await completeTodayQuest(context, FAJR)
    const second = await completeTodayQuest(context, FAJR)
    const third = await completeTodayQuest(context, FAJR)

    expect(first.status).toBe('completed')
    expect(second.status).toBe('already_completed')
    expect(third.status).toBe('already_completed')
    expect(await listXpTransactions(database)).toHaveLength(1)
    if (third.status !== 'already_completed' || third.home === null) throw new Error('expected refreshed state')
    expect(third.home.player.totalExp).toBe(10)
    expect(third.home.today.progress.completedCount).toBe(1)
  })

  it('awards EXP once when the same tap arrives concurrently', async () => {
    const { context, database } = await setup()

    const results = await Promise.all([
      completeTodayQuest(context, FAJR),
      completeTodayQuest(context, FAJR),
      completeTodayQuest(context, FAJR),
    ])

    expect(results.filter((result) => result.status === 'completed')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'already_completed')).toHaveLength(2)
    expect(await listXpTransactions(database)).toHaveLength(1)
  })

  it('rejects a completion after midnight without writing anything', async () => {
    const { context, database, clock } = await setup()
    clock.set(noonOn('2026-10-06'))
    await synchronizeDay(context, 'resume') // the lifecycle step every screen runs first

    const result = await completeTodayQuest(context, FAJR)

    expect(result).toEqual({ status: 'rejected', reason: 'day_ended' })
    expect(await getCompletion(database, FAJR)).toBeNull()
    expect(await listXpTransactions(database)).toHaveLength(0)
  })

  it('refuses a stale-day completion before the lifecycle has reconciled the missed day', async () => {
    const { context, database, clock } = await setup()
    clock.set(noonOn('2026-10-06'))

    const result = await completeTodayQuest(context, FAJR)

    expect(result).toMatchObject({ status: 'failed', reason: 'day_not_synchronized' })
    expect(await getCompletion(database, FAJR)).toBeNull()
    expect(await listXpTransactions(database)).toHaveLength(0)
    expect(await listDailySummaries(database)).toHaveLength(0)
  })

  it('refuses every completion while the device clock is behind the recorded history', async () => {
    const { context, database, clock } = await setup()
    clock.set(noonOn('2026-10-04'))

    const result = await completeTodayQuest(context, FAJR)

    expect(result).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await listXpTransactions(database)).toHaveLength(0)
  })

  it('rejects an unknown occurrence', async () => {
    const { context } = await setup()

    expect(await completeTodayQuest(context, `occ:tpl_missing@${TODAY}`)).toEqual({
      status: 'rejected',
      reason: 'not_found',
    })
  })

  it('reports a level up in the returned player state and events', async () => {
    const { context, database } = await setup()
    await createTemplate(database, buildTemplate({ id: 'tpl_big', title: 'Big one', difficulty: 'S', createdAt: 9 }))
    await completeTodayQuest(context, FAJR)
    await loadHome(context) // materializes the new quest's occurrence
    const bigId = `occ:tpl_big@${TODAY}`

    const result = await completeTodayQuest(context, bigId)

    if (result.status !== 'completed' || result.home === null) throw new Error('expected a refreshed completion')
    // 10 (Fajr) + 120 (S) = 130 total; Level 2 starts at 100.
    expect(result.home.player).toEqual({
      totalExp: 130,
      level: 2,
      expIntoLevel: 30,
      expToNext: 135,
      rank: 'E',
    })
    expect(result.events.map((event) => event.type)).toEqual(['QuestCompleted', 'XPAwarded', 'LevelUp'])
    expect(result.events.find((event) => event.type === 'LevelUp')).toMatchObject({
      previousLevel: 1,
      newLevel: 2,
    })
  })

  it('reports failure (not success) when storage is no longer available', async () => {
    const { context, database } = await setup()
    database.close()

    const result = await completeTodayQuest(context, FAJR)

    expect(result).toMatchObject({ status: 'failed', reason: 'database_unavailable' })
  })

  it('reads the clock exactly for the completion instant', async () => {
    const { context, database, clock } = await setup()
    clock.set(noonOn(TODAY) + 123_456)

    await completeTodayQuest(context, FAJR)

    expect((await getCompletion(database, FAJR))?.completedAt).toBe(noonOn(TODAY) + 123_456)
    expect((await listXpTransactions(database))[0]?.createdAt).toBe(noonOn(TODAY) + 123_456)
  })
})
