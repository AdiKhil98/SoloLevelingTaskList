// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
  getCompletion,
  getDailySummary,
  listDailySummaries,
  listOccurrencesByDate,
  listXpTransactions,
  readFinalizationCursor,
  verifyDatabaseIntegrity,
  type PersistenceDatabase,
} from '@/persistence'
import { completeTodayQuest } from '../completion/completeTodayQuest'
import { startApplication } from '../initialize'
import { loadHome, synchronizeAndLoadHome } from '../home'
import { archiveQuest } from '../quests/archiveQuest'
import { createQuest } from '../quests/createQuest'
import { restoreQuest } from '../quests/restoreQuest'
import { updateQuest } from '../quests/updateQuest'
import { buildFormValues, buildTemplate, createTestContext, d, noonOn, type TestContext } from '../test-utils/helpers'
import { createTemplate } from '@/persistence'
import { buildDailyReport } from '../report/buildDailyReport'
import { assessDay, reconcileDays, requireSynchronizedDay, synchronizeDay } from './synchronization'
import { readClock } from '../clock'

const MONDAY = '2026-10-05'
const TUESDAY = '2026-10-06'
const WEDNESDAY = '2026-10-07'
const THURSDAY = '2026-10-08'

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const
const occurrence = (templateId: string, date: string) => `occ:${templateId}@${date}`
const prayer = (key: (typeof PRAYERS)[number], date: string) => occurrence(`tpl_seed_prayer_${key}`, date)
const sleepOn = (date: string) => occurrence('tpl_seed_sleep', date)

const opened: PersistenceDatabase[] = []
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

/** The real startup path on `date`: seeds, reconcile, load. */
async function setup(date = MONDAY): Promise<TestContext> {
  const testContext = await createTestContext(date)
  opened.push(testContext.database)
  await startApplication(testContext.context)
  return testContext
}

/** Moves the clock to midday on `date` and runs the lifecycle step every screen runs first. */
async function advanceTo(t: TestContext, date: string, trigger: 'startup' | 'resume' | 'midnight_tick' = 'resume') {
  t.clock.set(noonOn(date))
  return synchronizeAndLoadHome(t.context, trigger)
}

async function completeAll(t: TestContext, date: string, only: ReadonlyArray<string> = [...PRAYERS, 'sleep']) {
  for (const key of only) {
    const id = key === 'sleep' ? sleepOn(date) : prayer(key as (typeof PRAYERS)[number], date)
    const result = await completeTodayQuest(t.context, id)
    if (result.status !== 'completed') throw new Error(`completion of ${id} was ${result.status}`)
  }
}

describe('startup and same-day behaviour', () => {
  it('a fresh start finalizes nothing and has no streak', async () => {
    const t = await createTestContext(MONDAY)
    opened.push(t.database)
    const { home, finalized } = await startApplication(t.context)
    expect(finalized).toEqual([])
    expect(await listDailySummaries(t.database)).toEqual([])
    expect(home.streaks).toEqual({ currentStreak: 0, bestStreak: 0, perfectStreak: 0, totalPerfectDays: 0, lastFinalizedDate: null })
    expect(home.clock).toEqual({ status: 'ok' })
    expect(home.today.quests).toHaveLength(6)
  })

  it('a same-day resume changes nothing', async () => {
    const t = await setup()
    await completeAll(t, MONDAY, ['fajr'])
    const ledger = await listXpTransactions(t.database)
    t.clock.set(noonOn(MONDAY) + 5 * 3_600_000)
    const result = await synchronizeAndLoadHome(t.context, 'resume')
    expect(result.finalized).toEqual([])
    expect(await listDailySummaries(t.database)).toEqual([])
    expect(await listXpTransactions(t.database)).toEqual(ledger)
    expect(result.home.today.progress.completedCount).toBe(1)
  })

  it('repeating startup on the same day is harmless', async () => {
    const t = await setup()
    await startApplication(t.context)
    await startApplication(t.context)
    expect(await listOccurrencesByDate(t.database, d(MONDAY))).toHaveLength(6)
    expect(await listDailySummaries(t.database)).toEqual([])
  })
})

