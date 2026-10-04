// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { expRewardForDifficulty } from '@/domain'
import {
  getOccurrenceFor,
  getTemplate,
  listCompletionsByDate,
  listOccurrencesByDate,
  listTemplates,
  listXpTransactions,
  openDatabase,
  type PersistenceDatabase,
} from '@/persistence'
import { initializeApplication } from '../initialize'
import { buildFormValues, createTestContext, d, noonOn, type TestContext } from '../test-utils/helpers'
import { createQuest } from './createQuest'

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

async function created(context: TestContext['context'], overrides: Parameters<typeof buildFormValues>[0] = {}) {
  const result = await createQuest(context, buildFormValues(overrides, TODAY))
  if (result.status !== 'created') throw new Error(`expected created, got ${JSON.stringify(result)}`)
  return result
}

describe('createQuest — what is persisted', () => {
  it('creates a Daily quest with the right template fields', async () => {
    const { context, database, clock } = await setup()

    const result = await created(context, {
      title: '  Backtesting  ',
      difficulty: 'B',
      category: 'trading',
    })

    const template = await getTemplate(database, result.templateId)
    expect(template).toEqual({
      id: result.templateId,
      title: 'Backtesting',
      difficulty: 'B',
      category: 'trading',
      recurrence: { kind: 'daily' },
      role: 'standard',
      seedKey: null,
      activeFrom: TODAY,
      activeUntil: null,
      status: 'active',
      sortOrder: 0, // the first template goes to the bottom of an empty order
      revision: 1,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    })
  })

  it('creates a selected-weekday quest', async () => {
    const { context, database } = await setup()

    const { templateId } = await created(context, { recurrence: 'weekdays', weekdays: [5, 1, 3], category: 'fitness' })

    expect(await getTemplate(database, templateId)).toMatchObject({
      recurrence: { kind: 'weekdays', weekdays: [1, 3, 5] },
      category: 'fitness',
      activeFrom: TODAY,
    })
  })

  it('creates an interval quest anchored on its start date', async () => {
    const { context, database } = await setup()

    const { templateId } = await created(context, {
      recurrence: 'interval',
      intervalDays: '3',
      startDate: '2026-10-08',
    })

    expect(await getTemplate(database, templateId)).toMatchObject({
      recurrence: { kind: 'interval', everyNDays: 3, anchor: '2026-10-08' },
      activeFrom: '2026-10-08',
    })
  })

  it('creates a one-time quest on its date', async () => {
    const { context, database } = await setup()

    const { templateId } = await created(context, { recurrence: 'one_time', questDate: '2026-10-12' })

    expect(await getTemplate(database, templateId)).toMatchObject({
      recurrence: { kind: 'one_time', date: '2026-10-12' },
      activeFrom: TODAY,
      activeUntil: null,
    })
  })

  it('always creates a standard-role quest with no seed key', async () => {
    const { context, database } = await setup()

    const first = await created(context, { title: 'One' })
    const second = await created(context, { title: 'Two', recurrence: 'one_time', questDate: TODAY })

    for (const { templateId } of [first, second]) {
      expect(await getTemplate(database, templateId)).toMatchObject({ role: 'standard', seedKey: null })
    }
  })

  it('gives each quest its own fresh tpl_<uuid> id from the injected id source', async () => {
    const { context } = await setup()

    const a = await created(context, { title: 'A' })
    const b = await created(context, { title: 'B' })

    expect(a.templateId).toBe('tpl_00000000-0000-4000-8000-000000000001')
    expect(b.templateId).toBe('tpl_00000000-0000-4000-8000-000000000002')
  })

  it('derives the reward from difficulty alone: no EXP value is stored on the quest', async () => {
    const { context, database } = await setup()

    const { templateId } = await created(context, { difficulty: 'A' })

    const stored = await getTemplate(database, templateId)
    expect(Object.keys(stored ?? {}).filter((key) => /exp|reward|points|xp/i.test(key))).toEqual([])
    const occurrence = await getOccurrenceFor(database, templateId, d(TODAY))
    expect(occurrence?.snapshot.expReward).toBe(expRewardForDifficulty('A'))
    expect(occurrence?.snapshot.expReward).toBe(80)
  })

  it('takes createdAt and updatedAt from the single clock reading', async () => {
    const { context, database, clock } = await setup()
    clock.set(noonOn('2026-10-05') + 1234)

    const { templateId } = await created(context)

    expect(await getTemplate(database, templateId)).toMatchObject({
      createdAt: noonOn('2026-10-05') + 1234,
      updatedAt: noonOn('2026-10-05') + 1234,
    })
  })
})

