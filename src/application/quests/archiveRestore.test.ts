// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTemplate,
  getOccurrenceFor,
  getTemplate,
  listCompletionsByDate,
  listOccurrencesByDate,
  listTemplates,
  type PersistenceDatabase,
} from '@/persistence'
import { completeTodayQuest } from '../completion/completeTodayQuest'
import { initializeApplication } from '../initialize'
import { loadHome } from '../home'
import { buildFormValues, buildTemplate, createTestContext, d, noonOn, type TestContext } from '../test-utils/helpers'
import { readHistory } from '../test-utils/history'
import { archiveQuest } from './archiveQuest'
import { createQuest } from './createQuest'
import type { QuestFormValues } from './questForm'
import { restoreQuest } from './restoreQuest'

// 2026-10-05 is a Monday.
const MONDAY = '2026-10-05'

const opened: PersistenceDatabase[] = []
async function setup(dateKey = MONDAY): Promise<TestContext> {
  const testContext = await createTestContext(dateKey)
  opened.push(testContext.database)
  return testContext
}

afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

async function create(t: TestContext, overrides: Partial<QuestFormValues> = {}) {
  const result = await createQuest(t.context, buildFormValues(overrides, MONDAY))
  if (result.status !== 'created') throw new Error(`create failed: ${JSON.stringify(result)}`)
  return result.templateId
}