describe('midnight and resume across a day boundary', () => {
  it('finalizes the previous date, materializes the new one and changes the Daily Message input', async () => {
    const t = await setup()
    const before = await loadHome(t.context)
    await completeAll(t, MONDAY, ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) // 5 of 6 = 83 %: Completed

    const { home, finalized } = await advanceTo(t, TUESDAY, 'midnight_tick')

    expect(finalized.map((summary) => summary.dateKey)).toEqual([MONDAY])
    expect(finalized[0]).toMatchObject({
      eligibleCount: 6,
      completedCount: 5,
      quality: 'completed',
      questExp: 50,
      currentStreakAfter: 1,
      finalizedLate: false, // the in-app midnight timer on the next day
    })
    expect(home.today.dateKey).toBe(TUESDAY)
    expect(home.today.quests).toHaveLength(6)
    expect(home.today.progress).toMatchObject({ completedCount: 0, eligibleCount: 6, quality: 'incomplete' })
    expect(home.streaks).toMatchObject({ currentStreak: 1, bestStreak: 1, lastFinalizedDate: MONDAY })
    expect(home.dailyMessage).not.toEqual(before.dailyMessage)
    expect(await verifyDatabaseIntegrity(t.database)).toMatchObject({ ok: true })
  })

  it('refuses to complete yesterday’s quest after midnight, before and after reconciliation', async () => {
    const t = await setup()
    t.clock.set(noonOn(TUESDAY)) // stale screen: yesterday's occurrence is still on it

    const stale = await completeTodayQuest(t.context, prayer('fajr', MONDAY))
    expect(stale).toMatchObject({ status: 'failed', reason: 'day_not_synchronized' })

    await synchronizeDay(t.context, 'resume')
    const reconciled = await completeTodayQuest(t.context, prayer('fajr', MONDAY))
    expect(reconciled).toEqual({ status: 'rejected', reason: 'day_ended' })
    expect(await getCompletion(t.database, prayer('fajr', MONDAY))).toBeNull()
    expect(await listXpTransactions(t.database)).toHaveLength(0)
  })

  it('a completion of the new day works right after reconciliation', async () => {
    const t = await setup()
    const { home } = await advanceTo(t, TUESDAY)
    const fajr = home.today.quests.find((quest) => quest.title === 'Fajr')!
    expect((await completeTodayQuest(t.context, fajr.occurrenceId)).status).toBe('completed')
  })

  it('midnight reconciliation is exactly once even if triggered repeatedly', async () => {
    const t = await setup()
    t.clock.set(noonOn(TUESDAY))
    const results = await Promise.all([
      synchronizeDay(t.context, 'midnight_tick'),
      synchronizeDay(t.context, 'resume'),
      synchronizeDay(t.context, 'resume'),
    ])
    expect(results.reduce((sum, result) => sum + result.finalized.length, 0)).toBe(1)
    expect(await listDailySummaries(t.database)).toHaveLength(1)
    expect((await synchronizeDay(t.context, 'resume')).finalized).toEqual([])
  })
})

