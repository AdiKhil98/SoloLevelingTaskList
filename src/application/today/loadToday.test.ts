// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
  archiveTemplate,
  completeQuestAtomically,
  createTemplate,
  getOccurrenceFor,
  listOccurrencesByDate,
  updateTemplate,
  type PersistenceDatabase,
} from '@/persistence'
import { ensureDefaultQuests } from '../seeds/ensureDefaultQuests'
import { buildTemplate, createTestContext, d, noonOn, ZONE, type TestContext } from '../test-utils/helpers'
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

describe('loadToday', () => {
  it('materializes an occurrence for every eligible template', async () => {
    const { context, database } = await setup()
    await createTemplate(database, buildTemplate({ id: 'tpl_a', title: 'Alpha' }))
    await createTemplate(database, buildTemplate({ id: 'tpl_b', title: 'Beta' }))

    const today = await loadToday(context)

    expect(today.dateKey).toBe(TODAY)
    expect(today.quests.map((quest) => quest.title)).toEqual(['Alpha', 'Beta'])
    expect(await listOccurrencesByDate(database, d(TODAY))).toHaveLength(2)
    expect(today.progress).toMatchObject({ eligibleCount: 2, completedCount: 0, quality: 'incomplete' })
  })

  it('reuses an existing occurrence instead of creating another', async () => {
    const { context, database } = await setup()
    await createTemplate(database, buildTemplate({ id: 'tpl_a' }))

    await loadToday(context)
    const first = await getOccurrenceFor(database, 'tpl_a', d(TODAY))
    await loadToday(context)
    await loadToday(context)
    const after = await getOccurrenceFor(database, 'tpl_a', d(TODAY))

    expect(await listOccurrencesByDate(database, d(TODAY))).toHaveLength(1)
    expect(after).toEqual(first)
  })

  it('keeps the persisted snapshot authoritative after the template changes', async () => {
    const { context, database } = await setup()
    const template = buildTemplate({ id: 'tpl_a', title: 'Original', difficulty: 'E' })
    await createTemplate(database, template)
    await loadToday(context)

    await updateTemplate(database, { ...template, title: 'Renamed', difficulty: 'S', revision: 2, updatedAt: 5_000 })
    const today = await loadToday(context)

    expect(today.quests).toHaveLength(1)
    expect(today.quests[0]).toMatchObject({ title: 'Original', difficulty: 'E', expReward: 10 })
  })

  it('does not show quests that are not eligible today', async () => {
    const { context, database } = await setup()
    await createTemplate(database, buildTemplate({ id: 'tpl_daily', title: 'Daily' }))
    await createTemplate(
      database,
      buildTemplate({ id: 'tpl_tue', title: 'Tuesdays', recurrence: { kind: 'weekdays', weekdays: [2] } }),
    )
    await createTemplate(
      database,
      buildTemplate({ id: 'tpl_later', title: 'Starts later', activeFrom: d('2026-10-06') }),
    )
    await createTemplate(
      database,
      buildTemplate({ id: 'tpl_over', title: 'Ended', activeUntil: d('2026-10-04') }),
    )
    await createTemplate(
      database,
      buildTemplate({ id: 'tpl_once', title: 'Tomorrow only', recurrence: { kind: 'one_time', date: d('2026-10-06') } }),
    )

    const today = await loadToday(context)

    expect(today.quests.map((quest) => quest.title)).toEqual(['Daily'])
    expect(today.progress.eligibleCount).toBe(1)
    expect(await listOccurrencesByDate(database, d(TODAY))).toHaveLength(1)
  })

  it('works generically for non-daily recurrences (weekday, interval, one-time)', async () => {
    const { context, database } = await setup()
    await createTemplate(
      database,
      buildTemplate({
        id: 'tpl_mon',
        title: 'Mondays',
        createdAt: 1,
        recurrence: { kind: 'weekdays', weekdays: [1, 3] },
      }),
    )
    await createTemplate(
      database,
      buildTemplate({
        id: 'tpl_every3',
        title: 'Every 3 days',
        createdAt: 2,
        // 2026-10-02 + 3 days = 2026-10-05
        recurrence: { kind: 'interval', everyNDays: 3, anchor: d('2026-10-02') },
      }),
    )
    await createTemplate(
      database,
      buildTemplate({
        id: 'tpl_once',
        title: 'Today only',
        createdAt: 3,
        recurrence: { kind: 'one_time', date: d(TODAY) },
      }),
    )
    await createTemplate(
      database,
      buildTemplate({
        id: 'tpl_off',
        title: 'Off day interval',
        createdAt: 4,
        // 2026-10-03 + 2 days = 10-05 would match; 10-04 anchor does not.
        recurrence: { kind: 'interval', everyNDays: 2, anchor: d('2026-10-04') },
      }),
    )

    const today = await loadToday(context)

    expect(today.quests.map((quest) => quest.title)).toEqual(['Mondays', 'Every 3 days', 'Today only'])
    expect(today.quests.map((quest) => quest.occurrenceId)).toEqual([
      `occ:tpl_mon@${TODAY}`,
      `occ:tpl_every3@${TODAY}`,
      `occ:tpl_once@${TODAY}`,
    ])
    expect(today.progress.eligibleCount).toBe(3)
  })

  it('joins completion state and counts every eligible occurrence in the daily progress', async () => {
    const { context, database } = await setup()
    await createTemplate(database, buildTemplate({ id: 'tpl_a', title: 'Alpha', createdAt: 1 }))
    await createTemplate(database, buildTemplate({ id: 'tpl_b', title: 'Beta', createdAt: 2 }))
    await createTemplate(database, buildTemplate({ id: 'tpl_c', title: 'Gamma', createdAt: 3 }))
    await loadToday(context)

    const completedAt = noonOn(TODAY)
    const result = await completeQuestAtomically(database, {
      occurrenceId: `occ:tpl_b@${TODAY}`,
      completedAt,
      timeZone: ZONE,
    })
    expect(result.status).toBe('completed')

    const today = await loadToday(context)
    expect(today.quests.map((quest) => [quest.title, quest.completed])).toEqual([
      ['Alpha', false],
      ['Beta', true],
      ['Gamma', false],
    ])
    expect(today.quests[1]?.completedAt).toBe(completedAt)
    expect(today.quests[0]?.completedAt).toBeNull()
    expect(today.progress).toMatchObject({
      eligibleCount: 3,
      completedCount: 1,
      displayPercent: 33,
      quality: 'incomplete',
    })
  })

  it('supports a day with no eligible quests', async () => {
    const { context, database } = await setup()
    await createTemplate(
      database,
      buildTemplate({ id: 'tpl_tue', title: 'Tuesdays', recurrence: { kind: 'weekdays', weekdays: [2] } }),
    )

    const today = await loadToday(context)

    expect(today.quests).toEqual([])
    expect(today.progress).toMatchObject({
      eligibleCount: 0,
      completedCount: 0,
      quality: 'no_active_quests',
      displayPercent: null,
    })
  })

  it('loads an empty day from a brand-new database', async () => {
    const { context } = await setup()

    const today = await loadToday(context)

    expect(today.quests).toEqual([])
    expect(today.progress.quality).toBe('no_active_quests')
  })

  it('ignores archived templates', async () => {
    const { context, database } = await setup()
    await createTemplate(database, buildTemplate({ id: 'tpl_a', title: 'Alpha' }))
    await archiveTemplate(database, 'tpl_a', { activeUntil: d('2026-10-04'), updatedAt: 2_000 })

    const today = await loadToday(context)

    expect(today.quests).toEqual([])
  })

  it('keeps a quest that already exists in its place and appends the default quests after it', async () => {
    const { context, database } = await setup()
    await createTemplate(database, buildTemplate({ id: 'tpl_aaa', title: 'AAA custom', createdAt: 5 }))
    await ensureDefaultQuests(database, { startDate: d(TODAY), now: noonOn(TODAY) })

    const today = await loadToday(context)

    expect(today.quests.map((quest) => quest.title)).toEqual([
      'AAA custom',
      'Fajr',
      'Dhuhr',
      'Asr',
      'Maghrib',
      'Isha',
      'Sleep before 00:00',
    ])
  })

  it('reads the date from the injected clock', async () => {
    const { context, clock, database } = await setup()
    await createTemplate(
      database,
      buildTemplate({ id: 'tpl_tue', title: 'Tuesdays', recurrence: { kind: 'weekdays', weekdays: [2] } }),
    )
    expect((await loadToday(context)).quests).toEqual([])

    clock.set(noonOn('2026-10-06'))
    const tuesday = await loadToday(context)

    expect(tuesday.dateKey).toBe('2026-10-06')
    expect(tuesday.quests.map((quest) => quest.title)).toEqual(['Tuesdays'])
  })
})
