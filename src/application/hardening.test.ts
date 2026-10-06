// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
  exportBackup,
  getWeeklyBoard,
  getWeeklyRewardClaim,
  listDailySummaries,
  listOccurrencesByDate,
  listTemplates,
  listXpTransactions,
  verifyDatabaseIntegrity,
  type PersistenceDatabase,
} from '@/persistence'
import { asWeekKey } from '@/domain'
import { completeTodayQuest } from './completion/completeTodayQuest'
import { synchronizeAndLoadHome } from './home'
import { startApplication } from './initialize'
import { archiveQuest } from './quests/archiveQuest'
import { createQuest } from './quests/createQuest'
import { reorderQuests } from './quests/reorderQuests'
import { restoreQuest } from './quests/restoreQuest'
import { updateQuest } from './quests/updateQuest'
import { loadStreakStats } from './player/loadStreakStats'
import { claimWeeklyReward } from './weekly/claimWeeklyReward'
import { saveWeeklyBoard } from './weekly/saveWeeklyBoard'
import { setWeeklyGoalProgress } from './weekly/setWeeklyGoalProgress'
import type { Clock } from './clock'
import { buildFormValues, createSequentialIds, createTestContext, newFactory, noonOn, type TestContext } from './test-utils/helpers'
import { weeklyForm } from './test-utils/weekly'
import { openDatabase } from '@/persistence'

/**
 * Phase 13 hardening: the same rules the other suites prove one step at a time, attacked the way real use does:
 * several taps at once, a window left open, days or weeks away, a clock that moves. Every scenario ends with the
 * whole database read back and validated, and checks the exact ledger.
 */

const opened: PersistenceDatabase[] = []
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

const MONDAY = '2026-10-05'
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const
const occurrenceOf = (templateId: string, date: string) => `occ:${templateId}@${date}`
const prayer = (key: (typeof PRAYERS)[number], date: string) => occurrenceOf(`tpl_seed_prayer_${key}`, date)

async function setup(date = MONDAY): Promise<TestContext> {
  const t = await createTestContext(date)
  opened.push(t.database)
  await startApplication(t.context)
  return t
}

/**
 * The whole stored dataset as one value. Reading it through the export validates every record, the ledger chain
 * and the cross-references, so any corruption fails the test right here.
 */
async function snapshot(t: Pick<TestContext, 'database'>) {
  const envelope = await exportBackup(t.database, { exportedAt: 1, exportedFromTimeZone: 'Europe/Berlin', appVersion: 'test' })
  return envelope.data
}

async function expectIntegrity(t: Pick<TestContext, 'database'>) {
  const result = await verifyDatabaseIntegrity(t.database)
  expect(result.ok, result.ok ? '' : JSON.stringify(result.issues)).toBe(true)
}

/** The ledger is gapless, ordered, and every row carries the true running total. */
async function expectExactLedger(t: Pick<TestContext, 'database'>) {
  const ledger = await listXpTransactions(t.database)
  let running = 0
  ledger.forEach((row, index) => {
    running += row.amount
    expect(row.seq).toBe(index + 1)
    expect(row.totalExpAfter).toBe(running)
  })
  expect(new Set(ledger.map((row) => row.idempotencyKey)).size).toBe(ledger.length) // no duplicate award key
  return { ledger, total: running }
}

