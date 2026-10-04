// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { sortTemplatesByOrder, type QuestTemplate } from '@/domain'
import { verifyDatabaseIntegrity } from '../integrity/verify'
import { appendTemplate, archiveTemplate, createTemplate, listTemplates, updateTemplate } from '../repositories/templates'
import { buildTemplate, buildUnplacedTemplate, d, DatabaseTracker, readRaw, withoutSortOrder, writeRaw } from '../test-utils/helpers'
import { reorderTemplates } from './reorderTemplates'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

type Database = Awaited<ReturnType<DatabaseTracker['open']>>

async function openWith(ids: readonly string[]): Promise<Database> {
  const database = await tracker.open()
  for (const id of ids) {
    await appendTemplate(database, buildUnplacedTemplate({ id, title: id.toUpperCase() }))
  }
  return database
}

async function activeOrder(database: Database): Promise<string[]> {
  return sortTemplatesByOrder((await listTemplates(database)).filter((template) => template.status === 'active')).map((template) => template.id)
}

async function fullOrder(database: Database): Promise<string[]> {
  return sortTemplatesByOrder(await listTemplates(database)).map((template) => template.id)
}

const withoutOrder = (rows: unknown[]) => (rows as QuestTemplate[]).map((row) => withoutSortOrder(row))
const archive = (database: Database, id: string) =>
  archiveTemplate(database, id, { activeUntil: d('2026-10-05'), updatedAt: 9_000 })

