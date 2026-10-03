// @vitest-environment node
import { IDBObjectStore } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BACKUP_FORMAT } from '../config'
import { PersistenceError } from '../errors'
import { verifyDatabaseIntegrity } from '../integrity/verify'
import type { PersistenceDatabase } from '../database/connection'
import { createTemplate } from '../repositories/templates'
import { ensureOccurrence } from '../repositories/occurrences'
import { completeQuestAtomically } from '../commands/completeQuest'
import { DatabaseTracker, buildTemplate, d, deleteRaw, noonOn, readRaw, snapshotAll, writeRaw, ZONE } from '../test-utils/helpers'
import { populate, POPULATED_TOTAL_EXP } from '../test-utils/populate'
import { computeBackupChecksum } from './envelope'
import { exportBackup, serializeBackup, type ExportBackupOptions } from './export'
import { importBackup, parseBackup } from './import'

const tracker = new DatabaseTracker()
afterEach(() => {
  vi.restoreAllMocks()
  tracker.closeAll()
})

const META: ExportBackupOptions = { exportedAt: 1_760_000_000_000, exportedFromTimeZone: ZONE, appVersion: '0.1.0' }

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

async function exportText(database: PersistenceDatabase, meta = META): Promise<string> {
  return serializeBackup(await exportBackup(database, meta))
}

/** Parses a backup, applies `mutate`, and re-signs it so only the content is invalid. */
async function tampered(text: string, mutate: (envelope: Json) => void, { resign = true } = {}): Promise<string> {
  const envelope = JSON.parse(text) as Json
  mutate(envelope)
  if (resign) envelope.checksum = { algorithm: 'SHA-256', value: await computeBackupChecksum(envelope) }
  return JSON.stringify(envelope)
}

async function populated(): Promise<PersistenceDatabase> {
  const database = await tracker.open()
  await populate(database)
  return database
}

async function rejection(text: string) {
  const result = await parseBackup(text)
  if (result.ok) throw new Error('expected the backup to be rejected')
  return result.error
}

describe('exportBackup', () => {
  it('exports an empty database as a valid, empty envelope', async () => {
    const database = await tracker.open()
    const envelope = await exportBackup(database, META)
    expect(envelope).toMatchObject({
      format: BACKUP_FORMAT,
      formatVersion: 1,
      schemaVersion: 1,
      appVersion: '0.1.0',
      exportedAt: META.exportedAt,
      exportedFromTimeZone: ZONE,
      data: { questTemplates: [], questOccurrences: [], questCompletions: [], xpTransactions: [] },
    })
    expect(envelope.checksum.algorithm).toBe('SHA-256')
    expect(envelope.checksum.value).toMatch(/^[0-9a-f]{64}$/)
    const reparsed = await parseBackup(serializeBackup(envelope))
    expect(reparsed.ok).toBe(true)
  })

  it('exports every durable record and nothing derived', async () => {
    const database = await populated()
    const envelope = await exportBackup(database, META)
    expect(Object.keys(envelope.data).sort()).toEqual(['questCompletions', 'questOccurrences', 'questTemplates', 'xpTransactions'])
    expect(envelope.data.questTemplates).toHaveLength(4)
    expect(envelope.data.questOccurrences).toHaveLength(7)
    expect(envelope.data.questCompletions).toHaveLength(4)
    expect(envelope.data.xpTransactions.map((row) => row.seq)).toEqual([1, 2, 3, 4])
    expect(envelope.data.xpTransactions.at(-1)?.totalExpAfter).toBe(POPULATED_TOTAL_EXP)

    // The file carries no level, rank or total: those are rebuilt from the ledger.
    const text = serializeBackup(envelope)
    expect(text).not.toMatch(/"(level|rank|totalExp|currentLevel)"/)
  })

  it('produces identical text for identical state and metadata', async () => {
    const database = await populated()
    expect(await exportText(database)).toBe(await exportText(database))
  })

  it('changes only the intentionally variable metadata between exports', async () => {
    const database = await populated()
    const first = JSON.parse(await exportText(database)) as Json
    const second = JSON.parse(await exportText(database, { ...META, exportedAt: META.exportedAt + 5_000, appVersion: '0.2.0' })) as Json
    expect(second.data).toEqual(first.data)
    expect(second.checksum.value).not.toBe(first.checksum.value)
    expect({ ...second, exportedAt: 0, appVersion: '', checksum: null }).toEqual({ ...first, exportedAt: 0, appVersion: '', checksum: null })
  })

  it('writes keys in canonical (sorted) order', async () => {
    const text = await exportText(await populated())
    const topLevelKeys = Object.keys(JSON.parse(text) as Json)
    expect(topLevelKeys).toEqual([...topLevelKeys].sort())
  })

  it('validates its own options', async () => {
    const database = await tracker.open()
    await expect(exportBackup(database, { ...META, exportedAt: -1 })).rejects.toMatchObject({ code: 'record_validation_failed' })
    await expect(exportBackup(database, { ...META, exportedFromTimeZone: ' ' })).rejects.toMatchObject({ code: 'record_validation_failed' })
    await expect(exportBackup(database, { ...META, appVersion: '' })).rejects.toMatchObject({ code: 'record_validation_failed' })
  })

  it('refuses to export a database that fails its integrity checks', async () => {
    const database = await populated()
    const [row] = (await readRaw(database, 'xpTransactions')) as Array<Record<string, unknown>>
    await writeRaw(database, 'xpTransactions', { ...row, totalExpAfter: 12_345 })
    const attempt = exportBackup(database, META)
    await expect(attempt).rejects.toBeInstanceOf(PersistenceError)
    await expect(attempt).rejects.toMatchObject({ code: 'ledger_integrity_failed' })
    expect(((await attempt.catch((e: PersistenceError) => e)) as PersistenceError).issues.length).toBeGreaterThan(0)
  })
})