const tally = (statuses: readonly string[]) =>
  statuses.reduce<Record<string, number>>((counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {})

async function completePrayers(t: TestContext, date: string, count: number = PRAYERS.length) {
  for (const key of PRAYERS.slice(0, count)) {
    const result = await completeTodayQuest(t.context, prayer(key, date))
    if (result.status !== 'completed') throw new Error(`completion of ${key} was ${result.status}`)
  }
}

describe('completion is final and exactly-once, however many taps arrive', () => {
  it('twelve simultaneous taps on one quest award its EXP once and write one completion', async () => {
    const t = await setup()
    const id = prayer('fajr', MONDAY)

    const results = await Promise.all(Array.from({ length: 12 }, () => completeTodayQuest(t.context, id)))

    expect(tally(results.map((result) => result.status))).toEqual({ completed: 1, already_completed: 11 })
    const { ledger, total } = await expectExactLedger(t)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ idempotencyKey: `quest_completion:${id}`, amount: 10, seq: 1 })
    expect(total).toBe(10)
    expect((await snapshot(t)).questCompletions).toHaveLength(1)
    await expectIntegrity(t)
  })

  it('every quest tapped at the same moment, several times each: one award per quest, ledger exact', async () => {
    const t = await setup()
    const ids = [...PRAYERS.map((key) => prayer(key, MONDAY)), 'occ:tpl_seed_sleep@2026-10-05']

    const results = await Promise.all(ids.flatMap((id) => [0, 1, 2].map(() => completeTodayQuest(t.context, id))))

    expect(tally(results.map((result) => result.status))).toEqual({ completed: 6, already_completed: 12 })
    const { ledger, total } = await expectExactLedger(t)
    expect(ledger).toHaveLength(6)
    expect(total).toBe(5 * 10 + 20) // five prayers (E, 10) and Sleep (D, 20)
    expect((await snapshot(t)).questCompletions).toHaveLength(6)
    await expectIntegrity(t)
  })

  it('a completion at the last millisecond of the day counts; at midnight it is refused until the day is synchronized, and then the old day stays closed', async () => {
    const t = await setup()
    const id = prayer('fajr', MONDAY)
    const lastMs = Date.UTC(2026, 9, 5, 21, 59, 59, 999) // Berlin 23:59:59.999 (CEST)
    t.clock.set(lastMs)
    expect(await completeTodayQuest(t.context, id)).toMatchObject({ status: 'completed' })

    t.clock.set(lastMs + 1) // Berlin 00:00:00.000 on the next day
    expect(await completeTodayQuest(t.context, prayer('dhuhr', MONDAY))).toMatchObject({ status: 'failed', reason: 'day_not_synchronized' })

    await synchronizeAndLoadHome(t.context, 'midnight_tick')
    expect(await completeTodayQuest(t.context, prayer('dhuhr', MONDAY))).toMatchObject({ status: 'rejected', reason: 'day_ended' })

    const { ledger } = await expectExactLedger(t)
    expect(ledger).toHaveLength(1) // only the quest completed before midnight
    await expectIntegrity(t)
  })
})

describe('quest management under pressure keeps the order and the data valid', () => {
  it('creates, edits, archives, restores and reorders all at once without breaking an invariant', async () => {
    const t = await setup()
    const before = await listTemplates(t.database)
    const order = [...before].sort((a, b) => a.sortOrder - b.sortOrder).map((template) => template.id)
    const fajr = 'tpl_seed_prayer_fajr'
    const dhuhr = 'tpl_seed_prayer_dhuhr'

    const operations = await Promise.allSettled([
      ...Array.from({ length: 6 }, (_, index) => createQuest(t.context, buildFormValues({ title: `Custom ${index}` }))),
      reorderQuests(t.context, { expectedOrder: order, newOrder: [...order].reverse() }),
      archiveQuest(t.context, fajr),
      archiveQuest(t.context, fajr),
      restoreQuest(t.context, fajr),
      updateQuest(t.context, dhuhr, buildFormValues({ title: 'Dhuhr (edited)' })),
      completeTodayQuest(t.context, prayer('asr', MONDAY)),
    ])

    for (const operation of operations) expect(operation.status).toBe('fulfilled') // a refusal is a result, never a crash
    const templates = await listTemplates(t.database)
    expect(templates).toHaveLength(6 + 6)
    expect(new Set(templates.map((template) => template.sortOrder)).size).toBe(templates.length) // one unique slot each
    const occurrences = await listOccurrencesByDate(t.database, MONDAY as never)
    expect(new Set(occurrences.map((occurrence) => occurrence.id)).size).toBe(occurrences.length) // one occurrence per (quest, day)
    await expectExactLedger(t)
    await expectIntegrity(t)
  })

  it('an editor opened before another change cannot overwrite the order, and an archived quest cannot be edited', async () => {
    const t = await setup()
    const templates = await listTemplates(t.database)
    const order = [...templates].sort((a, b) => a.sortOrder - b.sortOrder).map((template) => template.id)
    const swapped = [order[1], order[0], ...order.slice(2)] as string[]

    expect(await reorderQuests(t.context, { expectedOrder: order, newOrder: swapped })).toMatchObject({ status: 'reordered' })
    // A second window still holds the old order: it must be refused, not applied over the new one.
    expect(await reorderQuests(t.context, { expectedOrder: order, newOrder: [...order].reverse() })).toMatchObject({ status: 'stale' })
    expect(await archiveQuest(t.context, order[2] as string)).toMatchObject({ status: 'archived' })
    expect(await updateQuest(t.context, order[2] as string, buildFormValues({ title: 'Nope' }))).toMatchObject({ status: 'archived' })
    await expectIntegrity(t)
  })
})

