// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { createTemplate, type PersistenceDatabase } from '@/persistence'
import { initializeApplication } from '../initialize'
import { buildFormValues, buildTemplate, createTestContext, d, noonOn, type TestContext } from '../test-utils/helpers'
import { archiveQuest } from './archiveQuest'
import { createQuest } from './createQuest'
import { listQuestTemplates } from './listQuestTemplates'
import { loadQuestForEdit } from './loadQuestForEdit'

const MONDAY = '2026-10-05'

const opened: PersistenceDatabase[] = []
async function setup(): Promise<TestContext> {
  const testContext = await createTestContext(MONDAY)
  opened.push(testContext.database)
  return testContext
}

afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

async function list(t: TestContext) {
  const result = await listQuestTemplates(t.context)
  if (result.status !== 'ok') throw new Error('list failed')
  return result
}

describe('listQuestTemplates', () => {
  it('lists the defaults first in their natural order, then user quests by creation order', async () => {
    const t = await setup()
    await initializeApplication(t.context)
    t.clock.set(noonOn(MONDAY) + 1000)
    await createQuest(t.context, buildFormValues({ title: 'First custom' }, MONDAY))
    t.clock.set(noonOn(MONDAY) + 2000)
    await createQuest(t.context, buildFormValues({ title: 'Second custom' }, MONDAY))

    const { active, archived } = await list(t)

    expect(active.map((item) => item.title)).toEqual([
      'Fajr',
      'Dhuhr',
      'Asr',
      'Maghrib',
      'Isha',
      'Sleep before 00:00',
      'First custom',
      'Second custom',
    ])
    expect(archived).toEqual([])
  })

  it('does not change a quest’s position when it is edited (creation order is stable)', async () => {
    const t = await setup()
    t.clock.set(noonOn(MONDAY) + 1000)
    await createQuest(t.context, buildFormValues({ title: 'Older' }, MONDAY))
    t.clock.set(noonOn(MONDAY) + 2000)
    await createQuest(t.context, buildFormValues({ title: 'Newer' }, MONDAY))
    const before = (await list(t)).active.map((item) => item.templateId)

    const { updateQuest } = await import('./updateQuest')
    t.clock.set(noonOn(MONDAY) + 9000)
    await updateQuest(t.context, before[0]!, buildFormValues({ title: 'Older, edited', difficulty: 'S' }, MONDAY))

    expect((await list(t)).active.map((item) => item.templateId)).toEqual(before)
  })

  it('describes each quest with its recurrence, difficulty, derived reward and category', async () => {
    const t = await setup()
    await createQuest(
      t.context,
      buildFormValues({ title: 'Backtesting', recurrence: 'weekdays', weekdays: [1, 3, 5], difficulty: 'B', category: 'trading' }, MONDAY),
    )

    const { active } = await list(t)

    expect(active[0]).toMatchObject({
      title: 'Backtesting',
      recurrence: { kind: 'weekdays', weekdays: [1, 3, 5] },
      difficulty: 'B',
      expReward: 55,
      category: 'trading',
      status: 'active',
      datePassed: false,
      canRestore: false,
    })
  })

  it('moves archived quests to the archived list, restorable unless a one-time date has passed', async () => {
    const t = await setup()
    const daily = await createQuest(t.context, buildFormValues({ title: 'Daily' }, MONDAY))
    const once = await createQuest(t.context, buildFormValues({ title: 'Once', recurrence: 'one_time', questDate: MONDAY }, MONDAY))
    if (daily.status !== 'created' || once.status !== 'created') throw new Error('create failed')
    await archiveQuest(t.context, daily.templateId)
    await archiveQuest(t.context, once.templateId)
    t.clock.set(noonOn('2026-10-06'))

    const { active, archived } = await list(t)

    expect(active).toEqual([])
    expect(archived.map((item) => [item.title, item.status, item.canRestore, item.datePassed])).toEqual([
      ['Daily', 'archived', true, false],
      ['Once', 'archived', false, true],
    ])
  })

  it('flags an active one-time quest whose date has passed', async () => {
    const t = await setup()
    await createTemplate(
      t.database,
      buildTemplate({ id: 'tpl_old', title: 'Old', recurrence: { kind: 'one_time', date: d('2026-10-01') }, activeFrom: d('2026-09-30') }),
    )

    const { active } = await list(t)

    expect(active[0]).toMatchObject({ datePassed: true, canRestore: false, status: 'active' })
  })

  it('fails safely when storage is unavailable', async () => {
    const t = await setup()
    t.database.close()

    expect(await listQuestTemplates(t.context)).toMatchObject({ status: 'failed', reason: 'database_unavailable' })
  })
})

describe('loadQuestForEdit', () => {
  it('returns the stored values for an active quest', async () => {
    const t = await setup()
    const created = await createQuest(
      t.context,
      buildFormValues({ title: 'Gym', recurrence: 'interval', intervalDays: '3', startDate: '2026-10-08', difficulty: 'A', category: 'fitness' }, MONDAY),
    )
    if (created.status !== 'created') throw new Error('create failed')

    const result = await loadQuestForEdit(t.context, created.templateId)

    expect(result).toEqual({
      status: 'found',
      values: {
        title: 'Gym',
        recurrence: 'interval',
        difficulty: 'A',
        category: 'fitness',
        weekdays: [],
        startDate: '2026-10-08',
        intervalDays: '3',
        questDate: MONDAY,
      },
    })
  })

  it('does not expose internal fields for a seeded quest', async () => {
    const t = await setup()
    await initializeApplication(t.context)

    const result = await loadQuestForEdit(t.context, 'tpl_seed_sleep')

    expect(result.status).toBe('found')
    expect(JSON.stringify(result)).not.toMatch(/tpl_seed|seedKey|"role"|sleep"/)
  })

  it('reports an unknown id as not_found (never as a blank new quest)', async () => {
    const t = await setup()
    expect(await loadQuestForEdit(t.context, 'tpl_nope')).toEqual({ status: 'not_found' })
  })

  it('reports an archived quest as archived', async () => {
    const t = await setup()
    const created = await createQuest(t.context, buildFormValues({ title: 'Gone' }, MONDAY))
    if (created.status !== 'created') throw new Error('create failed')
    await archiveQuest(t.context, created.templateId)

    expect(await loadQuestForEdit(t.context, created.templateId)).toEqual({ status: 'archived', title: 'Gone' })
  })

  it('fails safely when storage is unavailable', async () => {
    const t = await setup()
    t.database.close()

    expect(await loadQuestForEdit(t.context, 'tpl_x')).toMatchObject({ status: 'failed', reason: 'database_unavailable' })
  })
})