describe('createQuest — validation and failure', () => {
  it('returns every field error and writes nothing for an invalid form', async () => {
    const { context, database } = await setup()

    const result = await createQuest(context, buildFormValues({ title: ' ', difficulty: '', category: 'x' }, TODAY))

    expect(result).toEqual({
      status: 'invalid',
      errors: { title: 'title_required', difficulty: 'difficulty_required', category: 'category_required' },
    })
    expect(await listTemplates(database)).toEqual([])
  })

  it('validates against the clock’s today, not the form’s idea of it', async () => {
    const { context, database } = await setup()

    const result = await createQuest(context, buildFormValues({ startDate: '2026-10-04' }, TODAY))

    expect(result).toEqual({ status: 'invalid', errors: { startDate: 'date_in_past' } })
    expect(await listTemplates(database)).toEqual([])
  })

  it('fails safely, creates nothing and hides raw errors when storage is unavailable', async () => {
    const { context, database, factory } = await setup()
    database.close()

    const result = await createQuest(context, buildFormValues({}, TODAY))

    expect(result).toMatchObject({ status: 'failed', reason: 'database_unavailable' })
    const inspect = await openDatabase({ factory })
    opened.push(inspect)
    expect(await listTemplates(inspect)).toEqual([])
  })

  it('fails safely when no random source is available (no id is invented)', async () => {
    const { context, database } = await setup()
    const broken = {
      ...context,
      ids: {
        uuid: () => {
          throw new Error('No cryptographic random source is available')
        },
      },
    }

    const result = await createQuest(broken, buildFormValues({}, TODAY))

    expect(result).toMatchObject({ status: 'failed', reason: 'unexpected' })
    expect(await listTemplates(database)).toEqual([])
  })

  it('still reports the quest as created when only the follow-up reload fails, and the loader heals it', async () => {
    const { context, database, factory } = await setup()
    // A corrupt occurrence for today makes the Home reload throw AFTER the template was saved.
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('solo-leveling-task-list')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = raw.transaction('questOccurrences', 'readwrite')
      tx.objectStore('questOccurrences').add({ id: 'occ:corrupt@2026-10-05', templateId: 'corrupt', dateKey: TODAY, junk: true })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    raw.close()

    const result = await createQuest(context, buildFormValues({ title: 'Saved anyway' }, TODAY))

    expect(result).toMatchObject({ status: 'created', home: null })
    expect((await listTemplates(database)).map((template) => template.title)).toEqual(['Saved anyway'])
  })
})

describe('createQuest — create-today semantics', () => {
  it('Daily created today appears today', async () => {
    const { context, database } = await setup()

    const result = await created(context, { title: 'Daily today' })

    expect(result.home?.today.quests.map((quest) => quest.title)).toEqual(['Daily today'])
    expect(await listOccurrencesByDate(database, d(TODAY))).toHaveLength(1)
  })

  it('a weekday quest containing today appears today', async () => {
    const { context } = await setup()

    const result = await created(context, { recurrence: 'weekdays', weekdays: [1, 4] }) // Mon, Thu

    expect(result.home?.today.quests).toHaveLength(1)
  })

  it('a weekday quest NOT containing today does not appear and has no occurrence', async () => {
    const { context, database } = await setup()

    const result = await created(context, { recurrence: 'weekdays', weekdays: [2, 3] }) // Tue, Wed

    expect(result.home?.today.quests).toEqual([])
    expect(await listOccurrencesByDate(database, d(TODAY))).toEqual([])
  })

  it('an interval quest anchored today appears today', async () => {
    const { context } = await setup()

    const result = await created(context, { recurrence: 'interval', intervalDays: '2', startDate: TODAY })

    expect(result.home?.today.quests).toHaveLength(1)
  })

  it('an interval quest with a future anchor does not appear today', async () => {
    const { context, database } = await setup()

    const result = await created(context, { recurrence: 'interval', intervalDays: '2', startDate: '2026-10-06' })

    expect(result.home?.today.quests).toEqual([])
    expect(await listOccurrencesByDate(database, d(TODAY))).toEqual([])
  })

  it('a one-time quest for today appears today', async () => {
    const { context } = await setup()

    const result = await created(context, { recurrence: 'one_time', questDate: TODAY })

    expect(result.home?.today.quests).toHaveLength(1)
  })

  it('a one-time quest for tomorrow does not appear today', async () => {
    const { context, database } = await setup()

    const result = await created(context, { recurrence: 'one_time', questDate: '2026-10-06' })

    expect(result.home?.today.quests).toEqual([])
    expect(await listOccurrencesByDate(database, d(TODAY))).toEqual([])
  })

  it('a Daily quest starting tomorrow does not appear today', async () => {
    const { context } = await setup()

    const result = await created(context, { startDate: '2026-10-06' })

    expect(result.home?.today.quests).toEqual([])
  })

  it('the daily denominator changes only when an occurrence actually exists', async () => {
    const { context } = await setup()
    const start = await initializeApplication(context)
    expect(start.today.progress).toMatchObject({ eligibleCount: 6, completedCount: 0 })

    const notToday = await created(context, { title: 'Tuesdays', recurrence: 'weekdays', weekdays: [2] })
    expect(notToday.home?.today.progress.eligibleCount).toBe(6)

    const today = await created(context, { title: 'Mondays', recurrence: 'weekdays', weekdays: [1] })
    expect(today.home?.today.progress.eligibleCount).toBe(7)
    expect(today.home?.today.progress.completedCount).toBe(0)
  })

  it('a quest that is not eligible today appears when it becomes eligible', async () => {
    const { context, clock } = await setup()
    await created(context, { title: 'Tomorrow only', recurrence: 'one_time', questDate: '2026-10-06' })

    clock.set(noonOn('2026-10-06'))
    const next = await initializeApplication(context)

    expect(next.today.quests.map((quest) => quest.title)).toContain('Tomorrow only')
  })

  it('never generates occurrences for earlier dates', async () => {
    const { context, database } = await setup()

    const { templateId } = await created(context, { startDate: TODAY })

    for (const earlier of ['2026-10-04', '2026-10-01', '2026-09-01']) {
      expect(await getOccurrenceFor(database, templateId, d(earlier))).toBeNull()
    }
  })

  it('does not complete the new quest and awards nothing', async () => {
    const { context, database } = await setup()

    const result = await created(context, { difficulty: 'S' })

    expect(result.home?.today.quests[0]?.completed).toBe(false)
    expect(await listXpTransactions(database)).toEqual([])
    expect(await listCompletionsByDate(database, d(TODAY))).toEqual([])
    expect(result.home?.player.totalExp).toBe(0)
  })
})