describe('the day lifecycle is idempotent', () => {
  it('ten days away, six windows waking at once: each missed day is finalized exactly once, in order, with the right streak', async () => {
    const t = await setup()
    await completePrayers(t, MONDAY) // five of six: a 70 %+ day

    t.clock.set(noonOn('2026-10-15'))
    const woke = await Promise.all(Array.from({ length: 6 }, () => synchronizeAndLoadHome(t.context, 'resume')))
    expect(woke.reduce((sum, result) => sum + result.finalized.length, 0)).toBe(10) // 10-05 … 10-14, each by exactly one window

    const summaries = await listDailySummaries(t.database)
    expect(summaries.map((summary) => summary.dateKey)).toEqual(
      Array.from({ length: 10 }, (_, index) => `2026-10-${String(5 + index).padStart(2, '0')}`),
    )
    const settled = await snapshot(t)
    await Promise.all([synchronizeAndLoadHome(t.context, 'resume'), synchronizeAndLoadHome(t.context, 'startup'), synchronizeAndLoadHome(t.context, 'midnight_tick')])
    expect(await snapshot(t)).toEqual(settled) // nothing changes on a repeat, not even by a byte

    expect(await loadStreakStats(t.context)).toMatchObject({ currentStreak: 0, bestStreak: 1 }) // Monday counted; nine empty days reset it
    await expectExactLedger(t)
    await expectIntegrity(t)
  })

  it('crossing the daylight-saving changes (a 25-hour and a 23-hour day) loses and repeats no day', async () => {
    const autumn = await setup('2026-10-24')
    autumn.clock.set(noonOn('2026-10-28'))
    await synchronizeAndLoadHome(autumn.context, 'resume')
    expect((await listDailySummaries(autumn.database)).map((summary) => summary.dateKey)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
    await expectIntegrity(autumn)

    const spring = await setup('2026-03-28')
    spring.clock.set(noonOn('2026-04-01'))
    await synchronizeAndLoadHome(spring.context, 'resume')
    expect((await listDailySummaries(spring.database)).map((summary) => summary.dateKey)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'])
    await expectIntegrity(spring)
  })
})

describe('a clock that moves backwards pauses everything and writes nothing', () => {
  it('refuses every change while behind, leaves the stored data byte-identical, and recovers by itself', async () => {
    const t = await setup()
    t.clock.set(noonOn('2026-10-12'))
    await synchronizeAndLoadHome(t.context, 'resume') // 10-05 … 10-11 finalized
    const settled = await snapshot(t)

    t.clock.set(noonOn('2026-10-08')) // the device clock was set back
    const paused = await synchronizeAndLoadHome(t.context, 'resume')
    expect(paused.home.clock).toMatchObject({ status: 'behind' })
    expect(paused.finalized).toHaveLength(0)

    expect(await completeTodayQuest(t.context, prayer('fajr', '2026-10-12'))).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await createQuest(t.context, buildFormValues({ title: 'Blocked' }))).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await archiveQuest(t.context, 'tpl_seed_prayer_fajr')).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await saveWeeklyBoard(t.context, weeklyForm())).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await snapshot(t)).toEqual(settled)

    t.clock.set(noonOn('2026-10-12')) // the date catches up
    expect((await synchronizeAndLoadHome(t.context, 'resume')).home.clock).toMatchObject({ status: 'ok' })
    expect(await completeTodayQuest(t.context, prayer('fajr', '2026-10-12'))).toMatchObject({ status: 'completed' })
    await expectIntegrity(t)
  })

  it('travelling west across the date line of the recorded history pauses for the hours the local date is behind, then resumes (documented OD-22 behaviour)', async () => {
    // The device clock reports whichever zone the phone is in; the instant stays the same.
    let zone = 'Europe/Berlin'
    let now = noonOn(MONDAY)
    const clock: Clock = { now: () => now, timeZone: () => zone }
    const factory = newFactory()
    const database = await openDatabase({ factory })
    opened.push(database)
    const context = { database, clock, ids: createSequentialIds() }
    await startApplication(context)

    now = Date.UTC(2026, 9, 6, 0, 0, 0) // Tuesday 02:00 in Berlin (CEST): Monday is finalized
    await synchronizeAndLoadHome(context, 'resume')
    const settled = await snapshot({ database })

    zone = 'America/New_York' // the same instant is still Monday evening (20:00) there
    const paused = await synchronizeAndLoadHome(context, 'resume')
    expect(paused.home.clock).toMatchObject({ status: 'behind', localDate: '2026-10-05', recordedDate: '2026-10-06' })
    expect(await completeTodayQuest(context, prayer('fajr', '2026-10-06'))).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await snapshot({ database })).toEqual(settled)

    now += 4 * 3_600_000 // four hours later it is Tuesday 00:00 there
    expect((await synchronizeAndLoadHome(context, 'resume')).home.clock).toMatchObject({ status: 'ok' })
    await expectIntegrity({ database })
  })
})

