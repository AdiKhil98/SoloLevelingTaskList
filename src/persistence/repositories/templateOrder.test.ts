// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { sortTemplatesByOrder } from '@/domain'
import { verifyDatabaseIntegrity } from '../integrity/verify'
import { reorderTemplates } from '../commands/reorderTemplates'
import { buildTemplate, buildUnplacedTemplate, d, DatabaseTracker, readRaw, writeRaw } from '../test-utils/helpers'
import { appendTemplate, archiveTemplate, createTemplate, getTemplate, listTemplates, updateTemplate } from './templates'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

const unplaced = buildUnplacedTemplate

const orderOf = async (database: Awaited<ReturnType<DatabaseTracker['open']>>) =>
  sortTemplatesByOrder(await listTemplates(database)).map((template) => [template.id, template.sortOrder] as const)

describe('appendTemplate — a new quest goes to the bottom of the manual order', () => {
  it('gives the first template 0 and each later one the next value', async () => {
    const database = await tracker.open()
    const stored = []
    for (const id of ['tpl_a', 'tpl_b', 'tpl_c']) stored.push(await appendTemplate(database, unplaced({ id })))
    expect(stored.map((template) => template.sortOrder)).toEqual([0, 1, 2])
    expect(await orderOf(database)).toEqual([['tpl_a', 0], ['tpl_b', 1], ['tpl_c', 2]])
    expect(await getTemplate(database, 'tpl_c')).toEqual(stored[2])
  })

  it('goes after every stored value, archived ones included, and uses the largest value + 1 (gaps are fine)', async () => {
    const database = await tracker.open()
    await createTemplate(database, buildTemplate({ id: 'tpl_far', sortOrder: 10, status: 'archived', activeUntil: d('2026-10-01') }))
    await createTemplate(database, buildTemplate({ id: 'tpl_near', sortOrder: 3 }))

    const appended = await appendTemplate(database, unplaced({ id: 'tpl_new' }))

    expect(appended.sortOrder).toBe(11)
  })

  it('never hands out the same value twice when several creations race (one transaction picks and inserts)', async () => {
    const database = await tracker.open()
    const ids = Array.from({ length: 12 }, (_, index) => `tpl_${index}`)

    const results = await Promise.all(ids.map((id) => appendTemplate(database, unplaced({ id }))))

    expect(results.map((template) => template.sortOrder).sort((a, b) => a - b)).toEqual(ids.map((_, index) => index))
    expect(new Set((await listTemplates(database)).map((template) => template.sortOrder)).size).toBe(12)
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it('cannot overflow: at the largest safe integer the sequence is renumbered 0…n-1 (order kept) in the same transaction', async () => {
    const database = await tracker.open()
    await createTemplate(database, buildTemplate({ id: 'tpl_low', sortOrder: 0 }))
    await createTemplate(database, buildTemplate({ id: 'tpl_mid', sortOrder: 5 }))
    await createTemplate(database, buildTemplate({ id: 'tpl_top', sortOrder: Number.MAX_SAFE_INTEGER }))

    const appended = await appendTemplate(database, unplaced({ id: 'tpl_new' }))

    expect(await orderOf(database)).toEqual([['tpl_low', 0], ['tpl_mid', 1], ['tpl_top', 2], ['tpl_new', 3]])
    expect(appended.sortOrder).toBe(3)
    for (const template of await listTemplates(database)) expect(Number.isSafeInteger(template.sortOrder)).toBe(true)
  })

  it('stays safe when the single stored value is the maximum', async () => {
    const database = await tracker.open()
    await createTemplate(database, buildTemplate({ id: 'tpl_only', sortOrder: Number.MAX_SAFE_INTEGER }))
    await appendTemplate(database, unplaced({ id: 'tpl_new' }))
    expect(await orderOf(database)).toEqual([['tpl_only', 0], ['tpl_new', 1]])
  })

  it('writes nothing when the new template is invalid or its id is taken', async () => {
    const database = await tracker.open()
    await appendTemplate(database, unplaced({ id: 'tpl_a' }))
    const before = await readRaw(database, 'questTemplates')

    await expect(appendTemplate(database, unplaced({ id: 'tpl_bad', title: '   ' }))).rejects.toMatchObject({ code: 'record_validation_failed' })
    await expect(appendTemplate(database, unplaced({ id: 'tpl_a', title: 'Duplicate id' }))).rejects.toMatchObject({ code: 'constraint_violation' })

    expect(await readRaw(database, 'questTemplates')).toEqual(before)
  })

  it('refuses stored data it cannot read instead of guessing a position', async () => {
    const database = await tracker.open()
    await writeRaw(database, 'questTemplates', { id: 'tpl_broken' })
    await expect(appendTemplate(database, unplaced({ id: 'tpl_a' }))).rejects.toMatchObject({ code: 'record_validation_failed' })
    expect(await readRaw(database, 'questTemplates')).toEqual([{ id: 'tpl_broken' }])
  })
})

describe('updateTemplate — the stored sortOrder always wins', () => {
  it('ignores the sortOrder of the copy it is given and returns what it stored', async () => {
    const database = await tracker.open()
    const original = await appendTemplate(database, unplaced({ id: 'tpl_a' }))
    await appendTemplate(database, unplaced({ id: 'tpl_b' }))

    const saved = await updateTemplate(database, { ...original, title: 'Renamed', revision: 2, sortOrder: 99 })

    expect(saved).toMatchObject({ title: 'Renamed', revision: 2, sortOrder: 0 })
    expect(await getTemplate(database, 'tpl_a')).toEqual(saved)
  })

  it('a stale form cannot undo a reorder made after it was opened', async () => {
    const database = await tracker.open()
    for (const id of ['tpl_a', 'tpl_b', 'tpl_c']) await appendTemplate(database, unplaced({ id }))
    const staleCopy = (await getTemplate(database, 'tpl_a'))! // what the edit form loaded: sortOrder 0

    const reordered = await reorderTemplates(database, { expectedOrder: ['tpl_a', 'tpl_b', 'tpl_c'], newOrder: ['tpl_b', 'tpl_c', 'tpl_a'] })
    expect(reordered.status).toBe('reordered')
    await updateTemplate(database, { ...staleCopy, title: 'Edited from a stale form', revision: staleCopy.revision + 1 })

    expect(await orderOf(database)).toEqual([['tpl_b', 0], ['tpl_c', 1], ['tpl_a', 2]])
    expect((await getTemplate(database, 'tpl_a'))?.title).toBe('Edited from a stale form')
    expect(new Set((await listTemplates(database)).map((template) => template.sortOrder)).size).toBe(3)
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it('an edit does not move the quest', async () => {
    const database = await tracker.open()
    for (const id of ['tpl_a', 'tpl_b', 'tpl_c']) await appendTemplate(database, unplaced({ id }))
    const b = (await getTemplate(database, 'tpl_b'))!

    await updateTemplate(database, { ...b, title: 'B, edited', difficulty: 'S', revision: 2 })

    expect(await orderOf(database)).toEqual([['tpl_a', 0], ['tpl_b', 1], ['tpl_c', 2]])
  })
})

describe('archiveTemplate — archiving does not touch the order', () => {
  it('keeps the archived quest’s value and leaves every other value alone', async () => {
    const database = await tracker.open()
    for (const id of ['tpl_a', 'tpl_b', 'tpl_c']) await appendTemplate(database, unplaced({ id }))

    await archiveTemplate(database, 'tpl_b', { activeUntil: d('2026-10-05'), updatedAt: 5_000 })

    expect(await orderOf(database)).toEqual([['tpl_a', 0], ['tpl_b', 1], ['tpl_c', 2]])
    expect((await getTemplate(database, 'tpl_b'))?.status).toBe('archived')
  })
})
