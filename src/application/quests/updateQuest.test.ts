// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTemplate,
  getOccurrenceFor,
  getTemplate,
  listOccurrencesByDate,
  listTemplates,
  type PersistenceDatabase,
} from '@/persistence'
import { completeTodayQuest } from '../completion/completeTodayQuest'
import { initializeApplication } from '../initialize'
import { buildFormValues, buildTemplate, createTestContext, d, noonOn, type TestContext } from '../test-utils/helpers'
import { archiveQuest } from './archiveQuest'
import { createQuest } from './createQuest'
import { formValuesFromTemplate, type QuestFormValues } from './questForm'
import { updateQuest } from './updateQuest'

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

async function create(t: TestContext, overrides: Partial<QuestFormValues> = {}, today = MONDAY) {
  const result = await createQuest(t.context, buildFormValues(overrides, today))
  if (result.status !== 'created') throw new Error(`create failed: ${JSON.stringify(result)}`)
  return result.templateId
}

async function edit(t: TestContext, templateId: string, overrides: Partial<QuestFormValues>) {
  const template = await getTemplate(t.database, templateId)
  if (template === null) throw new Error('missing template')
  const base = formValuesFromTemplate(template, d(MONDAY))
  return updateQuest(t.context, templateId, { ...base, ...overrides })
}

describe('updateQuest — the frozen-occurrence rule', () => {
  it('leaves today’s stored occurrence identical in every snapshotted field after editing title, difficulty, category and recurrence', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Backtesting', difficulty: 'B', category: 'trading' })
    const before = await getOccurrenceFor(t.database, id, d(MONDAY))
    expect(before?.snapshot).toMatchObject({ title: 'Backtesting', difficulty: 'B', expReward: 55, category: 'trading' })

    const result = await edit(t, id, {
      title: 'Renamed',
      difficulty: 'A',
      category: 'business',
      recurrence: 'weekdays',
      weekdays: [1, 3, 5],
    })

    expect(result.status).toBe('updated')
    const after = await getOccurrenceFor(t.database, id, d(MONDAY))
    expect(after).toEqual(before)
    expect(result.status === 'updated' && result.home?.today.quests[0]).toMatchObject({
      title: 'Backtesting',
      difficulty: 'B',
      expReward: 55,
      category: 'trading',
    })
  })

  it('applies the edited values to the NEXT eligible occurrence', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Backtesting', difficulty: 'B', category: 'trading' })
    await edit(t, id, { title: 'Renamed', difficulty: 'A', category: 'business', recurrence: 'weekdays', weekdays: [1, 3, 5] })

    t.clock.set(noonOn('2026-10-07')) // Wednesday
    const wednesday = await initializeApplication(t.context)

    expect(wednesday.today.quests.map((quest) => [quest.title, quest.difficulty, quest.category, quest.expReward])).toContainEqual([
      'Renamed',
      'A',
      'business',
      80,
    ])
    const occurrence = await getOccurrenceFor(t.database, id, d('2026-10-07'))
    expect(occurrence).toMatchObject({ templateRevision: 2, snapshot: { recurrenceKind: 'weekdays', expReward: 80 } })
    // The old day is still what it was.
    expect((await getOccurrenceFor(t.database, id, d(MONDAY)))?.snapshot).toMatchObject({ title: 'Backtesting', expReward: 55 })
  })

  it('does not create a Tuesday occurrence after switching to Mon/Wed/Fri', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Gym' })
    await edit(t, id, { recurrence: 'weekdays', weekdays: [1, 3, 5] })

    t.clock.set(noonOn('2026-10-06')) // Tuesday
    await initializeApplication(t.context)

    expect(await getOccurrenceFor(t.database, id, d('2026-10-06'))).toBeNull()
  })

  it('keeps today’s occurrence when a Daily quest is edited to Monday-only on a Friday', async () => {
    const t = await setup('2026-10-09') // Friday
    const id = await create(t, { title: 'Daily at first' }, '2026-10-09')

    const result = await edit(t, id, { recurrence: 'weekdays', weekdays: [1] })

    expect(result.status).toBe('updated')
    expect(result.status === 'updated' && result.home?.today.quests.map((quest) => quest.title)).toEqual(['Daily at first'])
    expect(await getOccurrenceFor(t.database, id, d('2026-10-09'))).not.toBeNull()
    expect(result.status === 'updated' && result.home?.today.progress.eligibleCount).toBe(1)
  })

  it('materializes today for a quest that becomes eligible today because of the edit', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Starts tomorrow', startDate: '2026-10-06' })
    expect(await listOccurrencesByDate(t.database, d(MONDAY))).toEqual([])

    const result = await edit(t, id, { startDate: MONDAY })

    expect(result.status).toBe('updated')
    expect(result.status === 'updated' && result.home?.today.quests.map((quest) => quest.title)).toEqual(['Starts tomorrow'])
  })

  it('fabricates no occurrence for an edit that makes the quest ineligible today when none existed', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Tuesday thing', recurrence: 'weekdays', weekdays: [2] })

    const result = await edit(t, id, { recurrence: 'weekdays', weekdays: [2, 3] })

    expect(result.status === 'updated' && result.home?.today.quests).toEqual([])
    expect(await listOccurrencesByDate(t.database, d(MONDAY))).toEqual([])
  })

  it('keeps the completion, the XP and the visible state when a completed quest is edited', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Done already', difficulty: 'B' })
    const completed = await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)
    expect(completed.status).toBe('completed')

    const result = await edit(t, id, { difficulty: 'S', title: 'Done already (edited)' })

    expect(result.status).toBe('updated')
    const quest = result.status === 'updated' ? result.home?.today.quests[0] : undefined
    expect(quest).toMatchObject({ title: 'Done already', completed: true, expReward: 55 })
    expect(result.status === 'updated' && result.home?.player.totalExp).toBe(55)
  })
})