describe('the Weekly Goal Crusher is exactly-once through weeks away', () => {
  async function boardWithScore(t: TestContext) {
    t.clock.set(noonOn('2026-10-07')) // Wednesday of the week starting 2026-10-05
    await synchronizeAndLoadHome(t.context, 'resume') // every screen synchronizes the day before a change
    expect(await saveWeeklyBoard(t.context, weeklyForm())).toMatchObject({ status: 'created' })
    const board = await getWeeklyBoard(t.database, asWeekKey('2026-10-05'))
    const big = board?.goals.find((goal) => goal.maxPoints === 6)
    if (big === undefined) throw new Error('the 6-point goal was not saved')
    expect(await setWeeklyGoalProgress(t.context, big.id, 20)).toMatchObject({ status: 'updated' }) // 6 / 10 → +100 EXP
    return big.id
  }

  it('three weeks away, several windows waking at once: one finalization, one bonus row, nothing for the empty weeks', async () => {
    const t = await setup()
    await boardWithScore(t)

    t.clock.set(noonOn('2026-10-28'))
    const woke = await Promise.all(Array.from({ length: 4 }, () => synchronizeAndLoadHome(t.context, 'resume')))
    expect(woke.reduce((sum, result) => sum + result.finalizedWeeks.length, 0)).toBe(1)

    const { ledger, total } = await expectExactLedger(t)
    const bonus = ledger.filter((row) => row.source.type === 'weekly_goal_crusher')
    expect(bonus).toHaveLength(1)
    expect(bonus[0]).toMatchObject({ idempotencyKey: 'weekly_goal_crusher:2026-10-05', amount: 100, category: null, sourceWeekKey: '2026-10-05' })
    expect(total).toBe(100)
    const boards = (await snapshot(t)).weeklyBoards
    expect(boards).toHaveLength(1) // the weeks without a board leave no record, bonus or penalty
    expect(boards[0]).toMatchObject({ status: 'finalized' })

    const settled = await snapshot(t)
    await Promise.all([synchronizeAndLoadHome(t.context, 'resume'), synchronizeAndLoadHome(t.context, 'startup')])
    expect(await snapshot(t)).toEqual(settled) // a finalized week never recomputes
    await expectIntegrity(t)
  })

  it('claiming the reward five times at once records one claim and no EXP', async () => {
    const t = await setup()
    await boardWithScore(t)
    t.clock.set(noonOn('2026-10-13'))
    await synchronizeAndLoadHome(t.context, 'resume')
    const ledgerBefore = await listXpTransactions(t.database)

    const results = await Promise.all(Array.from({ length: 5 }, () => claimWeeklyReward(t.context, asWeekKey('2026-10-05'))))

    expect(tally(results.map((result) => result.status))).toEqual({ claimed: 1, already_claimed: 4 })
    expect(await getWeeklyRewardClaim(t.database, asWeekKey('2026-10-05'))).not.toBeNull()
    expect(await listXpTransactions(t.database)).toEqual(ledgerBefore) // a claim never touches the ledger
    await expectIntegrity(t)
  })

  it('a finalized board refuses edits and progress from a window that was left open', async () => {
    const t = await setup()
    const goalId = await boardWithScore(t)
    t.clock.set(noonOn('2026-10-13'))
    await synchronizeAndLoadHome(t.context, 'resume')
    const settled = await snapshot(t)

    // The week is over: the old screen's save and progress change are refused (the current week has no board).
    expect(await setWeeklyGoalProgress(t.context, goalId, 0)).toMatchObject({ status: 'rejected' })
    expect(await snapshot(t)).toEqual(settled)
    await expectIntegrity(t)
  })
})
