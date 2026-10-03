// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { DATABASE_NAME, DATABASE_VERSION } from '../config'
import { PersistenceError } from '../errors'
import { createTemplate, getTemplate } from '../repositories/templates'
import { buildTemplate, DatabaseTracker, newFactory, readRaw } from '../test-utils/helpers'
import { openDatabase, openVersionedDatabase } from './connection'
import { MIGRATIONS } from '../migrations'
import { requestToPromise, runTransaction } from './transaction'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

/** Opens a raw connection (outside the persistence layer) to inspect or interfere. */
function rawOpen(factory: IDBFactory, name: string, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('current schema (v2)', () => {
  it('creates a fresh database at the production name and the current version', async () => {
    const factory = newFactory()
    const database = tracker.track(await openDatabase({ factory }))
    expect(database.name).toBe(DATABASE_NAME)
    expect(database.version).toBe(2)
    expect(DATABASE_VERSION).toBe(2)
    expect(database.isOpen).toBe(true)
  })

  it('creates exactly the five stores with the documented key paths', async () => {
    const factory = newFactory()
    tracker.track(await openDatabase({ factory }))
    const raw = await rawOpen(factory, DATABASE_NAME)
    try {
      expect([...raw.objectStoreNames].sort()).toEqual([
        'dailySummaries',
        'questCompletions',
        'questOccurrences',
        'questTemplates',
        'xpTransactions',
      ])
      const tx = raw.transaction([...raw.objectStoreNames], 'readonly')
      expect(tx.objectStore('questTemplates').keyPath).toBe('id')
      expect(tx.objectStore('questOccurrences').keyPath).toBe('id')
      expect(tx.objectStore('questCompletions').keyPath).toBe('occurrenceId')
      expect(tx.objectStore('xpTransactions').keyPath).toBe('id')
      expect(tx.objectStore('dailySummaries').keyPath).toBe('dateKey')
    } finally {
      raw.close()
    }
  })

  it('creates exactly the documented indexes', async () => {
    const factory = newFactory()
    tracker.track(await openDatabase({ factory }))
    const raw = await rawOpen(factory, DATABASE_NAME)
    try {
      const tx = raw.transaction([...raw.objectStoreNames], 'readonly')
      const describeIndexes = (store: string) =>
        [...tx.objectStore(store).indexNames].sort().map((name) => {
          const index = tx.objectStore(store).index(name)
          return `${name}:${JSON.stringify(index.keyPath)}:${index.unique ? 'unique' : 'plain'}`
        })

      // The quality index counts Perfect Days; an isPerfect index is impossible (booleans are not keys).
      expect(describeIndexes('dailySummaries')).toEqual(['quality:"quality":plain'])
      expect(describeIndexes('questTemplates')).toEqual([
        'seedKey:"seedKey":unique',
        'status:"status":plain',
      ])
      expect(describeIndexes('questOccurrences')).toEqual([
        'dateKey:"dateKey":plain',
        'templateDate:["templateId","dateKey"]:unique',
        'templateId:"templateId":plain',
      ])
      expect(describeIndexes('questCompletions')).toEqual([
        'completedAt:"completedAt":plain',
        'dateKey:"dateKey":plain',
        'templateId:"templateId":plain',
      ])
      expect(describeIndexes('xpTransactions')).toEqual([
        'category:"category":plain',
        'effectiveDate:"effectiveDate":plain',
        'idempotencyKey:"idempotencyKey":unique',
        'seq:"seq":unique',
        'sourceType:"source.type":plain',
        'sourceWeekKey:"sourceWeekKey":plain',
      ])
    } finally {
      raw.close()
    }
  })

  it('preserves data when the database is closed and reopened', async () => {
    const factory = newFactory()
    const first = await openDatabase({ factory })
    await createTemplate(first, buildTemplate({ id: 'tpl_keep', title: 'Keep me' }))
    first.close()

    const second = tracker.track(await openDatabase({ factory }))
    expect((await getTemplate(second, 'tpl_keep'))?.title).toBe('Keep me')
  })
})

describe('connection handle', () => {
  it('rejects further use with a typed database_closed error after close()', async () => {
    const database = await tracker.open()
    database.close()
    database.close() // idempotent
    expect(database.isOpen).toBe(false)
    await expect(getTemplate(database, 'tpl_x')).rejects.toMatchObject({ code: 'database_closed' })
  })

  it('reports database_unavailable when IndexedDB does not exist', async () => {
    await expect(openDatabase()).rejects.toMatchObject({ code: 'database_unavailable' })
  })

  it('wraps a failed request into a typed PersistenceError with the original cause', async () => {
    const database = await tracker.open()
    const failure = runTransaction(database, ['questTemplates'], 'readonly', (transaction) =>
      // A write inside a read-only transaction is rejected by IndexedDB itself.
      requestToPromise(transaction.objectStore('questTemplates').add({ id: 'x' })),
    )
    await expect(failure).rejects.toBeInstanceOf(PersistenceError)
    await expect(failure).rejects.toMatchObject({ code: 'transaction_failed' })
    await expect(failure).rejects.toHaveProperty('cause')
  })

  it('refuses to open a database written by a newer app version', async () => {
    const factory = newFactory()
    const future = await rawOpen(factory, DATABASE_NAME, 9)
    future.close()
    await expect(openDatabase({ factory })).rejects.toMatchObject({
      code: 'database_version_unsupported',
    })
  })
})

describe('the real v1 → v2 upgrade (Phase 06)', () => {
  it('adds dailySummaries to an existing v1 database and keeps every existing row', async () => {
    const factory = newFactory()
    const v1 = await openVersionedDatabase({ name: DATABASE_NAME, factory, version: 1, migrations: { 1: MIGRATIONS[1]! } })
    await createTemplate(v1, buildTemplate({ id: 'tpl_legacy', title: 'From v1' }))
    expect([...(await rawOpen(factory, DATABASE_NAME, 1).then((raw) => { const names = [...raw.objectStoreNames]; raw.close(); return names }))]).not.toContain('dailySummaries')
    v1.close()

    const upgraded = tracker.track(await openDatabase({ factory }))
    expect(upgraded.version).toBe(2)
    expect((await getTemplate(upgraded, 'tpl_legacy'))?.title).toBe('From v1')
    expect(await readRaw(upgraded, 'dailySummaries')).toEqual([])
  })
})

describe('upgrades and versionchange', () => {
  const v3 = {
    ...MIGRATIONS,
    3: (database: IDBDatabase) => {
      database.createObjectStore('futureStore', { keyPath: 'id' })
    },
  }

  it('upgrades incrementally without deleting existing data', async () => {
    const factory = newFactory()
    const first = await openDatabase({ factory })
    await createTemplate(first, buildTemplate({ id: 'tpl_survivor' }))
    first.close()

    const upgraded = tracker.track(
      await openVersionedDatabase({ name: DATABASE_NAME, factory, version: 3, migrations: v3 }),
    )
    expect(upgraded.version).toBe(3)
    expect(await readRaw(upgraded, 'questTemplates')).toHaveLength(1)
    const raw = await rawOpen(factory, DATABASE_NAME)
    expect([...raw.objectStoreNames]).toContain('futureStore')
    raw.close()
  })

  it('closes an old connection on versionchange so the upgrade is not blocked', async () => {
    const factory = newFactory()
    const oldTab = await openDatabase({ factory })
    await createTemplate(oldTab, buildTemplate({ id: 'tpl_1' }))

    const newTab = tracker.track(
      await openVersionedDatabase({ name: DATABASE_NAME, factory, version: 3, migrations: v3 }),
    )
    expect(newTab.version).toBe(3)
    expect(oldTab.isOpen).toBe(false)
    await expect(getTemplate(oldTab, 'tpl_1')).rejects.toMatchObject({ code: 'database_closed' })
    expect(await getTemplate(newTab, 'tpl_1')).not.toBeNull()
  })

  it('rejects with database_blocked when another connection will not close, and leaves the schema alone', async () => {
    const factory = newFactory()
    tracker.track(await openDatabase({ factory })).close()
    const holdout = await rawOpen(factory, DATABASE_NAME) // ignores versionchange

    await expect(
      openVersionedDatabase({ name: DATABASE_NAME, factory, version: 3, migrations: v3 }),
    ).rejects.toMatchObject({ code: 'database_blocked' })

    holdout.close()
    // The abandoned upgrade must not have been applied once the holdout let go.
    const after = tracker.track(await openDatabase({ factory }))
    expect(after.version).toBe(2)
  })

  it('reports a failing migration as database_open_failed and does not upgrade', async () => {
    const factory = newFactory()
    tracker.track(await openDatabase({ factory })).close()
    const broken = {
      ...MIGRATIONS,
      3: () => {
        throw new Error('boom')
      },
    }
    await expect(
      openVersionedDatabase({ name: DATABASE_NAME, factory, version: 3, migrations: broken }),
    ).rejects.toMatchObject({ code: 'database_open_failed' })
    expect(tracker.track(await openDatabase({ factory })).version).toBe(2)
  })

  it('fails clearly when a migration step is missing', async () => {
    await expect(
      openVersionedDatabase({
        name: DATABASE_NAME,
        factory: newFactory(),
        version: 3,
        migrations: { 1: MIGRATIONS[1]!, 2: MIGRATIONS[2]! },
      }),
    ).rejects.toMatchObject({ code: 'database_open_failed' })
  })
})
