// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import type { DailySummary, DateKey, QuestTemplate } from '@/domain'
import type { PersistenceDatabase } from '../database/connection'
import { verifyDatabaseIntegrity } from '../integrity/verify'
import { getDailySummary, listDailySummaries, readDailyChainTip, readFinalizationCursor } from '../repositories/dailySummaries'
import { ensureOccurrence, listOccurrencesByDate } from '../repositories/occurrences'
import { archiveTemplate, createTemplate, updateTemplate } from '../repositories/templates'
import { buildTemplate, DatabaseTracker, d, noonOn, readRaw, writeRaw, ZONE } from '../test-utils/helpers'
import { completeQuestAtomically } from './completeQuest'
import { finalizeDayAtomically, type FinalizeDayResult } from './finalizeDay'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

const FINALIZED_AT = 1_800_000_000_000

async function open(): Promise<PersistenceDatabase> {
  return tracker.open()
}

async function addTemplate(database: PersistenceDatabase, overrides: Partial<QuestTemplate>): Promise<QuestTemplate> {
  const template = buildTemplate(overrides)
  await createTemplate(database, template)
  return template
}

async function materialize(database: PersistenceDatabase, template: QuestTemplate, date: string): Promise<void> {
  const result = await ensureOccurrence(database, template, d(date), 2_000)
  if (!result.ok) throw new Error(`materialize: ${result.error.code}`)
}

async function complete(database: PersistenceDatabase, template: QuestTemplate, date: string): Promise<void> {
  const result = await completeQuestAtomically(database, {
    occurrenceId: `occ:${template.id}@${date}`,
    completedAt: noonOn(date),
    timeZone: ZONE,
  })
  if (result.status !== 'completed') throw new Error(`complete: ${result.status}`)
}

function finalize(
  database: PersistenceDatabase,
  date: string,
  today: string,
  finalizedLate = false,
): Promise<FinalizeDayResult> {
  return finalizeDayAtomically(database, { dateKey: d(date), today: d(today), finalizedAt: FINALIZED_AT, finalizedLate })
}

async function finalized(database: PersistenceDatabase, date: string, today: string): Promise<DailySummary> {
  const result = await finalize(database, date, today)
  if (result.status === 'rejected') throw new Error(`rejected: ${result.reason.code}`)
  return result.summary
}

describe('finalizeDayAtomically — classification', () => {
  async function dayWith(done: number, total: number): Promise<DailySummary> {
    const database = await open()
    const templates: QuestTemplate[] = []
    for (let n = 0; n < total; n += 1) templates.push(await addTemplate(database, { id: `tpl_${n}`, title: `Quest ${n}` }))
    for (const template of templates) await materialize(database, template, '2026-10-05')
    for (const template of templates.slice(0, done)) await complete(database, template, '2026-10-05')
    return finalized(database, '2026-10-05', '2026-10-06')
  }

  it.each([
    [0, 4, 'incomplete'],
    [2, 4, 'incomplete'],
    [3, 4, 'completed'], // 75 %
    [4, 4, 'perfect'],
  ])('%i of %i → %s (exact ratio)', async (done, total, expected) => {
    expect((await dayWith(done, total)).quality).toBe(expected)
  })

  it('classifies Strong (85 %+) and Completed (70 %+) by the exact ratio', async () => {
    expect((await dayWith(7, 10)).quality).toBe('completed')
    expect((await dayWith(17, 20)).quality).toBe('strong')
    expect((await dayWith(14, 20)).quality).toBe('completed')
    expect((await dayWith(13, 20)).quality).toBe('incomplete')
  })

  it('records a day with no eligible quests as No Active Quests (neutral)', async () => {
    const database = await open()
    // The earliest occurrence (the start of history) is 2026-10-05; the 06th has nothing eligible.
    const once = await addTemplate(database, {
      id: 'tpl_once',
      recurrence: { kind: 'one_time', date: d('2026-10-05') },
    })
    await materialize(database, once, '2026-10-05')
    await finalized(database, '2026-10-05', '2026-10-07')
    await archiveTemplate(database, 'tpl_once', { activeUntil: d('2026-10-05'), updatedAt: 3_000 })
    const empty = await finalized(database, '2026-10-06', '2026-10-07')
    expect(empty).toMatchObject({
      eligibleCount: 0,
      completedCount: 0,
      occurrenceIds: [],
      quality: 'no_active_quests',
      isPerfect: false,
      dailyStreakEffect: 'neutral',
      perfectStreakEffect: 'neutral',
    })
  })

  it('stores the counts, the exact occurrence ids, the quest EXP and the audit fields', async () => {
    const database = await open()
    const a = await addTemplate(database, { id: 'tpl_a', difficulty: 'B' }) // 55
    const b = await addTemplate(database, { id: 'tpl_b', difficulty: 'E' }) // 10
    await materialize(database, a, '2026-10-05')
    await materialize(database, b, '2026-10-05')
    await complete(database, a, '2026-10-05')
    const summary = await finalized(database, '2026-10-05', '2026-10-06')
    expect(summary).toMatchObject({
      dateKey: '2026-10-05',
      eligibleCount: 2,
      completedCount: 1,
      occurrenceIds: ['occ:tpl_a@2026-10-05', 'occ:tpl_b@2026-10-05'],
      questExp: 55,
      finalizedAt: FINALIZED_AT,
      finalizedLate: false,
    })
  })

  it('records finalizedLate as supplied', async () => {
    const database = await open()
    const t = await addTemplate(database, {})
    await materialize(database, t, '2026-10-05')
    const result = await finalize(database, '2026-10-05', '2026-10-09', true)
    expect(result).toMatchObject({ status: 'finalized', summary: { finalizedLate: true } })
  })
})

