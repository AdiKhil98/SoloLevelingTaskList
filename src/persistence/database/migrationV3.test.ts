// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { asWeekKey, nextDate, type WeeklyBoardDefinition, type WeeklyGoal } from '@/domain'
import { DATABASE_NAME, type StoreName } from '../config'
import { MIGRATIONS } from '../migrations'
import { exportBackup, serializeBackup } from '../backup/export'
import { importBackup } from '../backup/import'
import { finalizeDayAtomically } from '../commands/finalizeDay'
import { completeQuestAtomically } from '../commands/completeQuest'
import { finalizeWeekAtomically } from '../commands/finalizeWeek'
import { saveWeeklyBoardAtomically } from '../commands/saveWeeklyBoard'
import { verifyDatabaseIntegrity } from '../integrity/verify'
import { readProgression } from '../ledger/ledgerTip'
import { ensureOccurrence } from '../repositories/occurrences'
import { createTemplate } from '../repositories/templates'
import { getWeeklyBoard, listWeeklyBoards } from '../repositories/weeklyBoards'
import { listXpTransactions } from '../repositories/xpLedger'
import { buildTemplate, d, DatabaseTracker, newFactory, noonOn, readRaw, ZONE } from '../test-utils/helpers'
import { openDatabase, openVersionedDatabase } from './connection'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

/** The schema as Phase 07 shipped it: exactly migrations 1–3, so this file keeps testing the v2 → v3 step alone. */
const openV3 = (factory: IDBFactory) =>
  openVersionedDatabase({
    name: DATABASE_NAME,
    factory,
    version: 3,
    migrations: { 1: MIGRATIONS[1]!, 2: MIGRATIONS[2]!, 3: MIGRATIONS[3]! },
  })

const V2_STORES: readonly StoreName[] = ['questTemplates', 'questOccurrences', 'questCompletions', 'xpTransactions', 'dailySummaries']
const WEEK = asWeekKey('2026-10-05')

const goal = (overrides: Partial<WeeklyGoal> & Pick<WeeklyGoal, 'id'>): WeeklyGoal => ({
  title: 'Goal',
  maxPoints: 5,
  target: 1,
  unit: null,
  tracking: { mode: 'manual' },
  manualProgress: 0,
  notes: null,
  ...overrides,
})

const definition: WeeklyBoardDefinition = {
  focus: 'Migrated focus',
  goals: [
    goal({ id: 'wg_gym', title: 'Two gym sessions', maxPoints: 6, target: 2, tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } }),
    goal({ id: 'wg_read', title: 'Finish the report', maxPoints: 4, target: 1, manualProgress: 1 }),
  ],
  rewardTiers: [
    { minScore: 6, text: 'Gaming' },
    { minScore: 7, text: 'Dessert' },
    { minScore: 8, text: 'Movie' },
    { minScore: 9, text: 'Purchase' },
    { minScore: 10, text: 'Evening off' },
  ],
}

async function snapshotV2(database: Parameters<typeof readRaw>[0]): Promise<Record<string, unknown[]>> {
  const snapshot: Record<string, unknown[]> = {}
  for (const store of V2_STORES) snapshot[store] = await readRaw(database, store)
  return snapshot
}

/** A real schema-2 database holding two days of quest history, one finalized day and a ledger. */
async function buildV2Database(factory: IDBFactory) {
  const v2 = await openVersionedDatabase({
    name: DATABASE_NAME,
    factory,
    version: 2,
    migrations: { 1: MIGRATIONS[1]!, 2: MIGRATIONS[2]! },
  })
  const template = buildTemplate({ id: 'tpl_gym', title: 'Gym' }) // difficulty C = 35 EXP
  await createTemplate(v2, template)
  for (const date of ['2026-10-05', '2026-10-06']) {
    const made = await ensureOccurrence(v2, template, d(date), 2_000)
    if (!made.ok) throw new Error('fixture')
    const done = await completeQuestAtomically(v2, { occurrenceId: `occ:tpl_gym@${date}`, completedAt: noonOn(date), timeZone: ZONE })
    if (done.status !== 'completed') throw new Error(`fixture: ${done.status}`)
  }
  const finalized = await finalizeDayAtomically(v2, { dateKey: d('2026-10-05'), today: d('2026-10-06'), finalizedAt: 5_000, finalizedLate: false })
  if (finalized.status !== 'finalized') throw new Error('fixture')
  const before = await snapshotV2(v2)
  v2.close()
  return before
}