describe('archiveQuest', () => {
  it('A. with no occurrence today: archiving stops all future occurrences', async () => {
    const t = await setup()
    // Created directly so that nothing was materialized today although it is eligible.
    await createTemplate(t.database, buildTemplate({ id: 'tpl_a', title: 'Never shown' }))

    const result = await archiveQuest(t.context, 'tpl_a')

    expect(result.status).toBe('archived')
    expect(result.status === 'archived' && result.home?.today.quests).toEqual([])
    expect(await listOccurrencesByDate(t.database, d(MONDAY))).toEqual([])
    t.clock.set(noonOn('2026-10-06'))
    await loadHome(t.context)
    expect(await getOccurrenceFor(t.database, 'tpl_a', d('2026-10-06'))).toBeNull()
  })

  it('B. with an uncompleted occurrence today: it stays visible and completable, and keeps counting', async () => {
    const t = await setup()
    const easy = await create(t, { title: 'Easy' })
    const hard = await create(t, { title: 'Hard', difficulty: 'S' })
    await completeTodayQuest(t.context, `occ:${easy}@${MONDAY}`)

    const result = await archiveQuest(t.context, hard)

    expect(result.status).toBe('archived')
    const home = result.status === 'archived' ? result.home : null
    expect(home?.today.quests.map((quest) => [quest.title, quest.completed])).toEqual([
      ['Easy', true],
      ['Hard', false],
    ])
    expect(home?.today.progress).toMatchObject({ completedCount: 1, eligibleCount: 2, displayPercent: 50 })

    const completed = await completeTodayQuest(t.context, `occ:${hard}@${MONDAY}`)
    expect(completed.status).toBe('completed')
    expect(completed.status === 'completed' && completed.home?.player.totalExp).toBe(35 + 120)
  })

  it('C. with a completed occurrence: the occurrence, completion and EXP all remain', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Done', difficulty: 'B' })
    await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)
    const before = await readHistory(t.database, MONDAY)

    const result = await archiveQuest(t.context, id)

    expect(result.status).toBe('archived')
    expect(await readHistory(t.database, MONDAY)).toEqual(before)
    const home = result.status === 'archived' ? result.home : null
    expect(home?.today.quests.map((quest) => [quest.title, quest.completed])).toEqual([['Done', true]])
    expect(home?.today.progress).toMatchObject({ completedCount: 1, eligibleCount: 1, quality: 'perfect' })
    expect(home?.player.totalExp).toBe(55)
  })

  it('D. reloading Home after archiving still shows today’s occurrence', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Still here' })
    await archiveQuest(t.context, id)

    const reloaded = await initializeApplication(t.context)

    expect(reloaded.today.quests.map((quest) => quest.title)).toContain('Still here')
    expect(await listOccurrencesByDate(t.database, d(MONDAY))).toHaveLength(7) // 6 seeds + the archived quest's
  })

  it('E. on a later eligible date no new occurrence appears while archived', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Daily' })
    await archiveQuest(t.context, id)

    for (const date of ['2026-10-06', '2026-10-07', '2026-10-20']) {
      t.clock.set(noonOn(date))
      const home = await loadHome(t.context)
      expect(home.today.quests.map((quest) => quest.title)).not.toContain('Daily')
      expect(await getOccurrenceFor(t.database, id, d(date))).toBeNull()
    }
  })

  it('F. archiving a seeded template does not cause initialization to seed a copy', async () => {
    const t = await setup()
    await initializeApplication(t.context)

    const result = await archiveQuest(t.context, 'tpl_seed_prayer_fajr')
    expect(result.status).toBe('archived')
    t.clock.set(noonOn('2026-10-06'))
    const next = await initializeApplication(t.context)
    await initializeApplication(t.context)

    const templates = await listTemplates(t.database)
    expect(templates).toHaveLength(6)
    expect(templates.filter((template) => template.seedKey === 'prayer.fajr')).toHaveLength(1)
    expect(await getTemplate(t.database, 'tpl_seed_prayer_fajr')).toMatchObject({ status: 'archived', seedKey: 'prayer.fajr' })
    expect(next.today.quests.map((quest) => quest.title)).not.toContain('Fajr')
    expect(next.today.progress.eligibleCount).toBe(5)
  })

  it('marks the template archived (the authoritative state) and removes nothing else', async () => {
    const t = await setup()
    const id = await create(t, { title: 'To archive' })
    t.clock.set(noonOn(MONDAY) + 5_000)

    await archiveQuest(t.context, id)

    expect(await getTemplate(t.database, id)).toMatchObject({
      id,
      status: 'archived',
      title: 'To archive',
      revision: 1,
      updatedAt: noonOn(MONDAY) + 5_000,
    })
    expect(await listTemplates(t.database)).toHaveLength(1)
  })

  it('stores a valid activeUntil as compatibility bookkeeping (today for an ordinary quest)', async () => {
    const t = await setup()
    const id = await create(t)

    await archiveQuest(t.context, id)

    expect((await getTemplate(t.database, id))?.activeUntil).toBe(MONDAY)
  })

  it.each([
    ['a Daily quest that starts in the future', { startDate: '2026-10-20' }, '2026-10-20'],
    ['a one-time quest for a future date', { recurrence: 'one_time', questDate: '2026-10-12' } as const, '2026-10-12'],
    ['an interval quest that starts in the future', { recurrence: 'interval', intervalDays: '3', startDate: '2026-10-09' } as const, '2026-10-09'],
  ])('can archive %s (activeUntil never precedes its start or its date)', async (_label, overrides, expectedUntil) => {
    const t = await setup()
    const id = await create(t, overrides as Partial<QuestFormValues>)

    const result = await archiveQuest(t.context, id)

    expect(result.status).toBe('archived')
    expect(await getTemplate(t.database, id)).toMatchObject({ status: 'archived', activeUntil: expectedUntil })
  })

  it('is idempotent: archiving twice changes nothing the second time', async () => {
    const t = await setup()
    const id = await create(t)
    await archiveQuest(t.context, id)
    const once = await getTemplate(t.database, id)
    t.clock.set(noonOn(MONDAY) + 99_000)

    const again = await archiveQuest(t.context, id)

    expect(again.status).toBe('already_archived')
    expect(await getTemplate(t.database, id)).toEqual(once)
  })

  it('returns not_found for an unknown quest', async () => {
    const t = await setup()
    expect(await archiveQuest(t.context, 'tpl_nope')).toEqual({ status: 'not_found' })
  })

  it('fails safely and leaves the quest active when storage is unavailable', async () => {
    const t = await setup()
    const id = await create(t)
    t.database.close()

    const result = await archiveQuest(t.context, id)

    expect(result).toMatchObject({ status: 'failed', reason: 'database_unavailable' })
  })
})