describe('reorderTemplates — moves', () => {
  it('moves the first quest down', async () => {
    const database = await openWith(['a', 'b', 'c', 'd'])
    const result = await reorderTemplates(database, { expectedOrder: ['a', 'b', 'c', 'd'], newOrder: ['b', 'a', 'c', 'd'] })
    expect(result).toEqual({ status: 'reordered', order: ['b', 'a', 'c', 'd'] })
    expect(await activeOrder(database)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('moves the last quest up', async () => {
    const database = await openWith(['a', 'b', 'c', 'd'])
    await reorderTemplates(database, { expectedOrder: ['a', 'b', 'c', 'd'], newOrder: ['a', 'b', 'd', 'c'] })
    expect(await activeOrder(database)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('applies an arbitrary permutation, and moves the last quest to the top and back', async () => {
    const database = await openWith(['a', 'b', 'c', 'd', 'e'])
    await reorderTemplates(database, { expectedOrder: ['a', 'b', 'c', 'd', 'e'], newOrder: ['e', 'c', 'a', 'd', 'b'] })
    expect(await activeOrder(database)).toEqual(['e', 'c', 'a', 'd', 'b'])
    await reorderTemplates(database, { expectedOrder: ['e', 'c', 'a', 'd', 'b'], newOrder: ['c', 'a', 'd', 'b', 'e'] })
    expect(await activeOrder(database)).toEqual(['c', 'a', 'd', 'b', 'e'])
  })

  it('keeps the values unique and within the original set (they are only permuted)', async () => {
    const database = await openWith(['a', 'b', 'c', 'd'])
    const before = (await listTemplates(database)).map((template) => template.sortOrder).sort((x, y) => x - y)
    await reorderTemplates(database, { expectedOrder: ['a', 'b', 'c', 'd'], newOrder: ['d', 'c', 'b', 'a'] })
    expect((await listTemplates(database)).map((template) => template.sortOrder).sort((x, y) => x - y)).toEqual(before)
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it('is deterministic: the same moves on the same data always give the same stored values', async () => {
    const values = async () => {
      const database = await openWith(['a', 'b', 'c', 'd', 'e'])
      let current = ['a', 'b', 'c', 'd', 'e']
      for (const next of [['b', 'a', 'c', 'd', 'e'], ['b', 'a', 'e', 'c', 'd'], ['e', 'b', 'a', 'c', 'd']]) {
        await reorderTemplates(database, { expectedOrder: current, newOrder: next })
        current = next
      }
      return (await listTemplates(database)).map((template) => [template.id, template.sortOrder]).sort()
    }
    expect(await values()).toEqual(await values())
  })

  it('writes only the rows whose value changed and leaves every other field, revision and updatedAt included, alone', async () => {
    const database = await openWith(['a', 'b', 'c', 'd'])
    const before = await readRaw(database, 'questTemplates')

    await reorderTemplates(database, { expectedOrder: ['a', 'b', 'c', 'd'], newOrder: ['a', 'c', 'b', 'd'] })

    const after = await readRaw(database, 'questTemplates')
    expect(withoutOrder(after)).toEqual(withoutOrder(before))
    const changed = (after as QuestTemplate[]).filter((row, index) => row.sortOrder !== (before as QuestTemplate[])[index]!.sortOrder)
    expect(changed.map((row) => row.id).sort()).toEqual(['b', 'c'])
  })

  it('reordering a single active quest, or none, is a no-op', async () => {
    const empty = await tracker.open()
    expect(await reorderTemplates(empty, { expectedOrder: [], newOrder: [] })).toEqual({ status: 'unchanged', order: [] })
    const one = await openWith(['a'])
    expect(await reorderTemplates(one, { expectedOrder: ['a'], newOrder: ['a'] })).toEqual({ status: 'unchanged', order: ['a'] })
  })
})

describe('reorderTemplates — nothing is written unless the move is valid and current', () => {
  it('"unchanged" writes nothing', async () => {
    const database = await openWith(['a', 'b', 'c'])
    const before = await readRaw(database, 'questTemplates')
    expect(await reorderTemplates(database, { expectedOrder: ['a', 'b', 'c'], newOrder: ['a', 'b', 'c'] })).toEqual({ status: 'unchanged', order: ['a', 'b', 'c'] })
    expect(await readRaw(database, 'questTemplates')).toEqual(before)
  })

  it('rejects a stale view (a quest was added meanwhile) and reports the current order', async () => {
    const database = await openWith(['a', 'b'])
    await openWithMore(database, 'c')
    const before = await readRaw(database, 'questTemplates')

    const result = await reorderTemplates(database, { expectedOrder: ['a', 'b'], newOrder: ['b', 'a'] })

    expect(result).toEqual({ status: 'rejected', reason: { code: 'stale_order', currentOrder: ['a', 'b', 'c'] } })
    expect(await readRaw(database, 'questTemplates')).toEqual(before)
  })

  it('rejects a stale view after a quest was archived, and after another tab reordered', async () => {
    const database = await openWith(['a', 'b', 'c'])
    await reorderTemplates(database, { expectedOrder: ['a', 'b', 'c'], newOrder: ['c', 'a', 'b'] }) // another tab
    expect(await reorderTemplates(database, { expectedOrder: ['a', 'b', 'c'], newOrder: ['b', 'a', 'c'] })).toMatchObject({
      status: 'rejected',
      reason: { code: 'stale_order', currentOrder: ['c', 'a', 'b'] },
    })

    await archive(database, 'a')
    expect(await reorderTemplates(database, { expectedOrder: ['c', 'a', 'b'], newOrder: ['b', 'a', 'c'] })).toMatchObject({
      status: 'rejected',
      reason: { code: 'stale_order', currentOrder: ['c', 'b'] },
    })
    expect(await activeOrder(database)).toEqual(['c', 'b'])
  })

  it.each([
    ['repeats an id', ['a', 'a', 'c']],
    ['leaves an id out', ['a', 'b']],
    ['adds an unknown id', ['a', 'b', 'c', 'zzz']],
    ['swaps one id for an unknown one', ['a', 'b', 'zzz']],
    ['names an archived quest', ['a', 'b', 'c', 'archived']],
  ])('rejects a new order that %s', async (_label, newOrder) => {
    const database = await openWith(['a', 'b', 'c', 'archived'])
    await archive(database, 'archived')
    const before = await readRaw(database, 'questTemplates')

    const result = await reorderTemplates(database, { expectedOrder: ['a', 'b', 'c'], newOrder })

    expect(result).toEqual({ status: 'rejected', reason: { code: 'invalid_order', currentOrder: ['a', 'b', 'c'] } })
    expect(await readRaw(database, 'questTemplates')).toEqual(before)
  })

  it('refuses stored data it cannot read, writing nothing', async () => {
    const database = await openWith(['a', 'b'])
    await writeRaw(database, 'questTemplates', { id: 'junk' })
    const before = await readRaw(database, 'questTemplates')
    await expect(reorderTemplates(database, { expectedOrder: ['a', 'b'], newOrder: ['b', 'a'] })).rejects.toMatchObject({ code: 'record_validation_failed' })
    expect(await readRaw(database, 'questTemplates')).toEqual(before)
  })
})

async function openWithMore(database: Database, id: string) {
  await appendTemplate(database, buildUnplacedTemplate({ id, title: id.toUpperCase() }))
}

describe('reorderTemplates — archived quests keep their slot', () => {
  it('does not touch an archived quest, and a restored quest returns to the slot it held', async () => {
    const database = await openWith(['a', 'b', 'c', 'd'])
    await archive(database, 'b') // global order: a, b(archived), c, d
    const archivedBefore = (await readRaw(database, 'questTemplates')).find((row) => (row as QuestTemplate).id === 'b')

    await reorderTemplates(database, { expectedOrder: ['a', 'c', 'd'], newOrder: ['d', 'c', 'a'] })

    expect((await readRaw(database, 'questTemplates')).find((row) => (row as QuestTemplate).id === 'b')).toEqual(archivedBefore)
    expect(await fullOrder(database)).toEqual(['d', 'b', 'c', 'a']) // b still sits in its old slot (index 1)

    const archived = (await listTemplates(database)).find((template) => template.id === 'b')!
    await updateTemplate(database, { ...archived, status: 'active', activeUntil: null, updatedAt: 9_500 }) // what restore does
    expect(await activeOrder(database)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('restoring without any reorder puts the quest back exactly where it was', async () => {
    const database = await openWith(['a', 'b', 'c'])
    await archive(database, 'a')
    await archive(database, 'c')
    const archivedRow = (await listTemplates(database)).find((template) => template.id === 'a')!
    await updateTemplate(database, { ...archivedRow, status: 'active', activeUntil: null, updatedAt: 9_500 })
    expect(await activeOrder(database)).toEqual(['a', 'b'])
  })

  it('a quest created while another is archived goes below it, and the archived one still returns to its place', async () => {
    const database = await openWith(['a', 'b'])
    await archive(database, 'a')
    await openWithMore(database, 'c')
    const row = (await listTemplates(database)).find((template) => template.id === 'a')!
    await updateTemplate(database, { ...row, status: 'active', activeUntil: null, updatedAt: 9_500 })
    expect(await activeOrder(database)).toEqual(['a', 'b', 'c'])
  })
})

describe('reorderTemplates — concurrency and damaged data', () => {
  it('two reorders from the same view: exactly one wins, the other is told it is stale, and the order is never mixed', async () => {
    const database = await openWith(['a', 'b', 'c'])
    const first = reorderTemplates(database, { expectedOrder: ['a', 'b', 'c'], newOrder: ['c', 'b', 'a'] })
    const second = reorderTemplates(database, { expectedOrder: ['a', 'b', 'c'], newOrder: ['b', 'c', 'a'] })

    const results = await Promise.all([first, second])

    expect(results.map((result) => result.status).sort()).toEqual(['rejected', 'reordered'])
    const winner = results.find((result) => result.status === 'reordered')
    expect(winner).toBeDefined()
    expect(await activeOrder(database)).toEqual(winner && 'order' in winner ? winner.order : [])
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it('a reorder racing a new quest either wins (the new quest lands below) or is stale; never a duplicate or a gap in validity', async () => {
    const database = await openWith(['a', 'b', 'c'])
    const [reorder] = await Promise.all([
      reorderTemplates(database, { expectedOrder: ['a', 'b', 'c'], newOrder: ['c', 'a', 'b'] }),
      openWithMore(database, 'd'),
    ])

    const values = (await listTemplates(database)).map((template) => template.sortOrder)
    expect(new Set(values).size).toBe(4)
    expect(values.every((value) => Number.isSafeInteger(value) && value >= 0)).toBe(true)
    if (reorder.status === 'reordered') expect(await activeOrder(database)).toEqual(['c', 'a', 'b', 'd'])
    else expect(await activeOrder(database)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('repairs a repeated sortOrder (damaged data) by renumbering in the current order, then applies the move', async () => {
    const database = await tracker.open()
    // Foreign data: all three share a value; creation time then id decide today's order (x, y, z).
    await createTemplate(database, buildTemplate({ id: 'z', sortOrder: 4, createdAt: 3 }))
    await createTemplate(database, buildTemplate({ id: 'y', sortOrder: 4, createdAt: 2 }))
    await createTemplate(database, buildTemplate({ id: 'x', sortOrder: 4, createdAt: 1 }))
    expect(await activeOrder(database)).toEqual(['x', 'y', 'z'])

    const result = await reorderTemplates(database, { expectedOrder: ['x', 'y', 'z'], newOrder: ['z', 'x', 'y'] })

    expect(result.status).toBe('reordered')
    expect(await activeOrder(database)).toEqual(['z', 'x', 'y'])
    expect(new Set((await listTemplates(database)).map((template) => template.sortOrder)).size).toBe(3)
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it('keeps the order valid through 300 pseudo-random creates, archives, restores, edits and reorders', async () => {
    const database = await tracker.open()
    let state = 7_919
    const random = (limit: number) => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
      return state % limit
    }
    let created = 0
    const model: { id: string; active: boolean }[] = [] // global order, as the model expects it

    for (let step = 0; step < 300; step += 1) {
      const choice = random(10)
      if (choice < 3 || model.length === 0) {
        const id = `t${created++}`
        await openWithMore(database, id)
        model.push({ id, active: true })
      } else if (choice < 5) {
        const target = model[random(model.length)]!
        const row = (await listTemplates(database)).find((template) => template.id === target.id)!
        if (target.active) await archive(database, target.id)
        else await updateTemplate(database, { ...row, status: 'active', activeUntil: null, updatedAt: 9_500 })
        target.active = !target.active
      } else if (choice < 6) {
        const target = model[random(model.length)]!
        const row = (await listTemplates(database)).find((template) => template.id === target.id)!
        if (row.status === 'active') await updateTemplate(database, { ...row, title: `edit ${step}`, revision: row.revision + 1, sortOrder: random(50) })
      } else {
        const active = model.filter((entry) => entry.active)
        if (active.length < 2) continue
        const ids = active.map((entry) => entry.id)
        const next = [...ids]
        const from = random(next.length)
        const [moved] = next.splice(from, 1)
        next.splice(random(next.length + 1), 0, moved!)
        const result = await reorderTemplates(database, { expectedOrder: ids, newOrder: next })
        expect(['reordered', 'unchanged']).toContain(result.status)
        // The active quests permute among the slots the active quests held; archived ones stay put.
        const slots = model.map((entry, index) => (entry.active ? index : -1)).filter((index) => index >= 0)
        const byId = new Map(model.map((entry) => [entry.id, entry]))
        next.forEach((id, index) => { model[slots[index]!] = byId.get(id)! })
      }

      const stored = await listTemplates(database)
      const values = stored.map((template) => template.sortOrder)
      expect(new Set(values).size).toBe(stored.length)
      expect(values.every((value) => Number.isSafeInteger(value) && value >= 0)).toBe(true)
      expect(sortTemplatesByOrder(stored).map((template) => template.id)).toEqual(model.map((entry) => entry.id))
    }
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })
})