describe('updateQuest — one-time quests', () => {
  it('does not mutate or move an existing occurrence when the date is changed later', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Appointment', recurrence: 'one_time', questDate: MONDAY, difficulty: 'C' })
    const before = await getOccurrenceFor(t.database, id, d(MONDAY))

    const result = await edit(t, id, { questDate: '2026-10-12', title: 'Appointment (moved)', difficulty: 'A' })

    expect(result.status).toBe('updated')
    expect(await getOccurrenceFor(t.database, id, d(MONDAY))).toEqual(before)
    expect(result.status === 'updated' && result.home?.today.quests.map((quest) => quest.title)).toEqual(['Appointment'])

    t.clock.set(noonOn('2026-10-12'))
    const later = await initializeApplication(t.context)
    expect(later.today.quests.map((quest) => [quest.title, quest.expReward])).toContainEqual(['Appointment (moved)', 80])
  })

  it('lets the new date control eligibility when no occurrence exists yet', async () => {
    const t = await setup()
    const id = await create(t, { recurrence: 'one_time', questDate: '2026-10-08' })

    const moved = await edit(t, id, { questDate: '2026-10-09' })
    expect(moved.status).toBe('updated')

    t.clock.set(noonOn('2026-10-08'))
    const originalDate = await initializeApplication(t.context)
    expect(originalDate.today.quests.map((quest) => quest.title)).not.toContain('Test quest')
    expect(await getOccurrenceFor(t.database, id, d('2026-10-08'))).toBeNull()

    t.clock.set(noonOn('2026-10-09'))
    const onTheDay = await initializeApplication(t.context)
    expect(onTheDay.today.quests.map((quest) => quest.title)).toContain('Test quest')
  })
})