describe('missed days', () => {
  it('reconciles every missing date in chronological order, then loads the current day', async () => {
    const t = await setup(MONDAY)
    await completeAll(t, MONDAY) // a perfect Monday
    // The app is then closed until Thursday: Tuesday and Wednesday were never opened.
    const { home, finalized } = await advanceTo(t, THURSDAY, 'startup')

    expect(finalized.map((summary) => summary.dateKey)).toEqual([MONDAY, TUESDAY, WEDNESDAY])
    expect(finalized.map((summary) => summary.quality)).toEqual(['perfect', 'incomplete', 'incomplete'])
    expect(finalized.map((summary) => summary.currentStreakAfter)).toEqual([1, 0, 0])
    expect(finalized.map((summary) => summary.perfectStreakAfter)).toEqual([1, 0, 0])
    expect(finalized.every((summary) => summary.finalizedLate)).toBe(true)
    // The two missed days had all six default quests materialized, with nothing completed.
    expect(finalized[1]).toMatchObject({ eligibleCount: 6, completedCount: 0, questExp: 0 })
    expect(await listOccurrencesByDate(t.database, d(TUESDAY))).toHaveLength(6)

    expect(home.today.dateKey).toBe(THURSDAY)
    expect(home.streaks).toEqual({ currentStreak: 0, bestStreak: 1, perfectStreak: 0, totalPerfectDays: 1, lastFinalizedDate: WEDNESDAY })
    expect(await readFinalizationCursor(t.database)).toBe(THURSDAY)
  })

  it('awards no EXP for missed quests', async () => {
    const t = await setup()
    await advanceTo(t, '2026-10-12')
    expect(await listXpTransactions(t.database)).toEqual([])
    expect(await listDailySummaries(t.database)).toHaveLength(7)
  })

  it('reconciles once for several days away, and a second pass finds nothing', async () => {
    const t = await setup()
    const first = await advanceTo(t, '2026-10-10')
    expect(first.finalized).toHaveLength(5)
    const second = await synchronizeAndLoadHome(t.context, 'resume')
    expect(second.finalized).toEqual([])
    expect(await listDailySummaries(t.database)).toHaveLength(5)
  })

  it('a catch-up of several days emits no event storm: only summaries, no EXP, no domain events', async () => {
    const t = await setup()
    await completeAll(t, MONDAY)
    const ledgerBefore = await listXpTransactions(t.database)
    const result = await advanceTo(t, '2026-10-15', 'startup')
    expect(Object.keys(result).sort()).toEqual(['finalized', 'home'])
    expect(result.finalized.length).toBeGreaterThan(5)
    expect(await listXpTransactions(t.database)).toEqual(ledgerBefore)
    expect(result.home.player.level).toBe(1)
  })

  it('only counts quests that were eligible on each missed date', async () => {
    const t = await setup()
    // Mondays only (1), created Monday so it is eligible that day.
    const created = await createQuest(t.context, buildFormValues({ title: 'Mondays', recurrence: 'weekdays', weekdays: [1] }))
    if (created.status !== 'created') throw new Error('create failed')
    const { finalized } = await advanceTo(t, WEDNESDAY)
    expect(finalized.map((summary) => summary.eligibleCount)).toEqual([7, 6]) // Monday 7, Tuesday 6
  })

  it('counts a one-time quest on its missed date only', async () => {
    const t = await setup()
    const created = await createQuest(t.context, buildFormValues({ title: 'Tuesday task', recurrence: 'one_time', questDate: TUESDAY }))
    if (created.status !== 'created') throw new Error('create failed')
    const { finalized } = await advanceTo(t, THURSDAY)
    expect(finalized.map((summary) => summary.eligibleCount)).toEqual([6, 7, 6])
    expect(finalized[1]?.occurrenceIds).toContain(`occ:${created.templateId}@${TUESDAY}`)
  })

  it('does not create occurrences for a quest archived before the days were missed, but keeps its frozen one', async () => {
    const t = await setup()
    const created = await createQuest(t.context, buildFormValues({ title: 'Short lived' }))
    if (created.status !== 'created') throw new Error('create failed')
    await archiveQuest(t.context, created.templateId)
    const { finalized } = await advanceTo(t, WEDNESDAY)
    // Monday keeps the frozen occurrence in its denominator; Tuesday has none.
    expect(finalized.map((summary) => summary.eligibleCount)).toEqual([7, 6])
  })

  it('days before the first occurrence are never finalized', async () => {
    const t = await setup(WEDNESDAY)
    expect(await listDailySummaries(t.database)).toEqual([])
    expect(await readFinalizationCursor(t.database)).toBe(WEDNESDAY)
  })
})