describe('importBackup — round trip and replacement', () => {
  it('restores exactly the exported state into an empty database', async () => {
    const source = await populated()
    const text = await exportText(source)
    const target = await tracker.open()

    const result = await importBackup(target, text)
    expect(result).toMatchObject({
      ok: true,
      value: {
        counts: { questTemplates: 4, questOccurrences: 7, questCompletions: 4, xpTransactions: 4 },
        progression: { totalExp: POPULATED_TOTAL_EXP, lastSeq: 4 },
      },
    })
    expect(await snapshotAll(target)).toEqual(await snapshotAll(source))
    expect(await verifyDatabaseIntegrity(target)).toMatchObject({ ok: true })
    // Equivalent state exports identically.
    expect(await exportText(target)).toBe(text)
  })

  it('derives level and rank from the restored ledger, not from the file', async () => {
    const source = await populated()
    const target = await tracker.open()
    const result = await importBackup(target, await exportText(source))
    if (!result.ok) throw new Error('expected success')
    expect(result.value.progression.levelState).toMatchObject({ level: 3, rank: 'E', expIntoLevel: 50 })
  })

  it('is a full replacement, not a merge', async () => {
    const source = await populated()
    const text = await exportText(source)

    const target = await tracker.open()
    const other = buildTemplate({ id: 'tpl_other', title: 'Only in the target', difficulty: 'S' })
    await createTemplate(target, other)
    await ensureOccurrence(target, other, d('2026-09-01'), 2_000)
    await completeQuestAtomically(target, { occurrenceId: 'occ:tpl_other@2026-09-01', completedAt: noonOn('2026-09-01'), timeZone: ZONE })
    expect(await readRaw(target, 'xpTransactions')).toHaveLength(1)

    await importBackup(target, text)
    expect(await snapshotAll(target)).toEqual(await snapshotAll(source))
    const templateIds = ((await readRaw(target, 'questTemplates')) as Array<{ id: string }>).map((t) => t.id)
    expect(templateIds).not.toContain('tpl_other')
    expect(await readRaw(target, 'xpTransactions')).toHaveLength(4)
  })

  it('importing the same backup twice yields the same state, not duplicates', async () => {
    const source = await populated()
    const text = await exportText(source)
    const target = await tracker.open()
    await importBackup(target, text)
    const once = await snapshotAll(target)
    await importBackup(target, text)
    expect(await snapshotAll(target)).toEqual(once)
    expect(await readRaw(target, 'xpTransactions')).toHaveLength(4)
  })

  it('restores an empty backup over a populated database', async () => {
    const empty = await exportText(await tracker.open())
    const target = await populated()
    await importBackup(target, empty)
    expect(await snapshotAll(target)).toEqual({ questTemplates: [], questOccurrences: [], questCompletions: [], xpTransactions: [] })
  })

  it('keeps the restored database fully usable: completing continues the ledger', async () => {
    const source = await populated()
    const target = await tracker.open()
    await importBackup(target, await exportText(source))
    const fresh = buildTemplate({ id: 'tpl_new', difficulty: 'E' })
    await createTemplate(target, fresh)
    await ensureOccurrence(target, fresh, d('2026-10-04'), 2_000)
    const done = await completeQuestAtomically(target, { occurrenceId: 'occ:tpl_new@2026-10-04', completedAt: noonOn('2026-10-04'), timeZone: ZONE })
    if (done.status !== 'completed') throw new Error('expected completed')
    expect(done.xpTransaction.seq).toBe(5)
    expect(done.xpTransaction.totalExpAfter).toBe(POPULATED_TOTAL_EXP + 10)
  })

  it('accepts historical records whose template no longer exists (templateId is informational)', async () => {
    const source = await populated()
    const text = await tampered(await exportText(source), (envelope) => {
      envelope.data.questTemplates = envelope.data.questTemplates.filter((t: Json) => t.id !== 'tpl_gym')
    })
    const target = await tracker.open()
    const result = await importBackup(target, text)
    expect(result.ok).toBe(true)
    expect(await readRaw(target, 'questTemplates')).toHaveLength(3)
    expect(await readRaw(target, 'questCompletions')).toHaveLength(4)
    expect(await verifyDatabaseIntegrity(target)).toMatchObject({ ok: true })
  })
})