describe('the real v2 → v3 upgrade (Phase 07; the database is now v4)', () => {
  it('adds the weekly stores and keeps every existing row exactly as it was', async () => {
    const factory = newFactory()
    const before = await buildV2Database(factory)
    expect(before.xpTransactions).toHaveLength(2)

    const upgraded = tracker.track(await openV3(factory))
    expect(upgraded.version).toBe(3)
    expect(await snapshotV2(upgraded)).toEqual(before)
    expect(await readRaw(upgraded, 'weeklyBoards')).toEqual([])
    expect(await readRaw(upgraded, 'weeklyRewardClaims')).toEqual([])
    expect(await readProgression(upgraded)).toMatchObject({ totalExp: 70, lastSeq: 2 })
  })

  it('the upgraded database passes the full integrity check and exports an empty weekly section', async () => {
    const factory = newFactory()
    await buildV2Database(factory)
    const upgraded = tracker.track(await openV3(factory))

    const check = await verifyDatabaseIntegrity(upgraded)
    expect(check).toMatchObject({
      ok: true,
      report: {
        counts: { questTemplates: 1, questOccurrences: 2, questCompletions: 2, xpTransactions: 2, dailySummaries: 1, weeklyBoards: 0, weeklyRewardClaims: 0 },
      },
    })
    const backup = await exportBackup(upgraded, { exportedAt: 9, exportedFromTimeZone: ZONE, appVersion: '0.1.0' })
    expect(backup.schemaVersion).toBe(4) // an export always carries the current backup schema
    expect(backup.data.weeklyBoards).toEqual([])
    expect(backup.data.weeklyRewardClaims).toEqual([])
  })

  it('reopening an already upgraded database changes nothing', async () => {
    const factory = newFactory()
    await buildV2Database(factory)
    const first = await openV3(factory)
    const after = await snapshotV2(first)
    first.close()
    const second = tracker.track(await openV3(factory))
    expect(second.version).toBe(3)
    expect(await snapshotV2(second)).toEqual(after)
  })

  it('the upgraded ledger continues its chain: the first weekly bonus gets the next seq and total', async () => {
    const factory = newFactory()
    await buildV2Database(factory)
    const database = tracker.track(await openV3(factory))

    // Mid-week on 2026-10-06: create the board for the current week.
    const saved = await saveWeeklyBoardAtomically(database, {
      weekKey: WEEK,
      definition,
      expectedRevision: null,
      today: d('2026-10-06'),
      now: noonOn('2026-10-06'),
    })
    expect(saved.status).toBe('created')

    // The daily lifecycle closes every day of the week, then the board is finalized.
    for (const date of ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) {
      const result = await finalizeDayAtomically(database, { dateKey: d(date), today: nextDate(d(date)), finalizedAt: 6_000, finalizedLate: true })
      expect(result.status).toBe('finalized')
    }
    const result = await finalizeWeekAtomically(database, { weekKey: WEEK, today: d('2026-10-12'), finalizedAt: noonOn('2026-10-14') })
    expect(result.status).toBe('finalized')

    // Two gym completions (≥ target 2) + the manual goal = 10/10 → 500 EXP.
    const ledger = await listXpTransactions(database)
    expect(ledger.map((row) => [row.seq, row.amount, row.totalExpAfter])).toEqual([
      [1, 35, 35],
      [2, 35, 70],
      [3, 500, 570],
    ])
    expect(ledger[2]).toMatchObject({
      id: 'xp:weekly_goal_crusher:2026-10-05',
      source: { type: 'weekly_goal_crusher', weekKey: '2026-10-05', score: 10 },
      category: null,
      createdAt: noonOn('2026-10-14'),
      effectiveDate: '2026-10-11',
      sourceWeekKey: '2026-10-05',
    })
    expect((await getWeeklyBoard(database, WEEK))?.finalization).toMatchObject({ score: 10, bonusExp: 500 })
    expect((await verifyDatabaseIntegrity(database)).ok).toBe(true)
  })

  it('a schema-2 database with weekly data restores through a v3 backup round trip', async () => {
    const factory = newFactory()
    await buildV2Database(factory)
    const source = tracker.track(await openV3(factory))
    await saveWeeklyBoardAtomically(source, { weekKey: WEEK, definition, expectedRevision: null, today: d('2026-10-06'), now: 1 })

    const backup = await exportBackup(source, { exportedAt: 9, exportedFromTimeZone: ZONE, appVersion: '0.1.0' })
    const target = tracker.track(await openDatabase({ factory: newFactory() }))
    const restored = await importBackup(target, serializeBackup(backup))
    expect(restored).toMatchObject({ ok: true, value: { counts: { weeklyBoards: 1 } } })
    expect(await listWeeklyBoards(target)).toEqual(await listWeeklyBoards(source))
  })
})
