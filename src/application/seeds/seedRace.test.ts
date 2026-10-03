// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTemplate, listTemplates, PersistenceError, type PersistenceDatabase } from '@/persistence'
import { ensureDefaultQuests } from './ensureDefaultQuests'
import { createTestContext, d, noonOn } from '../test-utils/helpers'

/**
 * Deterministically reproduces the lookup/write race (two tabs, or a StrictMode
 * remount): the first lookup of a seed reports "absent" even though the seeded
 * template already exists, so the write hits a real constraint violation in
 * IndexedDB. The second lookup (the re-read) tells the truth.
 */
const stale = vi.hoisted(() => ({ keys: new Set<string>(), served: new Set<string>() }))

vi.mock('@/persistence', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/persistence')>()
  return {
    ...original,
    getTemplateBySeedKey: async (database: PersistenceDatabase, seedKey: string) => {
      const actual = await original.getTemplateBySeedKey(database, seedKey)
      if (stale.keys.has(seedKey) && !stale.served.has(seedKey)) {
        stale.served.add(seedKey)
        return null
      }
      return actual
    },
  }
})

const input = { startDate: d('2026-10-05'), now: noonOn('2026-10-05') }

let database: PersistenceDatabase

beforeEach(async () => {
  stale.keys.clear()
  stale.served.clear()
  database = (await createTestContext()).database
})

afterEach(() => {
  database.close()
})

describe('seeding race handling', () => {
  it('accepts a constraint violation only after a re-read proves the seeded template exists', async () => {
    await ensureDefaultQuests(database, input)
    stale.keys.add('prayer.fajr')

    const result = await ensureDefaultQuests(database, input)

    expect(stale.served.has('prayer.fajr')).toBe(true) // the stale lookup really happened
    expect(result.created).toEqual([])
    expect(await listTemplates(database)).toHaveLength(6)
  })

  it('surfaces the underlying error when the re-read cannot confirm the seeded template', async () => {
    // Nothing is seeded and the lookup is stale for the first read only, but the
    // template that blocks the write is not the seed: it has no seed key.
    await createTemplate(database, {
      id: 'tpl_seed_prayer_fajr',
      title: 'Unrelated',
      difficulty: 'E',
      category: 'discipline',
      recurrence: { kind: 'daily' },
      role: 'standard',
      seedKey: null,
      activeFrom: d('2026-01-01'),
      activeUntil: null,
      status: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    stale.keys.add('prayer.fajr')

    const attempt = ensureDefaultQuests(database, input)

    await expect(attempt).rejects.toBeInstanceOf(PersistenceError)
    await expect(attempt).rejects.toMatchObject({ code: 'constraint_violation' })
  })
})