describe('streaks across days', () => {
  it('increments on ≥70 %, resets below it, keeps best and counts Perfect Days', async () => {
    const t = await setup()
    await completeAll(t, MONDAY) // perfect
    await advanceTo(t, TUESDAY)
    await completeAll(t, TUESDAY, ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) // 83 %: completed
    await advanceTo(t, WEDNESDAY)
    await completeAll(t, WEDNESDAY, ['fajr', 'dhuhr']) // 33 %: incomplete
    const { home } = await advanceTo(t, THURSDAY)

    expect((await listDailySummaries(t.database)).map((summary) => [summary.quality, summary.currentStreakAfter, summary.perfectStreakAfter])).toEqual([
      ['perfect', 1, 1],
      ['completed', 2, 0],
      ['incomplete', 0, 0],
    ])
    expect(home.streaks).toEqual({ currentStreak: 0, bestStreak: 2, perfectStreak: 0, totalPerfectDays: 1, lastFinalizedDate: WEDNESDAY })
  })

  it('the live day never changes the persisted streak', async () => {
    const t = await setup()
    await completeAll(t, MONDAY)
    const home = await loadHome(t.context)
    expect(home.today.progress.quality).toBe('perfect')
    expect(home.streaks.currentStreak).toBe(0)
    expect(await listDailySummaries(t.database)).toEqual([])
  })

  it('a day with no active quests is neutral for both streaks', async () => {
    const t = await setup()
    await completeAll(t, MONDAY) // streak 1, perfect streak 1
    for (const key of [...PRAYERS, 'sleep']) {
      await archiveQuest(t.context, key === 'sleep' ? 'tpl_seed_sleep' : `tpl_seed_prayer_${key}`)
    }
    // Monday's occurrences are frozen; Tuesday has nothing eligible.
    const { home, finalized } = await advanceTo(t, WEDNESDAY)
    expect(finalized.map((summary) => summary.quality)).toEqual(['perfect', 'no_active_quests'])
    expect(finalized[1]).toMatchObject({ eligibleCount: 0, currentStreakAfter: 1, perfectStreakAfter: 1, isPerfect: false })
    expect(home.streaks).toMatchObject({ currentStreak: 1, perfectStreak: 1, totalPerfectDays: 1 })
    expect(home.today.progress.quality).toBe('no_active_quests')
  })
})

describe('Sleep quest', () => {
  it('is a normal +20 EXP completion that does not finalize or move the day', async () => {
    const t = await setup()
    const result = await completeTodayQuest(t.context, sleepOn(MONDAY))
    if (result.status !== 'completed' || result.home === null) throw new Error('expected a completion')
    expect((await listXpTransactions(t.database))[0]).toMatchObject({ amount: 20 })
    expect(result.home.today.dateKey).toBe(MONDAY)
    expect(result.home.today.progress.completedCount).toBe(1)
    expect(result.home.streaks.currentStreak).toBe(0)
    expect(await listDailySummaries(t.database)).toEqual([])
    expect(await getDailySummary(t.database, d(MONDAY))).toBeNull()
  })

  it('a missed Sleep finalizes as an incomplete quest of that day', async () => {
    const t = await setup()
    await completeAll(t, MONDAY, [...PRAYERS]) // everything but Sleep: 5 of 6
    const { finalized } = await advanceTo(t, TUESDAY, 'midnight_tick')
    expect(finalized[0]).toMatchObject({ eligibleCount: 6, completedCount: 5, quality: 'completed' })
    expect(finalized[0]?.occurrenceIds).toContain(sleepOn(MONDAY))
    expect(await getCompletion(t.database, sleepOn(MONDAY))).toBeNull()
  })

  it('an archived Sleep invents no occurrence on later days', async () => {
    const t = await setup()
    await archiveQuest(t.context, 'tpl_seed_sleep')
    const { home, finalized } = await advanceTo(t, WEDNESDAY)
    expect(finalized.map((summary) => summary.eligibleCount)).toEqual([6, 5]) // Monday keeps its frozen Sleep
    expect(home.today.quests.map((quest) => quest.role)).not.toContain('sleep')
    expect(await listOccurrencesByDate(t.database, d(WEDNESDAY))).toHaveLength(5)
    // Restoring resumes it from the day it is restored, not retroactively.
    await restoreQuest(t.context, 'tpl_seed_sleep')
    expect((await loadHome(t.context)).today.quests.map((quest) => quest.role)).toContain('sleep')
    expect(await listOccurrencesByDate(t.database, d(TUESDAY))).toHaveLength(5)
  })
})