describe('importBackup — rejection', () => {
  it('rejects empty, non-JSON and non-object input', async () => {
    expect(await rejection('')).toMatchObject({ code: 'invalid_backup' })
    expect(await rejection('{ not json')).toMatchObject({ code: 'invalid_backup', issues: [{ code: 'not_json' }] })
    expect(await rejection('[]')).toMatchObject({ code: 'invalid_backup' })
    expect(await rejection('42')).toMatchObject({ code: 'invalid_backup' })
    expect(await rejection('null')).toMatchObject({ code: 'invalid_backup' })
  })

  it('rejects oversized input without parsing it', async () => {
    expect(await rejection('x'.repeat(33 * 1024 * 1024))).toMatchObject({ code: 'invalid_backup', issues: [{ code: 'too_large' }] })
  })

  it('rejects a wrong or missing format marker', async () => {
    const text = await exportText(await populated())
    expect(await rejection(await tampered(text, (e) => { e.format = 'something-else' }))).toMatchObject({ code: 'invalid_backup', issues: [{ code: 'unknown_format' }] })
    expect(await rejection(await tampered(text, (e) => { delete e.format }))).toMatchObject({ code: 'invalid_backup' })
  })

  it('rejects unsupported versions with a dedicated code', async () => {
    const text = await exportText(await populated())
    expect(await rejection(await tampered(text, (e) => { e.schemaVersion = 2 }))).toMatchObject({ code: 'unsupported_backup_version', issues: [{ code: 'newer_schema' }] })
    expect(await rejection(await tampered(text, (e) => { e.formatVersion = 2 }))).toMatchObject({ code: 'unsupported_backup_version', issues: [{ code: 'newer_format' }] })
    expect(await rejection(await tampered(text, (e) => { e.schemaVersion = 0 }))).toMatchObject({ code: 'invalid_backup' })
    expect(await rejection(await tampered(text, (e) => { e.schemaVersion = '1' }))).toMatchObject({ code: 'invalid_backup' })
  })

  it('rejects a structurally wrong envelope', async () => {
    const text = await exportText(await populated())
    expect(await rejection(await tampered(text, (e) => { e.surprise = true }))).toMatchObject({ code: 'invalid_backup', issues: [{ code: 'unexpected_field' }] })
    expect(await rejection(await tampered(text, (e) => { delete e.data }))).toMatchObject({ code: 'invalid_backup' })
    expect(await rejection(await tampered(text, (e) => { e.exportedAt = -5 }))).toMatchObject({ code: 'invalid_backup' })
    expect(await rejection(await tampered(text, (e) => { e.checksum = { algorithm: 'MD5', value: 'x' } }, { resign: false }))).toMatchObject({ code: 'invalid_backup' })
  })

  it('does not let a __proto__ key through', async () => {
    const text = (await exportText(await populated())).replace('{\n', '{\n  "__proto__": {},\n')
    expect(await rejection(text)).toMatchObject({ code: 'invalid_backup', issues: [{ code: 'unexpected_field' }] })
  })

  it('detects corruption with the checksum', async () => {
    const text = await exportText(await populated())
    const damaged = await tampered(text, (e) => { e.data.questTemplates[0].title = 'Quietly edited' }, { resign: false })
    expect(await rejection(damaged)).toMatchObject({ code: 'backup_checksum_mismatch' })
    // A truncated file is just invalid JSON.
    expect(await rejection(text.slice(0, text.length - 40))).toMatchObject({ code: 'invalid_backup' })
  })

  it('treats the checksum as corruption detection only: it excludes itself and covers the metadata', async () => {
    const text = await exportText(await populated())
    const edited = await tampered(text, (e) => { e.appVersion = '9.9.9' }, { resign: false })
    expect(await rejection(edited)).toMatchObject({ code: 'backup_checksum_mismatch' })
  })

  describe('invalid records (checksum re-signed so the content check is what fails)', () => {
    const cases: Array<[string, (envelope: Json) => void, string]> = [
      ['a malformed DateKey', (e) => { e.data.questTemplates[0].activeFrom = '2026-02-30' }, 'invalid_date_key'],
      ['a malformed recurrence', (e) => { e.data.questTemplates[0].recurrence = { kind: 'weekdays', weekdays: [] } }, 'recurrence_weekdays_empty'],
      ['a malformed occurrence date', (e) => { e.data.questOccurrences[0].dateKey = 'garbage' }, 'invalid_date_key'],
      ['an occurrence id that is not deterministic', (e) => { e.data.questOccurrences[0].id = 'occ:nope' }, 'occurrence_id_mismatch'],
      ['duplicate template ids', (e) => { e.data.questTemplates.push({ ...e.data.questTemplates[0] }) }, 'duplicate_id'],
      ['duplicate occurrence ids', (e) => { e.data.questOccurrences.push({ ...e.data.questOccurrences[0] }) }, 'duplicate_id'],
      ['duplicate seed keys', (e) => { e.data.questTemplates[0].seedKey = 'dup'; e.data.questTemplates[1].seedKey = 'dup' }, 'duplicate_seed_key'],
      ['duplicate completions', (e) => { e.data.questCompletions.push({ ...e.data.questCompletions[0] }) }, 'duplicate_completion'],
      ['a negative XP amount', (e) => { e.data.xpTransactions[0].amount = -55 }, 'out_of_range'],
      ['a fractional XP amount', (e) => { e.data.xpTransactions[0].amount = 5.5 }, 'not_a_safe_integer'],
      ['an inconsistent running total', (e) => { e.data.xpTransactions[1].totalExpAfter = 9999 }, 'total_exp_mismatch'],
      ['a sequence gap', (e) => { e.data.xpTransactions[2].seq = 9 }, 'seq_gap'],
      ['a duplicate sequence number', (e) => { e.data.xpTransactions[1].seq = 1 }, 'duplicate_seq'],
      ['a reordered ledger', (e) => { e.data.xpTransactions.reverse() }, 'seq_out_of_order'],
      ['an XP idempotency key that does not match its source', (e) => { e.data.xpTransactions[1].idempotencyKey = e.data.xpTransactions[0].idempotencyKey }, 'idempotency_key_mismatch'],
      ['the same quest paid twice in the ledger', (e) => {
        const last = e.data.xpTransactions.at(-1)
        e.data.xpTransactions.push({ ...last, seq: last.seq + 1, totalExpAfter: last.totalExpAfter + last.amount })
      }, 'duplicate_idempotency_key'],
      ['a completion without its occurrence', (e) => { e.data.questOccurrences = e.data.questOccurrences.filter((o: Json) => o.id !== 'occ:tpl_gym@2026-10-01') }, 'missing_occurrence'],
      ['a completion without its XP transaction', (e) => { e.data.xpTransactions.pop() }, 'missing_xp_transaction'],
      ['quest XP without a completion', (e) => { e.data.questCompletions.pop() }, 'missing_completion'],
      ['a completion whose EXP differs from its occurrence', (e) => { e.data.questCompletions[0].expAwarded = 9 }, 'completion_exp_mismatch'],
      ['a completion whose category differs from its occurrence', (e) => { e.data.questCompletions[0].category = 'trading' }, 'completion_category_mismatch'],
      ['an XP row whose amount differs from its completion', (e) => { e.data.xpTransactions[0].amount = 56; e.data.xpTransactions[0].totalExpAfter = 56 }, 'xp_transaction_mismatch'],
      ['a data collection that is not an array', (e) => { e.data.xpTransactions = {} }, 'not_an_array'],
      ['an unknown data collection', (e) => { e.data.achievementUnlocks = [] }, 'unexpected_field'],
    ]

    it.each(cases)('rejects %s', async (_label, mutate, issueCode) => {
      const text = await tampered(await exportText(await populated()), mutate)
      const error = await rejection(text)
      expect(error.code).toBe('invalid_backup')
      expect(error.issues.map((issue) => issue.code)).toContain(issueCode)
    })
  })

  describe('existing data is untouched by a rejected import', () => {
    it('keeps every record when validation fails', async () => {
      const database = await populated()
      const before = await snapshotAll(database)
      const bad = await tampered(await exportText(await populated()), (e) => { e.data.xpTransactions[1].totalExpAfter = 1 })

      const result = await importBackup(database, bad)
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid_backup' } })
      expect(await snapshotAll(database)).toEqual(before)
      expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
    })

    it.each([
      ['not JSON', () => '{{{'],
      ['a checksum mismatch', async (good: string) => tampered(good, (e) => { e.data.questTemplates = [] }, { resign: false })],
      ['an unsupported version', async (good: string) => tampered(good, (e) => { e.schemaVersion = 7 })],
    ])('keeps every record when the file is %s', async (_label, break_) => {
      const database = await populated()
      const before = await snapshotAll(database)
      const good = await exportText(database)
      const result = await importBackup(database, await break_(good))
      expect(result.ok).toBe(false)
      expect(await snapshotAll(database)).toEqual(before)
    })

    it('rolls back a restore that fails midway (simulated quota failure after the clear and several writes)', async () => {
      const database = await populated()
      const before = await snapshotAll(database)
      const text = await exportText(database)

      const realAdd = IDBObjectStore.prototype.add
      let calls = 0
      vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
        calls += 1
        if (calls === 6) throw new DOMException('Simulated quota failure', 'QuotaExceededError')
        return realAdd.apply(this, args)
      })

      await expect(importBackup(database, text)).rejects.toMatchObject({ code: 'storage_quota_exceeded' })
      expect(calls).toBe(6)
      vi.restoreAllMocks()

      expect(await snapshotAll(database)).toEqual(before)
      expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
    })

    it('reports an unexpected restore failure as import_failed and keeps the old data', async () => {
      const database = await populated()
      const before = await snapshotAll(database)
      const text = await exportText(database)

      const realAdd = IDBObjectStore.prototype.add
      let calls = 0
      vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
        calls += 1
        if (calls === 3) throw new TypeError('disk on fire')
        return realAdd.apply(this, args)
      })

      const attempt = importBackup(database, text)
      await expect(attempt).rejects.toMatchObject({ code: 'import_failed' })
      vi.restoreAllMocks()
      expect(await snapshotAll(database)).toEqual(before)
    })

    it('does not change a database that was closed before the restore', async () => {
      const factory = (await import('../test-utils/helpers')).newFactory()
      const working = await tracker.open(factory)
      await populate(working)
      const text = await exportText(working)
      const closed = await tracker.open(factory)
      closed.close()
      await expect(importBackup(closed, text)).rejects.toMatchObject({ code: 'database_closed' })
      expect(await readRaw(working, 'xpTransactions')).toHaveLength(4)
    })
  })
})

