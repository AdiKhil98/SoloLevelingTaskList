// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { DATABASE_NAME, getTemplate, listOccurrencesByDate, openDatabase, type PersistenceDatabase } from '@/persistence'
import { completeTodayQuest } from '../completion/completeTodayQuest'
import { loadHome, synchronizeAndLoadHome } from '../home'
import { initializeApplication } from '../initialize'
import { DEFAULT_QUEST_SEEDS } from '../seeds/defaultQuests'
import { buildFormValues, createSequentialIds, createTestContext, d, noonOn, type TestContext } from '../test-utils/helpers'
import { readHistory } from '../test-utils/history'
import { loadWeeklyEditor } from '../weekly/loadWeeklyEditor'
import { archiveQuest } from './archiveQuest'
import { createQuest } from './createQuest'
import { listQuestTemplates } from './listQuestTemplates'
import { loadQuestForEdit } from './loadQuestForEdit'
import type { QuestFormValues } from './questForm'
import { reorderQuests } from './reorderQuests'
import { restoreQuest } from './restoreQuest'
import { updateQuest } from './updateQuest'

// 2026-10-05 is a Monday.
const MONDAY = '2026-10-05'
const TUESDAY = '2026-10-06'

const SEED_IDS = DEFAULT_QUEST_SEEDS.map((seed) => seed.templateId)
const FAJR = 'tpl_seed_prayer_fajr'
const DHUHR = 'tpl_seed_prayer_dhuhr'
const ASR = 'tpl_seed_prayer_asr'
const SLEEP = 'tpl_seed_sleep'

const opened: PersistenceDatabase[] = []
async function setup(dateKey = MONDAY): Promise<TestContext> {
  const testContext = await createTestContext(dateKey)
  opened.push(testContext.database)
  await initializeApplication(testContext.context)
  return testContext
}

afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

async function create(t: TestContext, title: string, overrides: Partial<QuestFormValues> = {}): Promise<string> {
  const result = await createQuest(t.context, buildFormValues({ title, ...overrides }, MONDAY))
  if (result.status !== 'created') throw new Error(`create failed: ${JSON.stringify(result)}`)
  return result.templateId
}

async function activeIds(t: TestContext): Promise<string[]> {
  const list = await listQuestTemplates(t.context)
  if (list.status !== 'ok') throw new Error('list failed')
  return list.active.map((item) => item.templateId)
}

async function homeTitles(t: TestContext): Promise<string[]> {
  return (await loadHome(t.context)).today.quests.map((quest) => quest.title)
}

async function move(t: TestContext, newOrder: readonly string[]) {
  return reorderQuests(t.context, { expectedOrder: await activeIds(t), newOrder })
}

describe('the initial order', () => {
  it('a fresh install lists the six default quests in their approved order, on Home and in Quests', async () => {
    const t = await setup()
    expect(await activeIds(t)).toEqual(SEED_IDS)
    expect(await homeTitles(t)).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00'])
  })

  it('guards the version-frozen v4 migration: the default quests are still the six it knows, in the same order', () => {
    expect(DEFAULT_QUEST_SEEDS.map((seed) => seed.seedKey)).toEqual([
      'prayer.fajr',
      'prayer.dhuhr',
      'prayer.asr',
      'prayer.maghrib',
      'prayer.isha',
      'sleep',
    ])
  })

  it('a new quest goes to the bottom, and the next one below it', async () => {
    const t = await setup()
    const first = await create(t, 'Backtesting')
    const second = await create(t, 'Gym')
    expect(await activeIds(t)).toEqual([...SEED_IDS, first, second])
    expect(await homeTitles(t)).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00', 'Backtesting', 'Gym'])
  })
})

