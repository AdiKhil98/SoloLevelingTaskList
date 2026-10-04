// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { computeBackupChecksum } from '../backup/envelope'
import { exportBackup, serializeBackup } from '../backup/export'
import { importBackup, parseBackup } from '../backup/import'
import { parseTemplate } from '../records/template'
import { buildTemplate, DatabaseTracker, newFactory, withoutSortOrder, writeRaw, ZONE } from '../test-utils/helpers'
import { populate } from '../test-utils/populate'
import { verifyDatabaseIntegrity } from './verify'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

async function populatedExport(): Promise<{ text: string; database: Awaited<ReturnType<DatabaseTracker['open']>> }> {
  const database = await tracker.open()
  await populate(database)
  const envelope = await exportBackup(database, { exportedAt: 1, exportedFromTimeZone: ZONE, appVersion: '0.1.0' })
  return { text: serializeBackup(envelope), database }
}

async function resigned(text: string, mutate: (envelope: Json) => void): Promise<string> {
  const envelope = JSON.parse(text) as Json
  mutate(envelope)
  envelope.checksum = { algorithm: 'SHA-256', value: await computeBackupChecksum(envelope) }
  return JSON.stringify(envelope)
}

describe('parseTemplate — sortOrder', () => {
  const stored = buildTemplate({ id: 'tpl_a', sortOrder: 3 })

  it('requires a non-negative safe integer', () => {
    expect(parseTemplate(stored).ok).toBe(true)
    expect(parseTemplate({ ...stored, sortOrder: 0 }).ok).toBe(true)
    expect(parseTemplate({ ...stored, sortOrder: Number.MAX_SAFE_INTEGER }).ok).toBe(true)
    for (const sortOrder of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '3', null]) {
      expect(parseTemplate({ ...stored, sortOrder }).ok).toBe(false)
    }
  })

  it('is mandatory: a template without it is not a valid record any more', () => {
    expect(parseTemplate(withoutSortOrder(stored))).toMatchObject({ ok: false })
  })
})

describe('integrity — the manual order must be unique', () => {
  it('rejects a backup in which two templates share a sortOrder', async () => {
    const { text } = await populatedExport()
    const tampered = await resigned(text, (envelope) => {
      envelope.data.questTemplates[1].sortOrder = envelope.data.questTemplates[0].sortOrder
    })

    const result = await parseBackup(tampered)

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalid_backup', issues: [{ code: 'duplicate_sort_order', path: 'data.questTemplates[1].sortOrder' }] },
    })
  })

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['beyond the safe range', Number.MAX_SAFE_INTEGER + 2],
  ])('rejects a backup whose sortOrder is %s', async (_label, value) => {
    const { text } = await populatedExport()
    const tampered = await resigned(text, (envelope) => {
      envelope.data.questTemplates[0].sortOrder = value
    })
    expect(await parseBackup(tampered)).toMatchObject({ ok: false, error: { code: 'invalid_backup' } })
  })

  it('refuses to restore such a backup and leaves the database alone', async () => {
    const { text } = await populatedExport()
    const tampered = await resigned(text, (envelope) => {
      envelope.data.questTemplates[2].sortOrder = envelope.data.questTemplates[3].sortOrder
    })
    const target = await tracker.open(newFactory())
    expect(await importBackup(target, tampered)).toMatchObject({ ok: false, error: { code: 'invalid_backup' } })
  })

  it('verifyDatabaseIntegrity reports duplicates that were planted directly in storage', async () => {
    const { database } = await populatedExport()
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })

    await writeRaw(database, 'questTemplates', buildTemplate({ id: 'tpl_dup', sortOrder: 0 })) // 0 is already tpl_gym's

    expect(await verifyDatabaseIntegrity(database)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'duplicate_sort_order' })]),
    })
  })

  it('accepts a sparse sequence: only uniqueness matters, not density', async () => {
    const database = await tracker.open()
    await writeRaw(database, 'questTemplates', buildTemplate({ id: 'tpl_a', sortOrder: 4 }))
    await writeRaw(database, 'questTemplates', buildTemplate({ id: 'tpl_b', sortOrder: 900 }))
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })
})
