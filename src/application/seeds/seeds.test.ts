// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { expRewardForDifficulty } from '@/domain'
import {
  archiveTemplate,
  createTemplate,
  listTemplates,
  PersistenceError,
  updateTemplate,
  type PersistenceDatabase,
} from '@/persistence'
import { DEFAULT_QUEST_SEEDS } from './defaultQuests'
import { ensureDefaultQuests } from './ensureDefaultQuests'
import { buildTemplate, createTestContext, d, noonOn } from '../test-utils/helpers'

const START = d('2026-10-05')
const input = { startDate: START, now: noonOn('2026-10-05') }

let database: PersistenceDatabase

beforeEach(async () => {
  database = (await createTestContext()).database
})

afterEach(() => {
  database.close()
})

describe('default quest seeding', () => {
  it('creates exactly the six approved quests on first initialization', async () => {
    const result = await ensureDefaultQuests(database, input)
    const templates = await listTemplates(database)

    expect(result.created).toEqual([
      'prayer.fajr',
      'prayer.dhuhr',
      'prayer.asr',
      'prayer.maghrib',
      'prayer.isha',
      'sleep',
    ])
    expect(templates).toHaveLength(6)
  })

  it('creates nothing on the second and later initializations', async () => {
    await ensureDefaultQuests(database, input)
    const second = await ensureDefaultQuests(database, input)
    const third = await ensureDefaultQuests(database, { startDate: d('2026-10-09'), now: noonOn('2026-10-09') })

    expect(second.created).toEqual([])
    expect(third.created).toEqual([])
    expect(await listTemplates(database)).toHaveLength(6)
  })

  it('uses the stable semantic seed keys and deterministic ids', async () => {
    await ensureDefaultQuests(database, input)
    const templates = await listTemplates(database)

    expect(templates.map((template) => template.seedKey).sort()).toEqual(
      ['prayer.asr', 'prayer.dhuhr', 'prayer.fajr', 'prayer.isha', 'prayer.maghrib', 'sleep'].sort(),
    )
    expect(templates.map((template) => template.id).sort()).toEqual(
      [
        'tpl_seed_prayer_asr',
        'tpl_seed_prayer_dhuhr',
        'tpl_seed_prayer_fajr',
        'tpl_seed_prayer_isha',
        'tpl_seed_prayer_maghrib',
        'tpl_seed_sleep',
      ].sort(),
    )
  })

  it('seeds the exact titles, difficulties, categories, roles and EXP', async () => {
    await ensureDefaultQuests(database, input)
    const bySeedKey = new Map((await listTemplates(database)).map((template) => [template.seedKey, template]))

    const expected = [
      ['prayer.fajr', 'Fajr', 'E', 10, 'standard'],
      ['prayer.dhuhr', 'Dhuhr', 'E', 10, 'standard'],
      ['prayer.asr', 'Asr', 'E', 10, 'standard'],
      ['prayer.maghrib', 'Maghrib', 'E', 10, 'standard'],
      ['prayer.isha', 'Isha', 'E', 10, 'standard'],
      ['sleep', 'Sleep before 00:00', 'D', 20, 'sleep'],
    ] as const

    for (const [seedKey, title, difficulty, exp, role] of expected) {
      const template = bySeedKey.get(seedKey)
      expect(template, seedKey).toBeDefined()
      expect(template?.title).toBe(title)
      expect(template?.difficulty).toBe(difficulty)
      expect(template?.category).toBe('discipline')
      expect(template?.role).toBe(role)
      // EXP is derived from difficulty, never stored on the template.
      expect(expRewardForDifficulty(difficulty)).toBe(exp)
    }
  })

  it('makes all six Daily quests, active, starting on the initialization date', async () => {
    await ensureDefaultQuests(database, input)

    for (const template of await listTemplates(database)) {
      expect(template.recurrence).toEqual({ kind: 'daily' })
      expect(template.activeFrom).toBe(START)
      expect(template.activeUntil).toBeNull()
      expect(template.status).toBe('active')
      expect(template.revision).toBe(1)
    }
  })

  it('seeds no unapproved defaults', async () => {
    await ensureDefaultQuests(database, input)
    const titles = (await listTemplates(database)).map((template) => template.title)

    expect(DEFAULT_QUEST_SEEDS).toHaveLength(6)
    for (const unapproved of ['Water', 'Gym', 'First Job', 'Second Job', 'AAA', 'Backtesting', 'Lessons', 'Study']) {
      expect(titles).not.toContain(unapproved)
    }
    expect(titles.sort()).toEqual(['Asr', 'Dhuhr', 'Fajr', 'Isha', 'Maghrib', 'Sleep before 00:00'].sort())
  })

  it('does not duplicate a seeded quest that was later edited or archived', async () => {
    await ensureDefaultQuests(database, input)
    const [fajr] = (await listTemplates(database)).filter((template) => template.seedKey === 'prayer.fajr')
    if (fajr === undefined) throw new Error('Fajr was not seeded')

    await updateTemplate(database, { ...fajr, title: 'Fajr (edited)', difficulty: 'C', revision: 2, updatedAt: 9_000 })
    await archiveTemplate(database, 'tpl_seed_prayer_dhuhr', { activeUntil: d('2026-10-05'), updatedAt: 9_000 })

    const again = await ensureDefaultQuests(database, { startDate: d('2026-10-20'), now: noonOn('2026-10-20') })
    const templates = await listTemplates(database)

    expect(again.created).toEqual([])
    expect(templates).toHaveLength(6)
    expect(templates.find((template) => template.seedKey === 'prayer.fajr')?.title).toBe('Fajr (edited)')
    expect(templates.find((template) => template.seedKey === 'prayer.dhuhr')?.status).toBe('archived')
  })

  it('adds only the missing seeds and leaves other records intact', async () => {
    const custom = buildTemplate({ id: 'tpl_custom', title: 'Custom quest' })
    await createTemplate(database, custom)
    await createTemplate(
      database,
      buildTemplate({ id: 'tpl_seed_prayer_fajr', title: 'Fajr', seedKey: 'prayer.fajr', difficulty: 'E', activeFrom: d('2026-01-01') }),
    )

    const result = await ensureDefaultQuests(database, input)
    const templates = await listTemplates(database)

    expect(result.created).toEqual(['prayer.dhuhr', 'prayer.asr', 'prayer.maghrib', 'prayer.isha', 'sleep'])
    expect(templates).toHaveLength(7)
    expect(templates.find((template) => template.id === 'tpl_custom')).toEqual(custom)
    expect(templates.find((template) => template.seedKey === 'prayer.fajr')?.activeFrom).toBe(d('2026-01-01'))
  })

  it('treats a seed already present under any id as present', async () => {
    await createTemplate(
      database,
      buildTemplate({ id: 'tpl_imported_fajr', title: 'Fajr', seedKey: 'prayer.fajr' }),
    )

    const result = await ensureDefaultQuests(database, input)

    expect(result.created).not.toContain('prayer.fajr')
    expect((await listTemplates(database)).filter((template) => template.seedKey === 'prayer.fajr')).toHaveLength(1)
  })

  it('stays idempotent when two initializations run concurrently', async () => {
    const results = await Promise.all([
      ensureDefaultQuests(database, input),
      ensureDefaultQuests(database, input),
      ensureDefaultQuests(database, input),
    ])

    const templates = await listTemplates(database)
    expect(templates).toHaveLength(6)
    expect(new Set(templates.map((template) => template.seedKey)).size).toBe(6)
    // Every seed was created by exactly one of the concurrent runs.
    expect(results.flatMap((result) => result.created).sort()).toEqual(
      DEFAULT_QUEST_SEEDS.map((seed) => seed.seedKey).sort(),
    )
  })

  it('surfaces the original error when a constraint violation is NOT explained by the seed existing', async () => {
    // An unrelated template occupies the seed's deterministic id but carries no seed key.
    await createTemplate(database, buildTemplate({ id: 'tpl_seed_prayer_fajr', title: 'Unrelated', seedKey: null }))

    const attempt = ensureDefaultQuests(database, input)

    await expect(attempt).rejects.toBeInstanceOf(PersistenceError)
    await expect(attempt).rejects.toMatchObject({ code: 'constraint_violation' })
    // The unrelated template is untouched and nothing was claimed to be seeded.
    const fajr = (await listTemplates(database)).find((template) => template.id === 'tpl_seed_prayer_fajr')
    expect(fajr?.title).toBe('Unrelated')
    expect(fajr?.seedKey).toBeNull()
  })
})
