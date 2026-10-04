// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { sortTemplatesByOrder, type QuestTemplate } from '@/domain'
import { DATABASE_NAME, type StoreName } from '../config'
import { computeBackupChecksum } from '../backup/envelope'
import { exportBackup, serializeBackup } from '../backup/export'
import { importBackup, parseBackup } from '../backup/import'
import { completeQuestAtomically } from '../commands/completeQuest'
import { verifyDatabaseIntegrity } from '../integrity/verify'
import { assignPhase08SortOrder, PHASE_08_SEED_KEY_ORDER } from '../migrations/v4'
import { MIGRATIONS } from '../migrations'
import { ensureOccurrence } from '../repositories/occurrences'
import { listTemplates } from '../repositories/templates'
import { buildTemplate, buildUnplacedTemplate, d, DatabaseTracker, newFactory, noonOn, readRaw, withoutSortOrder, writeRaw, ZONE } from '../test-utils/helpers'
import { openDatabase, openVersionedDatabase } from './connection'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

const V3_MIGRATIONS = { 1: MIGRATIONS[1]!, 2: MIGRATIONS[2]!, 3: MIGRATIONS[3]! }
const openV3 = (factory: IDBFactory) =>
  openVersionedDatabase({ name: DATABASE_NAME, factory, version: 3, migrations: V3_MIGRATIONS })

const ALL_STORES: readonly StoreName[] = [
  'questTemplates',
  'questOccurrences',
  'questCompletions',
  'xpTransactions',
  'dailySummaries',
  'weeklyBoards',
  'weeklyRewardClaims',
]

type Legacy = Omit<QuestTemplate, 'sortOrder'>

/** A template as Phase 08 stored it: no `sortOrder`. */
const legacy = buildUnplacedTemplate

async function snapshot(database: Parameters<typeof readRaw>[0], stores: readonly StoreName[]) {
  const result: Record<string, unknown[]> = {}
  for (const store of stores) result[store] = await readRaw(database, store)
  return result
}