describe('reorderQuests', () => {
  it('moves a seeded prayer anywhere: below a custom quest, to the very top, to the very bottom', async () => {
    const t = await setup()
    const custom = await create(t, 'Drink water')

    expect(await move(t, [custom, ...SEED_IDS])).toMatchObject({ status: 'reordered' })
    expect(await homeTitles(t)).toEqual(['Drink water', 'Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00'])

    expect(await move(t, [custom, SEED_IDS[1]!, SEED_IDS[2]!, SEED_IDS[3]!, SEED_IDS[4]!, SEED_IDS[5]!, FAJR])).toMatchObject({ status: 'reordered' })
    expect(await homeTitles(t)).toEqual(['Drink water', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00', 'Fajr'])

    expect(await move(t, [SLEEP, custom, DHUHR, ASR, SEED_IDS[3]!, SEED_IDS[4]!, FAJR])).toMatchObject({ status: 'reordered' })
    expect((await homeTitles(t))[0]).toBe('Sleep before 00:00')
  })

  it('moves a custom quest anywhere, and there is no prayer-first rule', async () => {
    const t = await setup()
    const wake = await create(t, 'Wake up at 06:00')
    const water = await create(t, 'Drink water')
    const gym = await create(t, 'Gym')
    const order = [wake, water, FAJR, gym, SEED_IDS[1]!, SEED_IDS[2]!, SEED_IDS[3]!, SEED_IDS[4]!, SLEEP]
    expect(await move(t, order)).toMatchObject({ status: 'reordered' })
    expect(await activeIds(t)).toEqual(order)
    expect(await homeTitles(t)).toEqual(['Wake up at 06:00', 'Drink water', 'Fajr', 'Gym', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00'])
  })

  it('stays deterministic through repeated reorders', async () => {
    const t = await setup()
    const rotate = (ids: readonly string[]) => [...ids.slice(1), ids[0]!]
    let expected: readonly string[] = SEED_IDS
    for (let round = 0; round < 8; round += 1) {
      expected = rotate(expected)
      expect(await move(t, expected)).toMatchObject({ status: 'reordered' })
      expect(await activeIds(t)).toEqual(expected)
    }
  })

  it('persists across a restart (a new handle on the same stored data)', async () => {
    const t = await setup()
    const order = [...SEED_IDS].reverse()
    await move(t, order)

    const reopened = await openDatabase({ factory: t.factory })
    opened.push(reopened)
    const second = { ...t, context: { ...t.context, database: reopened, ids: createSequentialIds() }, database: reopened }
    expect(await activeIds(second)).toEqual(order)
    expect((await loadHome(second.context)).today.quests.map((quest) => quest.templateId)).toEqual(order)
  })

  it('persists across the day rolling over: tomorrow uses the same order', async () => {
    const t = await setup()
    const order = [SLEEP, FAJR, DHUHR, ASR, SEED_IDS[3]!, SEED_IDS[4]!]
    await move(t, order)

    t.clock.set(noonOn(TUESDAY))
    const { home } = await synchronizeAndLoadHome(t.context, 'resume')

    expect(home.today.dateKey).toBe(TUESDAY)
    expect(home.today.quests.map((quest) => quest.templateId)).toEqual(order)
  })

  it('applies one stored order to every day: a quest that appears only on some days keeps its place when it does', async () => {
    const t = await setup()
    const mondays = await create(t, 'Mondays only', { recurrence: 'weekdays', weekdays: [1] })
    await move(t, [mondays, ...SEED_IDS])

    expect((await homeTitles(t))[0]).toBe('Mondays only')
    t.clock.set(noonOn(TUESDAY))
    const tuesday = await synchronizeAndLoadHome(t.context, 'resume')
    expect(tuesday.home.today.quests.map((quest) => quest.title)).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00'])
    t.clock.set(noonOn('2026-10-12')) // next Monday
    const monday = await synchronizeAndLoadHome(t.context, 'resume')
    expect(monday.home.today.quests[0]?.title).toBe('Mondays only')
  })

  it('reports "unchanged" without writing when the order is the same', async () => {
    const t = await setup()
    const before = await Promise.all(SEED_IDS.map((id) => getTemplate(t.database, id)))
    expect(await move(t, SEED_IDS)).toEqual({ status: 'unchanged', order: SEED_IDS })
    expect(await Promise.all(SEED_IDS.map((id) => getTemplate(t.database, id)))).toEqual(before)
  })

  it('refuses a stale view (another tab changed the quests) and an impossible order, writing nothing', async () => {
    const t = await setup()
    const seen = await activeIds(t)
    const added = await create(t, 'Added in another tab')

    expect(await reorderQuests(t.context, { expectedOrder: seen, newOrder: [...seen].reverse() })).toEqual({
      status: 'stale',
      currentOrder: [...SEED_IDS, added],
    })
    expect(await activeIds(t)).toEqual([...SEED_IDS, added])

    expect(await reorderQuests(t.context, { expectedOrder: [...SEED_IDS, added], newOrder: [...SEED_IDS, 'tpl_unknown'] })).toEqual({
      status: 'invalid',
      currentOrder: [...SEED_IDS, added],
    })
    expect(await activeIds(t)).toEqual([...SEED_IDS, added])
  })

  it('two tabs: the second tab’s reorder from an outdated view is refused, never silently applied', async () => {
    const tabA = await setup()
    const tabB: TestContext = (() => ({ ...tabA }))()
    const seenByB = await activeIds(tabB)

    const a = await reorderQuests(tabA.context, { expectedOrder: seenByB, newOrder: [SLEEP, ...SEED_IDS.slice(0, 5)] })
    const b = await reorderQuests(tabB.context, { expectedOrder: seenByB, newOrder: [...SEED_IDS].reverse() })

    expect(a.status).toBe('reordered')
    expect(b).toMatchObject({ status: 'stale', currentOrder: [SLEEP, ...SEED_IDS.slice(0, 5)] })
    expect(await activeIds(tabA)).toEqual([SLEEP, ...SEED_IDS.slice(0, 5)])
  })

  it('goes through the day gate like every other change: refused while the clock is behind or a day is unfinalized', async () => {
    const t = await setup()
    t.clock.set(noonOn('2026-10-07'))
    await synchronizeAndLoadHome(t.context, 'resume') // Monday and Tuesday are finalized; Wednesday is the active day
    const stored = await activeIds(t)

    t.clock.set(noonOn(MONDAY)) // behind the recorded Wednesday
    expect(await move(t, [...stored].reverse())).toMatchObject({ status: 'failed', reason: 'clock_behind' })

    t.clock.set(noonOn('2026-10-09')) // days passed with no reconciliation
    expect(await move(t, [...stored].reverse())).toMatchObject({ status: 'failed', reason: 'day_not_synchronized' })
    expect(await activeIds(t)).toEqual(stored)
  })
})

describe('reordering is presentation only: it never touches gameplay data', () => {
  it('leaves today’s occurrences, completions, the EXP ledger and the daily count exactly as they were', async () => {
    const t = await setup()
    await completeTodayQuest(t.context, `occ:${FAJR}@${MONDAY}`)
    const before = await readHistory(t.database, MONDAY)
    const homeBefore = await loadHome(t.context)

    await move(t, [...SEED_IDS].reverse())

    expect(await readHistory(t.database, MONDAY)).toEqual(before)
    const homeAfter = await loadHome(t.context)
    expect(homeAfter.today.progress).toEqual(homeBefore.today.progress)
    expect(homeAfter.player).toEqual(homeBefore.player)
    expect(homeAfter.today.quests.map((quest) => quest.templateId)).toEqual([...SEED_IDS].reverse())
  })

  it('does not change a template’s revision, updatedAt or any field except the order', async () => {
    const t = await setup()
    const before = await Promise.all(SEED_IDS.map((id) => getTemplate(t.database, id)))
    await move(t, [...SEED_IDS].reverse())
    const after = await Promise.all(SEED_IDS.map((id) => getTemplate(t.database, id)))
    const strip = (templates: typeof before) => templates.map((template) => ({ ...template!, sortOrder: 0 }))
    expect(strip(after)).toEqual(strip(before))
  })

  it('a completed quest keeps its place wherever it is moved, and stays completed', async () => {
    const t = await setup()
    await completeTodayQuest(t.context, `occ:${FAJR}@${MONDAY}`)

    await move(t, [...SEED_IDS.slice(1), FAJR])

    const quests = (await loadHome(t.context)).today.quests
    expect(quests.at(-1)).toMatchObject({ templateId: FAJR, completed: true })
    expect(quests.filter((quest) => quest.completed)).toHaveLength(1)
  })

  it('an occurrence that already exists keeps its frozen snapshot while its template is edited and moved', async () => {
    const t = await setup()
    const hard = await create(t, 'Hard thing', { difficulty: 'A' })
    const before = (await listOccurrencesByDate(t.database, d(MONDAY))).find((occurrence) => occurrence.templateId === hard)!

    await move(t, [hard, ...SEED_IDS])
    const form = await loadQuestForEdit(t.context, hard)
    if (form.status !== 'found') throw new Error('expected a form')
    await updateQuest(t.context, hard, { ...form.values, title: 'Renamed', difficulty: 'E' })

    const after = (await listOccurrencesByDate(t.database, d(MONDAY))).find((occurrence) => occurrence.templateId === hard)!
    expect(after).toEqual(before)
    expect((await loadHome(t.context)).today.quests[0]).toMatchObject({ title: 'Hard thing', difficulty: 'A', expReward: 80 })
  })
})

describe('edit, archive and restore', () => {
  it('editing a quest does not change its position', async () => {
    const t = await setup()
    const custom = await create(t, 'Reading')
    const order = [FAJR, custom, ...SEED_IDS.slice(1)]
    await move(t, order)

    const form = await loadQuestForEdit(t.context, custom)
    if (form.status !== 'found') throw new Error('expected a form')
    expect(await updateQuest(t.context, custom, { ...form.values, title: 'Reading, edited', difficulty: 'S', category: 'knowledge' })).toMatchObject({ status: 'updated' })

    expect(await activeIds(t)).toEqual(order)
  })

  it('a stale edit form cannot undo a reorder made after it was opened', async () => {
    const t = await setup()
    const custom = await create(t, 'Reading')
    const staleForm = await loadQuestForEdit(t.context, custom)
    if (staleForm.status !== 'found') throw new Error('expected a form')

    const order = [custom, ...SEED_IDS]
    await move(t, order)
    expect(await updateQuest(t.context, custom, { ...staleForm.values, title: 'Saved from the stale form' })).toMatchObject({ status: 'updated' })

    expect(await activeIds(t)).toEqual(order)
    expect((await loadHome(t.context)).today.quests[0]?.templateId).toBe(custom)
  })

  it('archiving removes the quest from the Active list without disturbing the rest of the order', async () => {
    const t = await setup()
    const custom = await create(t, 'Reading')
    const order = [custom, ...SEED_IDS]
    await move(t, order)

    expect(await archiveQuest(t.context, DHUHR)).toMatchObject({ status: 'archived' })

    expect(await activeIds(t)).toEqual(order.filter((id) => id !== DHUHR))
  })

  it('archiving keeps today’s existing occurrence visible, completable and in its place, and in the denominator', async () => {
    const t = await setup()
    await move(t, [SEED_IDS[1]!, FAJR, ...SEED_IDS.slice(2)]) // Dhuhr, Fajr, Asr, ...
    await archiveQuest(t.context, FAJR)

    const home = await loadHome(t.context)
    expect(home.today.quests.map((quest) => quest.title).slice(0, 3)).toEqual(['Dhuhr', 'Fajr', 'Asr'])
    expect(home.today.progress).toMatchObject({ eligibleCount: 6 })
    expect(await completeTodayQuest(t.context, `occ:${FAJR}@${MONDAY}`)).toMatchObject({ status: 'completed' })
  })

  it('restoring returns the quest to the place it held', async () => {
    const t = await setup()
    await archiveQuest(t.context, ASR)
    expect(await activeIds(t)).toEqual(SEED_IDS.filter((id) => id !== ASR))

    expect(await restoreQuest(t.context, ASR)).toMatchObject({ status: 'restored' })

    expect(await activeIds(t)).toEqual(SEED_IDS)
  })

  it('restoring after the others were reordered puts the quest back in its old slot', async () => {
    const t = await setup()
    await archiveQuest(t.context, DHUHR) // slot 1
    await move(t, [SLEEP, SEED_IDS[4]!, SEED_IDS[3]!, ASR, FAJR]) // the active quests permute among their slots (0, 2, 3, 4, 5)

    await restoreQuest(t.context, DHUHR)

    expect(await activeIds(t)).toEqual([SLEEP, DHUHR, SEED_IDS[4]!, SEED_IDS[3]!, ASR, FAJR])
  })

  it('a quest created while another is archived goes below everything, and the archived one still returns to its slot', async () => {
    const t = await setup()
    await archiveQuest(t.context, FAJR)
    const custom = await create(t, 'New')
    expect(await activeIds(t)).toEqual([...SEED_IDS.slice(1), custom])
    await restoreQuest(t.context, FAJR)
    expect(await activeIds(t)).toEqual([...SEED_IDS, custom])
  })
})

describe('the Weekly Goal Crusher quest picker follows the same order', () => {
  it('lists active quests in the manual order, then archived ones', async () => {
    const t = await setup()
    const custom = await create(t, 'Gym')
    await move(t, [custom, ...SEED_IDS])
    await archiveQuest(t.context, DHUHR)

    const editor = await loadWeeklyEditor(t.context)
    if (editor.status !== 'ok') throw new Error('expected the editor')
    expect(editor.quests.map((quest) => quest.templateId)).toEqual([custom, FAJR, ASR, SEED_IDS[3]!, SEED_IDS[4]!, SLEEP, DHUHR])
  })
})

describe('a missing template (foreign or hand-edited data only; the app only archives)', () => {
  async function deleteTemplateRow(t: TestContext, id: string): Promise<void> {
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = t.factory.open(DATABASE_NAME)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = connection.transaction('questTemplates', 'readwrite')
      transaction.objectStore('questTemplates').delete(id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    connection.close()
  }

  it('its occurrence stays on Home and in the denominator, deterministically after every quest that has a template', async () => {
    const t = await setup()
    await move(t, [SLEEP, ...SEED_IDS.slice(0, 5)])
    await deleteTemplateRow(t, SLEEP)

    const first = await loadHome(t.context)
    const second = await loadHome(t.context)

    expect(first.today.quests.map((quest) => quest.templateId)).toEqual([...SEED_IDS.slice(0, 5), SLEEP])
    expect(second.today.quests).toEqual(first.today.quests)
    expect(first.today.progress).toMatchObject({ eligibleCount: 6 })
  })
})