describe('updateQuest — identity is preserved', () => {
  it('keeps id, createdAt, status and creation order; bumps revision and updatedAt', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Original' })
    const before = await getTemplate(t.database, id)
    t.clock.set(noonOn(MONDAY) + 60_000)

    await edit(t, id, { title: 'Edited', difficulty: 'D' })

    const after = await getTemplate(t.database, id)
    expect(after).toMatchObject({
      id,
      title: 'Edited',
      difficulty: 'D',
      createdAt: before?.createdAt,
      status: 'active',
      role: 'standard',
      seedKey: null,
      revision: 2,
      updatedAt: noonOn(MONDAY) + 60_000,
    })
  })

  it('keeps a seeded template’s id, seed key and role when it is edited (Sleep keeps its semantic role)', async () => {
    const t = await setup()
    await initializeApplication(t.context)
    const before = await getTemplate(t.database, 'tpl_seed_sleep')

    const result = await edit(t, 'tpl_seed_sleep', {
      title: 'Sleep before 23:30',
      difficulty: 'C',
      recurrence: 'weekdays',
      weekdays: [1, 2, 3, 4, 7],
    })

    expect(result.status).toBe('updated')
    const after = await getTemplate(t.database, 'tpl_seed_sleep')
    expect(after).toMatchObject({
      id: 'tpl_seed_sleep',
      seedKey: 'sleep',
      role: 'sleep',
      createdAt: before?.createdAt,
      title: 'Sleep before 23:30',
      revision: 2,
    })
    // Initialization still sees the seed as present and creates nothing.
    await initializeApplication(t.context)
    expect(await listTemplates(t.database)).toHaveLength(6)
  })

  it('preserves a stored description that the form never shows', async () => {
    const t = await setup()
    await createTemplate(t.database, { ...buildTemplate({ id: 'tpl_described' }), description: 'Notes the form does not edit' })

    await edit(t, 'tpl_described', { title: 'Renamed' })

    expect(await getTemplate(t.database, 'tpl_described')).toMatchObject({
      title: 'Renamed',
      description: 'Notes the form does not edit',
    })
  })

  it('cannot carry an EXP value: the edited template has no EXP field', async () => {
    const t = await setup()
    const id = await create(t)

    await edit(t, id, { difficulty: 'S' })

    const stored = await getTemplate(t.database, id)
    expect(Object.keys(stored ?? {}).filter((key) => /exp|reward|points|xp/i.test(key))).toEqual([])
  })
})

describe('updateQuest — guards and failures', () => {
  it('reports invalid input, listing every field, and changes nothing', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Keep me' })
    const before = await getTemplate(t.database, id)

    const result = await edit(t, id, { title: '', recurrence: 'weekdays', weekdays: [] })

    expect(result).toEqual({
      status: 'invalid',
      errors: { title: 'title_required', weekdays: 'weekdays_required' },
    })
    expect(await getTemplate(t.database, id)).toEqual(before)
  })

  it('returns not_found for an unknown id and creates nothing', async () => {
    const t = await setup()

    const result = await updateQuest(t.context, 'tpl_nope', buildFormValues({}, MONDAY))

    expect(result).toEqual({ status: 'not_found' })
    expect(await listTemplates(t.database)).toEqual([])
  })

  it('refuses to edit an archived quest and never resurrects it (a stale form from another tab)', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Stale form' })
    const staleValues = formValuesFromTemplate((await getTemplate(t.database, id))!, d(MONDAY))
    await archiveQuest(t.context, id)

    const result = await updateQuest(t.context, id, { ...staleValues, title: 'Edited late' })

    expect(result).toEqual({ status: 'archived' })
    expect(await getTemplate(t.database, id)).toMatchObject({ status: 'archived', title: 'Stale form' })
  })

  it('fails safely, leaving the stored quest unchanged, when storage is unavailable', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Unchanged' })
    t.database.close()

    const result = await updateQuest(t.context, id, buildFormValues({ title: 'Never saved' }, MONDAY))

    expect(result).toMatchObject({ status: 'failed', reason: 'database_unavailable' })
  })
})