describe('backup schema upgrades', () => {
  it('upgrades an older backup through the registered steps', async () => {
    const text = await exportText(await populated())
    const seen: number[] = []
    const result = await parseBackup(text, {
      currentSchemaVersion: 3,
      migrations: {
        2: (data) => { seen.push(2); return data },
        3: (data) => { seen.push(3); return data },
      },
    })
    expect(seen).toEqual([2, 3])
    expect(result).toMatchObject({ ok: true, value: { envelope: { schemaVersion: 3 } } })
  })

  it('refuses an older backup when an upgrade step is missing, instead of guessing', async () => {
    const text = await exportText(await populated())
    const result = await parseBackup(text, { currentSchemaVersion: 2, migrations: {} })
    expect(result).toMatchObject({ ok: false, error: { code: 'unsupported_backup_version', issues: [{ code: 'no_upgrade_path' }] } })
  })

  it('validates the upgraded data, so a faulty upgrade cannot smuggle bad records in', async () => {
    const text = await exportText(await populated())
    const result = await parseBackup(text, {
      currentSchemaVersion: 2,
      migrations: { 2: (data) => ({ ...(data as object), questTemplates: 'oops' }) },
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_backup' } })
  })
})

describe('verifyDatabaseIntegrity', () => {
  it('passes for a healthy database and reports derived progression', async () => {
    const database = await populated()
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({
      ok: true,
      report: {
        counts: { questTemplates: 4, questOccurrences: 7, questCompletions: 4, xpTransactions: 4 },
        progression: { totalExp: POPULATED_TOTAL_EXP, lastSeq: 4 },
      },
    })
  })

  it('passes for an empty database', async () => {
    expect(await verifyDatabaseIntegrity(await tracker.open())).toMatchObject({ ok: true, report: { progression: { totalExp: 0 } } })
  })

  it('finds a deleted occurrence', async () => {
    const database = await populated()
    await deleteRaw(database, 'questOccurrences', 'occ:tpl_gym@2026-10-02')
    const result = await verifyDatabaseIntegrity(database)
    expect(result.ok ? [] : result.issues.map((i) => i.code)).toContain('missing_occurrence')
  })

  it('finds a deleted ledger row (a gap and a lost XP row)', async () => {
    const database = await populated()
    await deleteRaw(database, 'xpTransactions', 'xp:quest_completion:occ:tpl_gym@2026-10-02')
    const result = await verifyDatabaseIntegrity(database)
    const codes = result.ok ? [] : result.issues.map((i) => i.code)
    expect(codes).toContain('missing_xp_transaction')
    expect(codes).toContain('seq_gap')
  })

  it('accepts a missing template (historical reference) but not a corrupt record', async () => {
    const database = await populated()
    await deleteRaw(database, 'questTemplates', 'tpl_gym')
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
    await writeRaw(database, 'questTemplates', { id: 'tpl_broken' })
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: false })
  })
})