describe('restoreQuest', () => {
  it('restores an archived quest with its identity, recurrence and history intact', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Come back', recurrence: 'weekdays', weekdays: [1, 3], difficulty: 'B' })
    await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)
    const archived = await archiveQuest(t.context, id)
    expect(archived.status).toBe('archived')
    const historyBefore = await readHistory(t.database, MONDAY)
    const storedBefore = await getTemplate(t.database, id)

    const result = await restoreQuest(t.context, id)

    expect(result.status).toBe('restored')
    expect(await getTemplate(t.database, id)).toEqual({
      ...storedBefore,
      status: 'active',
      activeUntil: null,
      updatedAt: noonOn(MONDAY),
    })
    expect(await readHistory(t.database, MONDAY)).toEqual(historyBefore)
  })

  it('keeps a seeded template’s seed key and id', async () => {
    const t = await setup()
    await initializeApplication(t.context)
    await archiveQuest(t.context, 'tpl_seed_sleep')

    const result = await restoreQuest(t.context, 'tpl_seed_sleep')

    expect(result.status).toBe('restored')
    expect(await getTemplate(t.database, 'tpl_seed_sleep')).toMatchObject({
      id: 'tpl_seed_sleep',
      seedKey: 'sleep',
      role: 'sleep',
      status: 'active',
      activeUntil: null,
    })
    await initializeApplication(t.context)
    expect(await listTemplates(t.database)).toHaveLength(6)
  })

  it('reuses today’s existing occurrence instead of creating a duplicate', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Round trip' })
    const before = await getOccurrenceFor(t.database, id, d(MONDAY))
    await archiveQuest(t.context, id)

    const result = await restoreQuest(t.context, id)

    expect(result.status).toBe('restored')
    expect(await getOccurrenceFor(t.database, id, d(MONDAY))).toEqual(before)
    expect(await listOccurrencesByDate(t.database, d(MONDAY))).toHaveLength(1)
    expect(result.status === 'restored' && result.home?.today.quests.map((quest) => quest.title)).toEqual(['Round trip'])
  })

  it('materializes today for a restored quest that is eligible today and has no occurrence', async () => {
    const t = await setup()
    await createTemplate(t.database, buildTemplate({ id: 'tpl_a', title: 'Never materialized' }))
    await archiveQuest(t.context, 'tpl_a')
    expect(await listOccurrencesByDate(t.database, d(MONDAY))).toEqual([])

    const result = await restoreQuest(t.context, 'tpl_a')

    expect(result.status === 'restored' && result.home?.today.quests.map((quest) => quest.title)).toEqual(['Never materialized'])
    expect(await getOccurrenceFor(t.database, 'tpl_a', d(MONDAY))).not.toBeNull()
  })

  it('resumes future occurrences, and creates none retroactively for the archived days', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Paused' })
    await archiveQuest(t.context, id)

    t.clock.set(noonOn('2026-10-08'))
    await loadHome(t.context)
    await restoreQuest(t.context, id)
    t.clock.set(noonOn('2026-10-09'))
    const next = await loadHome(t.context)

    expect(next.today.quests.map((quest) => quest.title)).toContain('Paused')
    for (const gap of ['2026-10-06', '2026-10-07']) {
      expect(await getOccurrenceFor(t.database, id, d(gap))).toBeNull()
    }
    expect(await getOccurrenceFor(t.database, id, d('2026-10-08'))).not.toBeNull() // restored that day
  })

  it('refuses to restore a one-time quest whose date has passed', async () => {
    const t = await setup()
    const id = await create(t, { recurrence: 'one_time', questDate: MONDAY })
    await archiveQuest(t.context, id)
    t.clock.set(noonOn('2026-10-06'))

    const result = await restoreQuest(t.context, id)

    expect(result).toEqual({ status: 'expired' })
    expect((await getTemplate(t.database, id))?.status).toBe('archived')
  })

  it('restores a one-time quest whose date is still ahead', async () => {
    const t = await setup()
    const id = await create(t, { recurrence: 'one_time', questDate: '2026-10-12' })
    await archiveQuest(t.context, id)

    const result = await restoreQuest(t.context, id)

    expect(result.status).toBe('restored')
    expect(await getTemplate(t.database, id)).toMatchObject({ status: 'active', activeUntil: null })
  })

  it('is idempotent for an active quest and reports not_found for an unknown one', async () => {
    const t = await setup()
    const id = await create(t)
    const before = await getTemplate(t.database, id)

    expect((await restoreQuest(t.context, id)).status).toBe('already_active')
    expect(await getTemplate(t.database, id)).toEqual(before)
    expect(await restoreQuest(t.context, 'tpl_nope')).toEqual({ status: 'not_found' })
  })

  it('does not touch the completions of the day when restoring', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Done' })
    await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)
    await archiveQuest(t.context, id)

    await restoreQuest(t.context, id)

    expect(await listCompletionsByDate(t.database, d(MONDAY))).toHaveLength(1)
  })
})
