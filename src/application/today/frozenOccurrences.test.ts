// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
  archiveTemplate,
  createTemplate,
  ensureOccurrence,
  getOccurrenceFor,
  listOccurrencesByDate,
  updateTemplate,
  type PersistenceDatabase,
} from '@/persistence'
import { completeTodayQuest } from '../completion/completeTodayQuest'
import { buildTemplate, createTestContext, d, noonOn, type TestContext } from '../test-utils/helpers'
import { loadToday } from './loadToday'

// 2026-10-05 is a Monday.
const TODAY = '2026-10-05'

const opened: PersistenceDatabase[] = []
async function setup(dateKey = TODAY): Promise<TestContext> {
  const testContext = await createTestContext(dateKey)
  opened.push(testContext.database)
  return testContext
}

afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

/** Persists a template and materializes today's occurrence from it, as a morning load would. */
async function materialized(testContext: TestContext, overrides: Parameters<typeof buildTemplate>[0]) {
  const template = buildTemplate(overrides)
  await createTemplate(testContext.database, template)
  await loadToday(testContext.context)
  return template
}

describe('loadToday — an existing occurrence is frozen and authoritative', () => {
  it('keeps today’s occurrence after its template is archived', async () => {
    const t = await setup()
    await materialized(t, { id: 'tpl_a', title: 'Hard task', difficulty: 'S' })

    await archiveTemplate(t.database, 'tpl_a', { activeUntil: d(TODAY), updatedAt: 9_000 })
    const today = await loadToday(t.context)

    expect(today.quests.map((quest) => [quest.title, quest.expReward])).toEqual([['Hard task', 120]])
    expect(today.progress).toMatchObject({ eligibleCount: 1, completedCount: 0 })
  })

  it('keeps today’s occurrence when the template is edited so it is no longer eligible today', async () => {
    const t = await setup()
    const template = await materialized(t, { id: 'tpl_a', title: 'Daily thing' })

    await updateTemplate(t.database, {
      ...template,
      recurrence: { kind: 'weekdays', weekdays: [2] }, // Tuesdays only; today is Monday
      revision: 2,
      updatedAt: 9_000,
    })
    const today = await loadToday(t.context)

    expect(today.quests.map((quest) => quest.title)).toEqual(['Daily thing'])
    expect(today.progress.eligibleCount).toBe(1)
  })

  it('keeps the frozen snapshot even though the template was edited (title, difficulty, category)', async () => {
    const t = await setup()
    const template = await materialized(t, { id: 'tpl_a', title: 'Before', difficulty: 'B', category: 'trading' })

    await updateTemplate(t.database, {
      ...template,
      title: 'After',
      difficulty: 'A',
      category: 'business',
      revision: 2,
      updatedAt: 9_000,
    })
    const today = await loadToday(t.context)

    expect(today.quests[0]).toMatchObject({ title: 'Before', difficulty: 'B', category: 'trading', expReward: 55 })
  })

  it('keeps an occurrence whose template no longer exists at all (foreign data)', async () => {
    const t = await setup()
    const template = buildTemplate({ id: 'tpl_ghost', title: 'Ghost' })
    const built = await ensureOccurrence(t.database, template, d(TODAY), noonOn(TODAY))
    expect(built.ok).toBe(true)

    const today = await loadToday(t.context)

    expect(today.quests.map((quest) => quest.title)).toEqual(['Ghost'])
    expect(today.progress.eligibleCount).toBe(1)
  })

  it('does not create or duplicate occurrences for an archived template, even one that is eligible today', async () => {
    const t = await setup()
    await createTemplate(t.database, buildTemplate({ id: 'tpl_a' }))
    await archiveTemplate(t.database, 'tpl_a', { activeUntil: d(TODAY), updatedAt: 9_000 })

    const today = await loadToday(t.context)

    expect(today.quests).toEqual([])
    expect(await listOccurrencesByDate(t.database, d(TODAY))).toEqual([])
  })

  it('creates an occurrence for a template that has none yet, next to existing orphaned ones', async () => {
    const t = await setup()
    await materialized(t, { id: 'tpl_old', title: 'Old', createdAt: 1 })
    await archiveTemplate(t.database, 'tpl_old', { activeUntil: d(TODAY), updatedAt: 9_000 })
    await createTemplate(t.database, buildTemplate({ id: 'tpl_new', title: 'New', createdAt: 2 }))

    const today = await loadToday(t.context)

    expect(today.quests.map((quest) => quest.title)).toEqual(['Old', 'New'])
    expect(today.progress.eligibleCount).toBe(2)
  })

  it('counts an archived, uncompleted occurrence in the denominator (a hard task cannot be archived away)', async () => {
    const t = await setup()
    await materialized(t, { id: 'tpl_easy', title: 'Easy', createdAt: 1 })
    await materialized(t, { id: 'tpl_hard', title: 'Hard', createdAt: 2 })
    await completeTodayQuest(t.context, `occ:tpl_easy@${TODAY}`)
    expect((await loadToday(t.context)).progress).toMatchObject({ completedCount: 1, eligibleCount: 2 })

    await archiveTemplate(t.database, 'tpl_hard', { activeUntil: d(TODAY), updatedAt: 9_000 })
    const today = await loadToday(t.context)

    expect(today.progress).toMatchObject({ completedCount: 1, eligibleCount: 2, displayPercent: 50 })
  })

  it('keeps an archived quest’s occurrence completable and awards its snapshot EXP once', async () => {
    const t = await setup()
    await materialized(t, { id: 'tpl_a', title: 'Hard', difficulty: 'B' })
    await archiveTemplate(t.database, 'tpl_a', { activeUntil: d(TODAY), updatedAt: 9_000 })

    const first = await completeTodayQuest(t.context, `occ:tpl_a@${TODAY}`)
    const second = await completeTodayQuest(t.context, `occ:tpl_a@${TODAY}`)

    expect(first.status).toBe('completed')
    expect(first.status === 'completed' && first.home?.player.totalExp).toBe(55)
    expect(second.status).toBe('already_completed')
    expect(second.status === 'already_completed' && second.home?.player.totalExp).toBe(55)
    const today = await loadToday(t.context)
    expect(today.quests[0]).toMatchObject({ title: 'Hard', completed: true })
  })

  it('keeps a completed, then archived occurrence visible as completed', async () => {
    const t = await setup()
    await materialized(t, { id: 'tpl_a', title: 'Done' })
    await completeTodayQuest(t.context, `occ:tpl_a@${TODAY}`)

    await archiveTemplate(t.database, 'tpl_a', { activeUntil: d(TODAY), updatedAt: 9_000 })
    const today = await loadToday(t.context)

    expect(today.quests.map((quest) => [quest.title, quest.completed])).toEqual([['Done', true]])
    expect(today.progress).toMatchObject({ completedCount: 1, eligibleCount: 1, quality: 'perfect' })
  })

  it('stops producing occurrences on later dates for an archived template', async () => {
    const t = await setup()
    await materialized(t, { id: 'tpl_a', title: 'Gone tomorrow' })
    await archiveTemplate(t.database, 'tpl_a', { activeUntil: d(TODAY), updatedAt: 9_000 })

    t.clock.set(noonOn('2026-10-06'))
    const tomorrow = await loadToday(t.context)

    expect(tomorrow.quests).toEqual([])
    expect(await getOccurrenceFor(t.database, 'tpl_a', d('2026-10-06'))).toBeNull()
    expect(await getOccurrenceFor(t.database, 'tpl_a', d(TODAY))).not.toBeNull()
  })

  it('orders orphaned occurrences by their template (seed order first, then creation order)', async () => {
    const t = await setup()
    await materialized(t, { id: 'tpl_late', title: 'Late', createdAt: 50 })
    await materialized(t, { id: 'tpl_early', title: 'Early', createdAt: 10 })
    await materialized(t, { id: 'tpl_seed_sleep', title: 'Sleep before 00:00', seedKey: 'sleep', role: 'sleep', createdAt: 99 })
    for (const id of ['tpl_late', 'tpl_early', 'tpl_seed_sleep']) {
      await archiveTemplate(t.database, id, { activeUntil: d(TODAY), updatedAt: 9_000 })
    }

    const today = await loadToday(t.context)

    expect(today.quests.map((quest) => quest.title)).toEqual(['Sleep before 00:00', 'Early', 'Late'])
  })

  it('is stable across repeated loads (same quests, no new rows)', async () => {
    const t = await setup()
    await materialized(t, { id: 'tpl_a', title: 'Alpha', createdAt: 1 })
    await archiveTemplate(t.database, 'tpl_a', { activeUntil: d(TODAY), updatedAt: 9_000 })
    await createTemplate(t.database, buildTemplate({ id: 'tpl_b', title: 'Beta', createdAt: 2 }))

    const first = await loadToday(t.context)
    const second = await loadToday(t.context)
    const third = await loadToday(t.context)

    expect(second).toEqual(first)
    expect(third).toEqual(first)
    expect(await listOccurrencesByDate(t.database, d(TODAY))).toHaveLength(2)
  })
})
