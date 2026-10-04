// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { BACKUP_SCHEMA_VERSION, DATABASE_NAME, DATABASE_VERSION, PLAYER_PROFILE_ID, type StoreName } from '../config'
import { computeBackupChecksum } from '../backup/envelope'
import { exportBackup, serializeBackup } from '../backup/export'
import { importBackup, parseBackup } from '../backup/import'
import { completeAwakeningAtomically } from '../commands/completeAwakening'
import { completeQuestAtomically } from '../commands/completeQuest'
import { renamePlayerAtomically } from '../commands/renamePlayer'
import { verifyDatabaseIntegrity } from '../integrity/verify'
import { MIGRATIONS, type Migration, type MigrationMap } from '../migrations'
import { migrateToV5 } from '../migrations/v5'
import { ensureOccurrence } from '../repositories/occurrences'
import { getPlayerProfile } from '../repositories/playerProfile'
import { createTemplate } from '../repositories/templates'
import { buildTemplate, d, DatabaseTracker, newFactory, noonOn, readRaw, writeRaw, ZONE } from '../test-utils/helpers'
import { openDatabase, openVersionedDatabase } from './connection'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

const LEGACY_ROW = { id: PLAYER_PROFILE_ID, name: null, awakenedAt: null }
const META = { exportedAt: 9, exportedFromTimeZone: ZONE, appVersion: '0.1.0' }

/** The schema exactly as Phase 10 shipped it: migrations 1–4 only. */
function openAt(factory: IDBFactory, version: number, migrations: MigrationMap = MIGRATIONS) {
  return openVersionedDatabase({ name: DATABASE_NAME, factory, version, migrations })
}

const PRE_PHASE_11_STORES: readonly StoreName[] = [
  'questTemplates',
  'questOccurrences',
  'questCompletions',
  'xpTransactions',
  'dailySummaries',
  'weeklyBoards',
  'weeklyRewardClaims',
]

async function snapshot(database: Parameters<typeof readRaw>[0]) {
  const result: Record<string, unknown[]> = {}
  for (const store of PRE_PHASE_11_STORES) result[store] = await readRaw(database, store)
  return result
}

/** A real Phase 10 (schema v4) database: a quest, a day of history and a ledger row. */
async function buildV4Database(factory: IDBFactory) {
  const v4 = await openAt(factory, 4)
  const template = buildTemplate({ id: 'tpl_gym', title: 'Gym' })
  await createTemplate(v4, template)
  const made = await ensureOccurrence(v4, template, d('2026-10-05'), 2_000)
  if (!made.ok) throw new Error('fixture')
  const done = await completeQuestAtomically(v4, { occurrenceId: 'occ:tpl_gym@2026-10-05', completedAt: noonOn('2026-10-05'), timeZone: ZONE })
  if (done.status !== 'completed') throw new Error(`fixture: ${done.status}`)
  const before = await snapshot(v4)
  v4.close()
  return before
}

/** A migration map whose v5 step records the context it was given, then does its real work. */
function recordingMigrations(seen: Array<{ step: number; originalFrom: number }>): MigrationMap {
  const record = (step: number, migration: Migration): Migration => (database, transaction, context) => {
    seen.push({ step, originalFrom: context.originalFrom })
    migration(database, transaction, context)
  }
  return { 1: record(1, MIGRATIONS[1]!), 2: record(2, MIGRATIONS[2]!), 3: record(3, MIGRATIONS[3]!), 4: record(4, MIGRATIONS[4]!), 5: record(5, MIGRATIONS[5]!) }
}