describe('finalizeDayAtomically — idempotency and zero XP', () => {
  it('finalizing the same date twice changes nothing', async () => {
    const database = await open()
    const t = await addTemplate(database, {})
    await materialize(database, t, '2026-10-05')
    await complete(database, t, '2026-10-05')

    const first = await finalize(database, '2026-10-05', '2026-10-06')
    const ledgerBefore = await readRaw(database, 'xpTransactions')
    const occurrencesBefore = await readRaw(database, 'questOccurrences')
    const second = await finalize(database, '2026-10-05', '2026-10-09', true)

    expect(first.status).toBe('finalized')
    expect(second.status).toBe('already_finalized')
    expect(second.status === 'already_finalized' && second.summary).toEqual(first.status === 'finalized' && first.summary)
    expect(await listDailySummaries(database)).toHaveLength(1)
    expect(await readRaw(database, 'xpTransactions')).toEqual(ledgerBefore)
    expect(await readRaw(database, 'questOccurrences')).toEqual(occurrencesBefore)
  })

  it('concurrent finalizations of one date produce exactly one summary', async () => {
    const database = await open()
    const t = await addTemplate(database, {})
    await materialize(database, t, '2026-10-05')
    const results = await Promise.all([
      finalize(database, '2026-10-05', '2026-10-06'),
      finalize(database, '2026-10-05', '2026-10-06'),
      finalize(database, '2026-10-05', '2026-10-06'),
    ])
    expect(results.filter((result) => result.status === 'finalized')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'already_finalized')).toHaveLength(2)
    expect(await listDailySummaries(database)).toHaveLength(1)
  })

  it('awards no EXP and writes no ledger row, even for a perfect day', async () => {
    const database = await open()
    const t = await addTemplate(database, {})
    await materialize(database, t, '2026-10-05')
    await complete(database, t, '2026-10-05')
    const before = await readRaw(database, 'xpTransactions')
    const summary = await finalized(database, '2026-10-05', '2026-10-06')
    expect(summary.quality).toBe('perfect')
    expect(await readRaw(database, 'xpTransactions')).toEqual(before)
    expect(before).toHaveLength(1)
  })

  it('never mutates an existing occurrence snapshot, even if its template changed since', async () => {
    const database = await open()
    const t = await addTemplate(database, { title: 'Original' })
    await materialize(database, t, '2026-10-05')
    await updateTemplate(database, { ...t, title: 'Renamed', difficulty: 'S', revision: 2, updatedAt: 5_000 })
    await finalized(database, '2026-10-05', '2026-10-06')
    const [occurrence] = await listOccurrencesByDate(database, d('2026-10-05'))
    expect(occurrence?.snapshot).toMatchObject({ title: 'Original', difficulty: 'C', expReward: 35 })
  })
})