describe('daily report (live, provisional)', () => {
  it('summarizes the day in progress without touching persisted streaks', async () => {
    const t = await setup()
    await completeAll(t, MONDAY, ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'])
    const completion = await completeTodayQuest(t.context, sleepOn(MONDAY))
    if (completion.status !== 'completed' || completion.home === null) throw new Error('expected a completion')

    const report = buildDailyReport(completion.home)
    expect(report).toEqual({
      dateKey: MONDAY,
      status: 'provisional',
      eligibleCount: 6,
      completedCount: 6,
      displayPercent: 100,
      quality: 'perfect',
      expEarned: 70,
      currentStreak: 0,
      projectedStreak: 1,
      streakSecured: true,
      isPerfect: true,
    })
    expect(await listDailySummaries(t.database)).toEqual([])
  })

  it('shows a streak at risk below the Completed threshold and nothing secured', async () => {
    const t = await setup()
    await completeAll(t, MONDAY) // streak 1 after Monday finalizes
    const { home } = await advanceTo(t, TUESDAY)
    const report = buildDailyReport(home)
    expect(report).toMatchObject({ currentStreak: 1, projectedStreak: 0, streakSecured: false, quality: 'incomplete', expEarned: 0 })
  })

  it('reports an empty day as No Active Quests with an unchanged projection', async () => {
    const t = await setup()
    for (const key of [...PRAYERS, 'sleep']) await archiveQuest(t.context, key === 'sleep' ? 'tpl_seed_sleep' : `tpl_seed_prayer_${key}`)
    const { home } = await advanceTo(t, TUESDAY)
    expect(buildDailyReport(home)).toMatchObject({ quality: 'no_active_quests', displayPercent: null, projectedStreak: 0, streakSecured: false })
  })
})

describe('device clock moving backwards (OD-22)', () => {
  async function withHistory() {
    const t = await setup()
    await completeAll(t, MONDAY)
    await advanceTo(t, WEDNESDAY) // Monday and Tuesday finalized; Wednesday is active
    await completeAll(t, WEDNESDAY, ['fajr'])
    return t
  }

  it('is detected from the stored history and reported by the load', async () => {
    const t = await withHistory()
    t.clock.set(noonOn(MONDAY))
    const reading = readClock(t.context.clock)
    expect(await assessDay(t.context, reading)).toEqual({
      clock: { status: 'behind', localDate: MONDAY, recordedDate: WEDNESDAY },
      cursor: WEDNESDAY,
    })
    const { home, finalized } = await synchronizeAndLoadHome(t.context, 'resume')
    expect(finalized).toEqual([])
    expect(home.clock).toEqual({ status: 'behind', localDate: MONDAY, recordedDate: WEDNESDAY })
  })

  it('changes no history: no summary is added, deleted or rewritten, no streak regresses, nothing is regenerated', async () => {
    const t = await withHistory()
    const summaries = await listDailySummaries(t.database)
    const ledger = await listXpTransactions(t.database)
    const occurrences = [MONDAY, TUESDAY, WEDNESDAY, THURSDAY].map((date) => listOccurrencesByDate(t.database, d(date)))
    const occurrencesBefore = await Promise.all(occurrences)
    const streaksBefore = (await loadHome(t.context)).streaks

    for (const date of [MONDAY, TUESDAY, '2026-10-01']) {
      t.clock.set(noonOn(date))
      const { home } = await synchronizeAndLoadHome(t.context, 'resume')
      expect(home.streaks).toEqual(streaksBefore)
    }

    expect(await listDailySummaries(t.database)).toEqual(summaries)
    expect(await listXpTransactions(t.database)).toEqual(ledger)
    expect(await Promise.all([MONDAY, TUESDAY, WEDNESDAY, THURSDAY].map((date) => listOccurrencesByDate(t.database, d(date))))).toEqual(occurrencesBefore)
  })

  it('does not materialize anything for the device date while behind', async () => {
    const t = await withHistory()
    t.clock.set(noonOn('2026-10-02')) // before any recorded day
    const { home } = await synchronizeAndLoadHome(t.context, 'resume')
    expect(home.today.quests).toEqual([])
    expect(await listOccurrencesByDate(t.database, d('2026-10-02'))).toEqual([])
  })

  it('refuses completion, create, edit, archive and restore', async () => {
    const t = await withHistory()
    const ledger = await listXpTransactions(t.database)
    t.clock.set(noonOn(TUESDAY)) // a finalized date, behind the recorded Wednesday

    expect(await completeTodayQuest(t.context, prayer('dhuhr', TUESDAY))).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await completeTodayQuest(t.context, prayer('dhuhr', WEDNESDAY))).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await createQuest(t.context, buildFormValues({ title: 'New' }, TUESDAY))).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await updateQuest(t.context, 'tpl_seed_sleep', buildFormValues({ title: 'Renamed' }, TUESDAY))).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await archiveQuest(t.context, 'tpl_seed_sleep')).toMatchObject({ status: 'failed', reason: 'clock_behind' })
    expect(await restoreQuest(t.context, 'tpl_seed_sleep')).toMatchObject({ status: 'failed', reason: 'clock_behind' })

    expect(await listXpTransactions(t.database)).toEqual(ledger)
    expect(await listOccurrencesByDate(t.database, d(TUESDAY))).toHaveLength(6)
  })

  it('returns to normal use by itself once the clock reaches a non-conflicting date', async () => {
    const t = await withHistory()
    t.clock.set(noonOn(MONDAY))
    expect((await loadHome(t.context)).clock.status).toBe('behind')

    t.clock.set(noonOn(WEDNESDAY)) // the recorded active day again
    const { home, finalized } = await synchronizeAndLoadHome(t.context, 'resume')
    expect(home.clock).toEqual({ status: 'ok' })
    expect(finalized).toEqual([])
    expect(home.today.progress.completedCount).toBe(1) // Wednesday's progress is intact
    expect((await completeTodayQuest(t.context, prayer('dhuhr', WEDNESDAY))).status).toBe('completed')

    // …and the calendar simply carries on from there.
    const next = await advanceTo(t, THURSDAY)
    expect(next.finalized.map((summary) => summary.dateKey)).toEqual([WEDNESDAY])
  })

  it('treats a time zone change that moves the date earlier the same way, and one that moves it later as a normal rollover', async () => {
    const t = await withHistory()
    const summaries = await listDailySummaries(t.database)
    t.clock.set(noonOn(WEDNESDAY)) // 10:00 UTC on Wednesday
    const tz = { current: 'Pacific/Kiritimati' }
    const zoned = { ...t.context, clock: { now: () => t.clock.now(), timeZone: () => tz.current } }

    // UTC+14: it is already 00:00 on Thursday there, so Wednesday ends (finalized, as a normal rollover).
    const later = await synchronizeDay(zoned, 'resume')
    expect(later.reading.dateKey).toBe(THURSDAY)
    expect(later.finalized.map((summary) => summary.dateKey)).toEqual([WEDNESDAY])

    // UTC-11: 23:00 on Tuesday, behind the recorded Thursday. Nothing is rewritten.
    tz.current = 'Pacific/Pago_Pago'
    const earlier = await synchronizeDay(zoned, 'resume')
    expect(earlier.reading.dateKey).toBe(TUESDAY)
    expect(earlier.clock).toMatchObject({ status: 'behind', recordedDate: THURSDAY })
    expect(earlier.finalized).toEqual([])
    expect((await listDailySummaries(t.database)).slice(0, summaries.length)).toEqual(summaries) // finalized history untouched
    expect(await completeTodayQuest(zoned, prayer('isha', WEDNESDAY))).toMatchObject({ status: 'failed', reason: 'clock_behind' })
  })
})