describe('v5 migration: a FRESH database versus an EXISTING installation (the original upgrade version decides)', () => {
  it('a brand-new database (0 → 5 in ONE upgrade) creates the playerProfile store with NO row', async () => {
    const factory = newFactory()
    const fresh = tracker.track(await openDatabase({ factory }))

    expect(fresh.version).toBe(DATABASE_VERSION)
    expect(await readRaw(fresh, 'playerProfile')).toEqual([]) // no row: Awakening is required
    expect(await getPlayerProfile(fresh)).toEqual({ status: 'absent' })
  })

  it('an existing Phase 10 database (4 → 5) gets the legacy-completed row, and every other store is untouched', async () => {
    const factory = newFactory()
    const before = await buildV4Database(factory)
    expect(before.questTemplates).toHaveLength(1)
    expect(before.xpTransactions).toHaveLength(1)

    const upgraded = tracker.track(await openDatabase({ factory }))

    expect(upgraded.version).toBe(5)
    expect(await readRaw(upgraded, 'playerProfile')).toEqual([LEGACY_ROW])
    expect(await getPlayerProfile(upgraded)).toEqual({ status: 'valid', profile: LEGACY_ROW })
    expect(await snapshot(upgraded)).toEqual(before)
    expect(await verifyDatabaseIntegrity(upgraded)).toMatchObject({ ok: true, report: { counts: { playerProfile: 1, questTemplates: 1 } } })
  })

  it.each([1, 2, 3, 4])('an installation that existed at schema v%i is also a legacy-completed player after upgrading to v5', async (original) => {
    const factory = newFactory()
    ;(await openAt(factory, original)).close()
    const upgraded = tracker.track(await openDatabase({ factory }))
    expect(await readRaw(upgraded, 'playerProfile')).toEqual([LEGACY_ROW])
  })

  it('the rule is the VERSION, not the data: an existing but EMPTY v4 database is still an existing installation', async () => {
    const factory = newFactory()
    ;(await openAt(factory, 4)).close()
    const upgraded = tracker.track(await openDatabase({ factory }))
    expect(await readRaw(upgraded, 'questTemplates')).toEqual([])
    expect(await readRaw(upgraded, 'playerProfile')).toEqual([LEGACY_ROW])
  })

  it('every step of a fresh 0 → 5 upgrade — including v5, not just the step before it — is told originalFrom = 0', async () => {
    const seen: Array<{ step: number; originalFrom: number }> = []
    tracker.track(await openAt(newFactory(), 5, recordingMigrations(seen)))
    expect(seen).toEqual([
      { step: 1, originalFrom: 0 },
      { step: 2, originalFrom: 0 },
      { step: 3, originalFrom: 0 },
      { step: 4, originalFrom: 0 },
      { step: 5, originalFrom: 0 },
    ])
  })

  it('an existing v4 → 5 upgrade runs only v5, told originalFrom = 4; a v2 database is told 2 by v3, v4 and v5', async () => {
    const fromFour: Array<{ step: number; originalFrom: number }> = []
    const factoryFour = newFactory()
    ;(await openAt(factoryFour, 4)).close()
    tracker.track(await openAt(factoryFour, 5, recordingMigrations(fromFour)))
    expect(fromFour).toEqual([{ step: 5, originalFrom: 4 }])

    const fromTwo: Array<{ step: number; originalFrom: number }> = []
    const factoryTwo = newFactory()
    ;(await openAt(factoryTwo, 2)).close()
    tracker.track(await openAt(factoryTwo, 5, recordingMigrations(fromTwo)))
    expect(fromTwo).toEqual([
      { step: 3, originalFrom: 2 },
      { step: 4, originalFrom: 2 },
      { step: 5, originalFrom: 2 },
    ])
  })

  it('the v5 migration itself decides from originalFrom alone (called directly: 0 → no row, ≥ 1 → legacy row)', async () => {
    const run = async (originalFrom: number) => {
      const factory = newFactory()
      const database = tracker.track(
        await openVersionedDatabase({
          name: DATABASE_NAME,
          factory,
          version: 5,
          migrations: { ...MIGRATIONS, 5: (db, transaction) => migrateToV5(db, transaction, { originalFrom }) },
        }),
      )
      return readRaw(database, 'playerProfile')
    }
    expect(await run(0)).toEqual([])
    expect(await run(1)).toEqual([LEGACY_ROW])
    expect(await run(4)).toEqual([LEGACY_ROW])
  })

  it('reopening an upgraded database does not run the migration again and never rewrites the row', async () => {
    const factory = newFactory()
    await buildV4Database(factory)
    const first = await openDatabase({ factory })
    await renamePlayerAtomically(first, { name: 'Ada' })
    first.close()

    const second = tracker.track(await openDatabase({ factory }))
    expect(await readRaw(second, 'playerProfile')).toEqual([{ id: 'player', name: 'Ada', awakenedAt: null }])
  })

  it('a fresh database that awakened stays awakened across reopen (and is not a legacy row)', async () => {
    const factory = newFactory()
    const first = await openDatabase({ factory })
    await completeAwakeningAtomically(first, { name: 'Ada', awakenedAt: 1_234 })
    first.close()
    const second = tracker.track(await openDatabase({ factory }))
    expect(await readRaw(second, 'playerProfile')).toEqual([{ id: 'player', name: 'Ada', awakenedAt: 1_234 }])
  })

  it('is all-or-nothing: if the v5 upgrade fails, the database stays at v4 with no profile store and no data changed', async () => {
    const factory = newFactory()
    const before = await buildV4Database(factory)
    const failing: MigrationMap = {
      ...MIGRATIONS,
      5: (database, transaction, context) => {
        migrateToV5(database, transaction, context)
        throw new Error('boom after the profile row was queued')
      },
    }
    await expect(openAt(factory, 5, failing)).rejects.toMatchObject({ code: 'database_open_failed' })

    const still = tracker.track(await openAt(factory, 4))
    expect(still.version).toBe(4)
    expect(await snapshot(still)).toEqual(before)
    await expect(readRaw(still, 'playerProfile')).rejects.toBeDefined() // the store does not exist
  })

  it('a legacy row says "legacy player", never "onboarding required": awakenedAt null is valid and the row exists', async () => {
    const factory = newFactory()
    await buildV4Database(factory)
    const upgraded = tracker.track(await openDatabase({ factory }))
    const reading = await getPlayerProfile(upgraded)
    expect(reading.status).toBe('valid')
    if (reading.status === 'valid') expect(reading.profile.awakenedAt).toBeNull()
  })
})