describe('finalizeDayAtomically — materializing the day', () => {
  it('creates the occurrences of a day the app was never opened', async () => {
    const database = await open()
    const daily = await addTemplate(database, { id: 'tpl_daily' })
    await materialize(database, daily, '2026-10-05') // the history starts here
    await finalized(database, '2026-10-05', '2026-10-08')

    const result = await finalize(database, '2026-10-06', '2026-10-08')
    expect(result).toMatchObject({ status: 'finalized', materialized: 1, summary: { eligibleCount: 1, completedCount: 0, quality: 'incomplete' } })
    expect((await listOccurrencesByDate(database, d('2026-10-06'))).map((o) => o.id)).toEqual(['occ:tpl_daily@2026-10-06'])
  })

  it('does not create occurrences for a quest that is not scheduled that day', async () => {
    const database = await open()
    const daily = await addTemplate(database, { id: 'tpl_daily' })
    // 2026-10-05 is a Monday, 2026-10-06 a Tuesday.
    const mondays = await addTemplate(database, { id: 'tpl_mon', recurrence: { kind: 'weekdays', weekdays: [1] } })
    await materialize(database, daily, '2026-10-05')
    await materialize(database, mondays, '2026-10-05')
    await finalized(database, '2026-10-05', '2026-10-07')
    const tuesday = await finalized(database, '2026-10-06', '2026-10-07')
    expect(tuesday.occurrenceIds).toEqual(['occ:tpl_daily@2026-10-06'])
  })

  it('creates an interval quest only on its due days', async () => {
    const database = await open()
    const base = await addTemplate(database, { id: 'tpl_base' })
    const every3 = await addTemplate(database, {
      id: 'tpl_every3',
      activeFrom: d('2026-10-05'),
      recurrence: { kind: 'interval', everyNDays: 3, anchor: d('2026-10-05') },
    })
    await materialize(database, base, '2026-10-05')
    await materialize(database, every3, '2026-10-05')
    const days: DailySummary[] = []
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) days.push(await finalized(database, date, '2026-10-09'))
    expect(days.map((day) => day.eligibleCount)).toEqual([2, 1, 1, 2])
  })

  it('counts a one-time quest on its missed date and on no other day', async () => {
    const database = await open()
    const base = await addTemplate(database, { id: 'tpl_base' })
    const once = await addTemplate(database, { id: 'tpl_once', recurrence: { kind: 'one_time', date: d('2026-10-07') } })
    await materialize(database, base, '2026-10-05')
    const days: DailySummary[] = []
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) days.push(await finalized(database, date, '2026-10-09'))
    expect(days.map((day) => day.eligibleCount)).toEqual([1, 1, 2, 1])
    expect(days[2]?.occurrenceIds).toContain(`occ:${once.id}@2026-10-07`)
    expect(days[2]?.quality).toBe('incomplete')
  })

  it('does not generate for an archived template, but keeps its existing occurrence in the denominator', async () => {
    const database = await open()
    const keep = await addTemplate(database, { id: 'tpl_keep' })
    const gone = await addTemplate(database, { id: 'tpl_gone' })
    await materialize(database, keep, '2026-10-05')
    await materialize(database, gone, '2026-10-05')
    await archiveTemplate(database, 'tpl_gone', { activeUntil: d('2026-10-05'), updatedAt: 3_000 })

    const monday = await finalized(database, '2026-10-05', '2026-10-07')
    const tuesday = await finalized(database, '2026-10-06', '2026-10-07')
    expect(monday.occurrenceIds).toEqual(['occ:tpl_gone@2026-10-05', 'occ:tpl_keep@2026-10-05'])
    expect(tuesday.occurrenceIds).toEqual(['occ:tpl_keep@2026-10-06'])
  })

  it('does not create occurrences before a template starts', async () => {
    const database = await open()
    const base = await addTemplate(database, { id: 'tpl_base' })
    await addTemplate(database, { id: 'tpl_late', activeFrom: d('2026-10-07') })
    await materialize(database, base, '2026-10-05')
    const days: DailySummary[] = []
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07']) days.push(await finalized(database, date, '2026-10-08'))
    expect(days.map((day) => day.eligibleCount)).toEqual([1, 1, 2])
  })
})