describe('synchronization gate', () => {
  it('passes only when the device date equals the first unfinalized date', async () => {
    const t = await setup()
    const reading = readClock(t.context.clock)
    await expect(requireSynchronizedDay(t.context, reading)).resolves.toBeUndefined()
    t.clock.set(noonOn(TUESDAY))
    await expect(requireSynchronizedDay(t.context, readClock(t.context.clock))).rejects.toMatchObject({ code: 'day_not_synchronized' })
    await reconcileDays(t.context, readClock(t.context.clock), 'resume')
    await expect(requireSynchronizedDay(t.context, readClock(t.context.clock))).resolves.toBeUndefined()
  })

  it('lets quest management through with no history yet', async () => {
    const t = await createTestContext(MONDAY)
    opened.push(t.database)
    await createTemplate(t.database, buildTemplate({ id: 'tpl_manual' }))
    await expect(requireSynchronizedDay(t.context, readClock(t.context.clock))).resolves.toBeUndefined()
  })

  it('stops every management action on a stale screen until the day is reconciled', async () => {
    const t = await setup()
    t.clock.set(noonOn(TUESDAY))
    expect(await createQuest(t.context, buildFormValues({ title: 'Stale' }, TUESDAY))).toMatchObject({ status: 'failed', reason: 'day_not_synchronized' })
    expect(await archiveQuest(t.context, 'tpl_seed_sleep')).toMatchObject({ status: 'failed', reason: 'day_not_synchronized' })
    await synchronizeDay(t.context, 'resume')
    expect(await archiveQuest(t.context, 'tpl_seed_sleep')).toMatchObject({ status: 'archived' })
  })
})