describe('backup: the player profile round-trips, and older backups restore as legacy-completed players', () => {
  type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  async function tampered(text: string, edit: (envelope: Json) => void): Promise<string> {
    const envelope = JSON.parse(text) as Json
    edit(envelope)
    envelope.checksum = { algorithm: 'SHA-256', value: await computeBackupChecksum(envelope) }
    return JSON.stringify(envelope)
  }
  async function exportText(database: Parameters<typeof exportBackup>[0]): Promise<string> {
    return serializeBackup(await exportBackup(database, META))
  }

  it('exports the current backup schema with the (absent) profile of a database that has not awakened', async () => {
    const database = tracker.track(await openDatabase({ factory: newFactory() }))
    const backup = await exportBackup(database, META)
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    expect(backup.data.playerProfile).toEqual([])
  })

  it('round-trips an awakened player: name, awakenedAt and an identical re-export', async () => {
    const source = tracker.track(await openDatabase({ factory: newFactory() }))
    await completeAwakeningAtomically(source, { name: 'אדי', awakenedAt: 5_000 })
    const text = await exportText(source)

    const target = tracker.track(await openDatabase({ factory: newFactory() }))
    expect(await importBackup(target, text)).toMatchObject({ ok: true, value: { counts: { playerProfile: 1 } } })
    expect(await getPlayerProfile(target)).toEqual({ status: 'valid', profile: { id: 'player', name: 'אדי', awakenedAt: 5_000 } })
    expect(await exportText(target)).toBe(text)
  })

  it('a backup made before Awakening finished restores as "not awakened": the restore removes any existing profile row', async () => {
    const empty = await exportText(tracker.track(await openDatabase({ factory: newFactory() })))
    const target = tracker.track(await openDatabase({ factory: newFactory() }))
    await completeAwakeningAtomically(target, { name: 'Zed', awakenedAt: 1 })

    await importBackup(target, empty)
    expect(await getPlayerProfile(target)).toEqual({ status: 'absent' })
  })

  it.each([1, 2, 3, 4])('a schema-%i backup restores as a LEGACY-completed player (the row is added by the upgrade)', async (schemaVersion) => {
    const source = tracker.track(await openDatabase({ factory: newFactory() }))
    await completeAwakeningAtomically(source, { name: 'Ada', awakenedAt: 5_000 })
    const text = await tampered(await exportText(source), (envelope) => {
      envelope.schemaVersion = schemaVersion
      delete envelope.data.playerProfile
      if (schemaVersion < 4) for (const template of envelope.data.questTemplates) delete template.sortOrder
      if (schemaVersion < 3) {
        delete envelope.data.weeklyBoards
        delete envelope.data.weeklyRewardClaims
      }
      if (schemaVersion < 2) delete envelope.data.dailySummaries
    })

    const parsed = await parseBackup(text)
    if (!parsed.ok) throw new Error(`expected an upgrade: ${JSON.stringify(parsed.error)}`)
    expect(parsed.value.envelope.schemaVersion).toBe(5)
    expect(parsed.value.envelope.data.playerProfile).toEqual([LEGACY_ROW])

    const target = tracker.track(await openDatabase({ factory: newFactory() }))
    expect(await importBackup(target, text)).toMatchObject({ ok: true })
    expect(await getPlayerProfile(target)).toEqual({ status: 'valid', profile: LEGACY_ROW })
  })

  it('rejects a schema-5 backup that lacks the profile collection (it is required from schema 5)', async () => {
    const text = await tampered(await exportText(tracker.track(await openDatabase({ factory: newFactory() }))), (envelope) => {
      delete envelope.data.playerProfile
    })
    expect(await parseBackup(text)).toMatchObject({ ok: false, error: { code: 'invalid_backup' } })
  })

  it.each([
    ['two profile rows', (rows: Array<Record<string, unknown>>) => rows.push({ id: 'player', name: 'Bob', awakenedAt: 1 }), 'duplicate_id'],
    ['an unnormalized name', (rows: Array<Record<string, unknown>>) => { rows[0]!.name = ' Ada ' }, 'invalid_player_name'],
    ['a control character in the name', (rows: Array<Record<string, unknown>>) => { rows[0]!.name = 'Ad\u0007a' }, 'invalid_player_name'],
    ['a name that is too long', (rows: Array<Record<string, unknown>>) => { rows[0]!.name = 'a'.repeat(21) }, 'invalid_player_name'],
    ['an empty-string name (blank must be null)', (rows: Array<Record<string, unknown>>) => { rows[0]!.name = '' }, 'invalid_player_name'],
    ['a wrong id', (rows: Array<Record<string, unknown>>) => { rows[0]!.id = 'someone' }, 'invalid_value'],
    ['an unexpected field', (rows: Array<Record<string, unknown>>) => { rows[0]!.extra = true }, 'unexpected_field'],
    ['a fractional awakenedAt', (rows: Array<Record<string, unknown>>) => { rows[0]!.awakenedAt = 1.5 }, 'not_a_safe_integer'],
    ['a missing awakenedAt', (rows: Array<Record<string, unknown>>) => { delete rows[0]!.awakenedAt }, 'not_a_safe_integer'],
  ])('rejects a backup with %s', async (_label, damage, code) => {
    const source = tracker.track(await openDatabase({ factory: newFactory() }))
    await completeAwakeningAtomically(source, { name: 'Ada', awakenedAt: 5_000 })
    const text = await tampered(await exportText(source), (envelope) => damage(envelope.data.playerProfile))
    const parsed = await parseBackup(text)
    if (parsed.ok) throw new Error('expected a rejection')
    expect(parsed.error.issues.map((issue) => issue.code)).toContain(code)
  })

  it('the export refuses a database whose profile row is damaged (strict, like every record) and a rename repairs it', async () => {
    const database = tracker.track(await openDatabase({ factory: newFactory() }))
    await writeRaw(database, 'playerProfile', { id: 'player', name: ' padded ', awakenedAt: 7 })
    await expect(exportBackup(database, META)).rejects.toMatchObject({ code: 'record_validation_failed' })

    await renamePlayerAtomically(database, { name: 'Ada' })
    expect((await exportBackup(database, META)).data.playerProfile).toEqual([{ id: 'player', name: 'Ada', awakenedAt: 7 }])
  })
})