describe('finalizeDayAtomically — chain and streaks', () => {
  async function history(days: ReadonlyArray<readonly [string, number]>): Promise<PersistenceDatabase> {
    // Two daily quests; `done` of them completed on each date.
    const database = await open()
    const a = await addTemplate(database, { id: 'tpl_a' })
    const b = await addTemplate(database, { id: 'tpl_b' })
    for (const [date, done] of days) {
      await materialize(database, a, date)
      await materialize(database, b, date)
      if (done >= 1) await complete(database, a, date)
      if (done >= 2) await complete(database, b, date)
    }
    return database
  }

  it('chains the streak values across consecutive days', async () => {
    const database = await history([
      ['2026-10-01', 2], // perfect
      ['2026-10-02', 2], // perfect
      ['2026-10-03', 1], // 50 % incomplete → resets
      ['2026-10-04', 2], // perfect
    ])
    for (const date of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']) await finalized(database, date, '2026-10-05')
    const chain = await listDailySummaries(database)
    expect(chain.map((day) => day.currentStreakAfter)).toEqual([1, 2, 0, 1])
    expect(chain.map((day) => day.bestStreakAfter)).toEqual([1, 2, 2, 2])
    expect(chain.map((day) => day.perfectStreakAfter)).toEqual([1, 2, 0, 1])
    expect(await readDailyChainTip(database)).toMatchObject({ totalPerfectDays: 3, latest: { dateKey: '2026-10-04' } })
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it('refuses a day that is not over', async () => {
    const database = await history([['2026-10-05', 2]])
    expect(await finalize(database, '2026-10-05', '2026-10-05')).toEqual({
      status: 'rejected',
      reason: { code: 'day_not_over', dateKey: '2026-10-05', today: '2026-10-05' },
    })
    expect(await finalize(database, '2026-10-06', '2026-10-05')).toMatchObject({ status: 'rejected', reason: { code: 'day_not_over' } })
    expect(await listDailySummaries(database)).toEqual([])
  })

  it('refuses to leave a gap in the chain', async () => {
    const database = await history([['2026-10-05', 2], ['2026-10-06', 2], ['2026-10-07', 2]])
    await finalized(database, '2026-10-05', '2026-10-08')
    expect(await finalize(database, '2026-10-07', '2026-10-08')).toMatchObject({
      status: 'rejected',
      reason: { code: 'chain_gap', expected: '2026-10-06' },
    })
    expect(await listDailySummaries(database)).toHaveLength(1)
  })

  it('refuses to start the chain after an earlier occurrence', async () => {
    const database = await history([['2026-10-05', 2], ['2026-10-06', 2]])
    expect(await finalize(database, '2026-10-06', '2026-10-08')).toMatchObject({
      status: 'rejected',
      reason: { code: 'chain_gap', expected: '2026-10-05' },
    })
  })
})

describe('finalized days are closed', () => {
  it('refuses a completion for a finalized date (clock moved back)', async () => {
    const database = await open()
    const t = await addTemplate(database, {})
    await materialize(database, t, '2026-10-05')
    await finalized(database, '2026-10-05', '2026-10-06')
    // The device clock reads the 5th again.
    const result = await completeQuestAtomically(database, {
      occurrenceId: 'occ:tpl_test@2026-10-05',
      completedAt: noonOn('2026-10-05'),
      timeZone: ZONE,
    })
    expect(result).toMatchObject({ status: 'rejected', reason: { code: 'day_already_finalized', dateKey: '2026-10-05' } })
    expect(await readRaw(database, 'questCompletions')).toEqual([])
    expect(await readRaw(database, 'xpTransactions')).toEqual([])
  })

  it('still reports an already-saved completion as a harmless duplicate after finalization', async () => {
    const database = await open()
    const t = await addTemplate(database, {})
    await materialize(database, t, '2026-10-05')
    await complete(database, t, '2026-10-05')
    await finalized(database, '2026-10-05', '2026-10-06')
    const again = await completeQuestAtomically(database, {
      occurrenceId: 'occ:tpl_test@2026-10-05',
      completedAt: noonOn('2026-10-05'),
      timeZone: ZONE,
    })
    expect(again.status).toBe('already_completed')
  })

  it('refuses to materialize an occurrence on a finalized date', async () => {
    const database = await open()
    const t = await addTemplate(database, { id: 'tpl_first' })
    await materialize(database, t, '2026-10-05')
    await finalized(database, '2026-10-05', '2026-10-06')
    const late = await addTemplate(database, { id: 'tpl_late' })
    await expect(ensureOccurrence(database, late, d('2026-10-05'), 9_000)).rejects.toMatchObject({ code: 'constraint_violation' })
    expect(await listOccurrencesByDate(database, d('2026-10-05'))).toHaveLength(1)
  })
})

describe('reconciliation cursor and chain tip', () => {
  it('is null with no history, the earliest occurrence date before any summary, then the day after the newest summary', async () => {
    const database = await open()
    expect(await readFinalizationCursor(database)).toBeNull()
    const t = await addTemplate(database, {})
    await materialize(database, t, '2026-10-05')
    await materialize(database, t, '2026-10-06')
    expect(await readFinalizationCursor(database)).toBe<DateKey>(d('2026-10-05'))
    await finalized(database, '2026-10-05', '2026-10-07')
    expect(await readFinalizationCursor(database)).toBe<DateKey>(d('2026-10-06'))
    expect(await getDailySummary(database, d('2026-10-05'))).not.toBeNull()
    expect(await getDailySummary(database, d('2026-10-06'))).toBeNull()
  })

  it('reports no chain tip before the first finalization', async () => {
    expect(await readDailyChainTip(await open())).toEqual({ latest: null, totalPerfectDays: 0 })
  })
})

describe('integrity of the summary chain', () => {
  async function healthy(): Promise<PersistenceDatabase> {
    const database = await open()
    const a = await addTemplate(database, { id: 'tpl_a' })
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07']) {
      await materialize(database, a, date)
      await complete(database, a, date)
      await finalized(database, date, '2026-10-08')
    }
    return database
  }

  async function issueCodes(database: PersistenceDatabase): Promise<string[]> {
    const result = await verifyDatabaseIntegrity(database)
    return result.ok ? [] : result.issues.map((issue) => issue.code)
  }

  it('passes for a healthy chain', async () => {
    expect(await verifyDatabaseIntegrity(await healthy())).toMatchObject({ ok: true, report: { counts: { dailySummaries: 3 } } })
  })

  it('finds a streak value that disagrees with the chain', async () => {
    const database = await healthy()
    const [, middle] = (await readRaw(database, 'dailySummaries')) as Array<Record<string, unknown>>
    await writeRaw(database, 'dailySummaries', { ...middle, currentStreakAfter: 9, bestStreakAfter: 9 })
    expect(await issueCodes(database)).toContain('streak_mismatch')
  })

  it('finds a gap in the finalized dates', async () => {
    const database = await healthy()
    const raw = (await readRaw(database, 'dailySummaries')) as Array<{ dateKey: string }>
    // Add a summary dated two days after the last one, leaving 2026-10-08 unfinalized.
    await writeRaw(database, 'dailySummaries', { ...raw[2], dateKey: '2026-10-09' })
    expect(await issueCodes(database)).toContain('not_contiguous')
  })

  it('finds a summary that disagrees with the occurrences or completions of its date', async () => {
    const database = await healthy()
    const [first] = (await readRaw(database, 'dailySummaries')) as Array<Record<string, unknown>>
    await writeRaw(database, 'dailySummaries', { ...first, questExp: 999 })
    expect(await issueCodes(database)).toContain('summary_exp_mismatch')
  })

  it('finds a quality that its counts do not imply', async () => {
    const database = await healthy()
    const [first] = (await readRaw(database, 'dailySummaries')) as Array<Record<string, unknown>>
    await writeRaw(database, 'dailySummaries', { ...first, quality: 'incomplete' })
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: false })
  })

  it('finds an occurrence before the first finalized date', async () => {
    const database = await healthy()
    const t = buildTemplate({ id: 'tpl_a' })
    await materialize(database, t, '2026-10-01')
    expect(await issueCodes(database)).toContain('occurrence_before_chain')
  })
})