/** The Phase 08 display rule, restated from that phase's source so the migration is checked against it, not against itself. */
const PHASE_08_SEEDS = ['prayer.fajr', 'prayer.dhuhr', 'prayer.asr', 'prayer.maghrib', 'prayer.isha', 'sleep']
function phase08Compare(a: Legacy, b: Legacy): number {
  const position = (template: Legacy) => (template.seedKey === null ? undefined : PHASE_08_SEEDS.indexOf(template.seedKey))
  const rank = (template: Legacy) => {
    const found = position(template)
    return found === undefined || found === -1 ? undefined : found
  }
  const positionA = rank(a)
  const positionB = rank(b)
  if (positionA !== undefined && positionB !== undefined && positionA !== positionB) return positionA - positionB
  if (positionA !== undefined && positionB === undefined) return -1
  if (positionA === undefined && positionB !== undefined) return 1
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/** A realistic Phase 08 database: scrambled insertion order, ties, archived rows, an unknown seed key, and history. */
const FIXTURE: readonly Legacy[] = [
  legacy({ id: 'tpl_custom_b', title: 'Custom B', createdAt: 500 }),
  legacy({ id: 'tpl_seed_sleep', title: 'Sleep before 00:00', seedKey: 'sleep', role: 'sleep', difficulty: 'D', createdAt: 100 }),
  legacy({ id: 'tpl_custom_a', title: 'Custom A', createdAt: 500 }),
  legacy({ id: 'tpl_seed_prayer_isha', title: 'Isha', seedKey: 'prayer.isha', difficulty: 'E', createdAt: 100 }),
  legacy({ id: 'tpl_custom_archived', title: 'Old', createdAt: 300, status: 'archived', activeUntil: d('2026-10-03') }),
  legacy({ id: 'tpl_seed_prayer_fajr', title: 'Fajr', seedKey: 'prayer.fajr', difficulty: 'E', createdAt: 100 }),
  legacy({ id: 'tpl_future_seed', title: 'Future seed', seedKey: 'future.seed', createdAt: 50 }),
  legacy({ id: 'tpl_seed_prayer_dhuhr', title: 'Dhuhr', seedKey: 'prayer.dhuhr', difficulty: 'E', createdAt: 100, status: 'archived', activeUntil: d('2026-10-04') }),
  legacy({ id: 'tpl_custom_old', title: 'Custom old', createdAt: 200 }),
]

const EXPECTED_ORDER = [
  'tpl_seed_prayer_fajr',
  'tpl_seed_prayer_dhuhr', // archived, but it keeps its default-quest slot
  'tpl_seed_prayer_isha',
  'tpl_seed_sleep',
  'tpl_future_seed', // an unknown seed key is an ordinary quest: oldest first
  'tpl_custom_old',
  'tpl_custom_archived',
  'tpl_custom_a', // same creation time: by id
  'tpl_custom_b',
]

/** A real schema-3 database with the fixture templates, two days of history and a ledger. */
async function buildV3Database(factory: IDBFactory) {
  const v3 = await openV3(factory)
  for (const template of FIXTURE) await writeRaw(v3, 'questTemplates', template)
  const sleep = buildTemplate({ id: 'tpl_seed_sleep', title: 'Sleep before 00:00', seedKey: 'sleep', role: 'sleep', difficulty: 'D' })
  for (const date of ['2026-10-05', '2026-10-06']) {
    const made = await ensureOccurrence(v3, sleep, d(date), 2_000)
    if (!made.ok) throw new Error('fixture')
    const done = await completeQuestAtomically(v3, { occurrenceId: `occ:tpl_seed_sleep@${date}`, completedAt: noonOn(date), timeZone: ZONE })
    if (done.status !== 'completed') throw new Error(`fixture: ${done.status}`)
  }
  const before = await snapshot(v3, ALL_STORES)
  v3.close()
  return before
}

describe('the real v3 → v4 upgrade (Phase 09: manual quest order)', () => {
  it('gives every existing template a dense sortOrder that reproduces the Phase 08 visible order', async () => {
    const factory = newFactory()
    await buildV3Database(factory)

    const upgraded = tracker.track(await openDatabase({ factory }))

    expect(upgraded.version).toBe(4)
    const stored = (await readRaw(upgraded, 'questTemplates')) as QuestTemplate[]
    expect(stored.map((template) => template.sortOrder).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(sortTemplatesByOrder(stored).map((template) => template.id)).toEqual(EXPECTED_ORDER)
    // ... which is exactly what the Phase 08 rule produced.
    expect([...FIXTURE].sort(phase08Compare).map((template) => template.id)).toEqual(EXPECTED_ORDER)
    expect(sortTemplatesByOrder(await listTemplates(upgraded)).map((template) => template.id)).toEqual(EXPECTED_ORDER)
  })

  it('changes nothing but the new field: every other template field and every other store is exactly as it was', async () => {
    const factory = newFactory()
    const before = await buildV3Database(factory)

    const upgraded = tracker.track(await openDatabase({ factory }))
    const after = await snapshot(upgraded, ALL_STORES)

    const withoutOrder = (after.questTemplates as QuestTemplate[]).map((row) => withoutSortOrder(row))
    expect(withoutOrder).toEqual(before.questTemplates)
    for (const store of ALL_STORES.filter((name) => name !== 'questTemplates')) expect(after[store]).toEqual(before[store])
    expect(before.xpTransactions).toHaveLength(2)
    expect(before.questCompletions).toHaveLength(2)
  })

  it('the upgraded database passes the full integrity check, and its backup round-trips with the same order', async () => {
    const factory = newFactory()
    await buildV3Database(factory)
    const upgraded = tracker.track(await openDatabase({ factory }))

    expect(await verifyDatabaseIntegrity(upgraded)).toMatchObject({ ok: true, report: { counts: { questTemplates: 9, questOccurrences: 2 } } })
    const backup = await exportBackup(upgraded, { exportedAt: 9, exportedFromTimeZone: ZONE, appVersion: '0.1.0' })
    expect(backup.schemaVersion).toBe(4)

    const target = tracker.track(await openDatabase({ factory: newFactory() }))
    expect(await importBackup(target, serializeBackup(backup))).toMatchObject({ ok: true })
    expect(sortTemplatesByOrder(await listTemplates(target)).map((template) => template.id)).toEqual(EXPECTED_ORDER)
  })

  it('the backup upgrade assigns exactly the values the database upgrade assigns', async () => {
    const factory = newFactory()
    await buildV3Database(factory)
    const upgraded = tracker.track(await openDatabase({ factory }))
    const backup = await exportBackup(upgraded, { exportedAt: 9, exportedFromTimeZone: ZONE, appVersion: '0.1.0' })

    // The same data as a schema-3 backup: no order, an older schema version, a valid checksum.
    const envelope = JSON.parse(serializeBackup(backup)) as { schemaVersion: number; checksum: unknown; data: { questTemplates: Record<string, unknown>[] } }
    envelope.schemaVersion = 3
    for (const template of envelope.data.questTemplates) delete template.sortOrder
    envelope.checksum = { algorithm: 'SHA-256', value: await computeBackupChecksum(envelope) }

    const parsed = await parseBackup(JSON.stringify(envelope))
    if (!parsed.ok) throw new Error(`expected an upgrade: ${JSON.stringify(parsed.error)}`)
    expect(parsed.value.envelope.schemaVersion).toBe(4)
    expect(parsed.value.envelope.data.questTemplates).toEqual(backup.data.questTemplates)
  })

  it('upgrading an empty schema-3 database works (no templates, nothing to assign)', async () => {
    const factory = newFactory()
    ;(await openV3(factory)).close()
    const upgraded = tracker.track(await openDatabase({ factory }))
    expect(upgraded.version).toBe(4)
    expect(await readRaw(upgraded, 'questTemplates')).toEqual([])
  })

  it('a fresh install runs every migration and starts at version 4', async () => {
    const fresh = tracker.track(await openDatabase({ factory: newFactory() }))
    expect(fresh.version).toBe(4)
    expect(await readRaw(fresh, 'questTemplates')).toEqual([])
  })

  it('reopening an already upgraded database changes nothing', async () => {
    const factory = newFactory()
    await buildV3Database(factory)
    const first = await openDatabase({ factory })
    const after = await snapshot(first, ALL_STORES)
    first.close()
    const second = tracker.track(await openDatabase({ factory }))
    expect(await snapshot(second, ALL_STORES)).toEqual(after)
  })

  it('is all-or-nothing: if the upgrade fails after the backfill, the database stays at v3 with no order written', async () => {
    const factory = newFactory()
    const before = await buildV3Database(factory)
    const failing = {
      ...MIGRATIONS,
      4: (database: IDBDatabase, transaction: IDBTransaction) => {
        MIGRATIONS[4]!(database, transaction)
        transaction.objectStore('questTemplates').getAll().onsuccess = () => {
          throw new Error('boom after the backfill was queued')
        }
      },
    }
    await expect(openVersionedDatabase({ name: DATABASE_NAME, factory, version: 4, migrations: failing })).rejects.toMatchObject({
      code: 'database_open_failed',
    })

    const still = tracker.track(await openV3(factory))
    expect(still.version).toBe(3)
    expect(await snapshot(still, ALL_STORES)).toEqual(before)
  })
})

describe('the version-frozen Phase 08 assignment', () => {
  it('uses the six default quests in their Phase 08 order (a guard: this list must never change)', () => {
    expect(PHASE_08_SEED_KEY_ORDER).toEqual(PHASE_08_SEEDS)
  })

  it('assigns dense values 0…n-1 and returns new objects in the same positions without touching the input', () => {
    const input = [legacy({ id: 'tpl_b', createdAt: 2 }), legacy({ id: 'tpl_a', createdAt: 1 })]
    const frozen = JSON.stringify(input)
    const result = assignPhase08SortOrder(input) as QuestTemplate[]
    expect(result.map((template) => [template.id, template.sortOrder])).toEqual([
      ['tpl_b', 1],
      ['tpl_a', 0],
    ])
    expect(JSON.stringify(input)).toBe(frozen)
  })

  it('leaves anything that is not a plain object alone, to be rejected later by validation', () => {
    const junk = [null, 7, 'x', ['y'], legacy({ id: 'tpl_a' })]
    const result = assignPhase08SortOrder(junk)
    expect(result.slice(0, 4)).toEqual([null, 7, 'x', ['y']])
    expect(result[4]).toMatchObject({ id: 'tpl_a', sortOrder: 0 })
  })

  it('always agrees with the Phase 08 rule, whatever the data (400 pseudo-random datasets)', () => {
    let state = 20_260_509
    const random = (limit: number) => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
      return state % limit
    }
    for (let round = 0; round < 400; round += 1) {
      const count = random(16)
      const keys = [...PHASE_08_SEEDS, 'unknown.seed', null, null, null]
      const used = new Set<string>()
      const templates: Legacy[] = []
      for (let index = 0; index < count; index += 1) {
        const seedKey = keys[random(keys.length)] ?? null
        if (seedKey !== null) {
          if (used.has(seedKey)) continue
          used.add(seedKey)
        }
        templates.push(
          legacy({
            id: `tpl_${random(1000).toString().padStart(4, '0')}_${index}`,
            seedKey,
            createdAt: random(6), // few distinct values, so creation-time ties are common
            status: random(3) === 0 ? 'archived' : 'active',
          }),
        )
      }
      const assigned = assignPhase08SortOrder(templates) as QuestTemplate[]
      expect(assigned.map((template) => template.sortOrder).sort((a, b) => a - b)).toEqual(templates.map((_, index) => index))
      const byAssignedOrder = [...assigned].sort((a, b) => a.sortOrder - b.sortOrder).map((template) => template.id)
      expect(byAssignedOrder).toEqual([...templates].sort(phase08Compare).map((template) => template.id))
    }
  })
})
