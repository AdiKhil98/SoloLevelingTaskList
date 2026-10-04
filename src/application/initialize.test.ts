// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTemplate,
  exportBackup,
  importBackup,
  listTemplates,
  openDatabase,
  serializeBackup,
  type PersistenceDatabase,
} from '@/persistence'
import { completeTodayQuest } from './completion/completeTodayQuest'
import { initializeApplication } from './initialize'
import {
  buildTemplate,
  createTestClock,
  createSequentialIds,
  createTestContext,
  newFactory,
  noonOn,
  ZONE,
  type TestContext,
} from './test-utils/helpers'

const TODAY = '2026-10-05'

const opened: PersistenceDatabase[] = []
async function setup(): Promise<TestContext> {
  const testContext = await createTestContext(TODAY)
  opened.push(testContext.database)
  return testContext
}

afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

describe('initializeApplication', () => {
  it('seeds the six defaults and returns today’s state for a fresh database', async () => {
    const { context, database } = await setup()

    const home = await initializeApplication(context)

    expect(await listTemplates(database)).toHaveLength(6)
    expect(home.today.dateKey).toBe(TODAY)
    expect(home.today.quests.map((quest) => quest.title)).toEqual([
      'Fajr',
      'Dhuhr',
      'Asr',
      'Maghrib',
      'Isha',
      'Sleep before 00:00',
    ])
    expect(home.today.quests.every((quest) => !quest.completed)).toBe(true)
    expect(home.today.progress).toMatchObject({ eligibleCount: 6, completedCount: 0, quality: 'incomplete' })
    expect(home.player).toEqual({ totalExp: 0, level: 1, expIntoLevel: 0, expToNext: 100, rank: 'E' })
    expect(home.dailyMessage.text).not.toBe('')
  })

  it('creates no duplicates when initialization repeats', async () => {
    const { context, database } = await setup()

    await initializeApplication(context)
    await initializeApplication(context)
    await Promise.all([initializeApplication(context), initializeApplication(context)])

    expect(await listTemplates(database)).toHaveLength(6)
  })

  it('keeps progress across a restart (new handle on the same stored data)', async () => {
    const { context, factory, clock } = await setup()
    await initializeApplication(context)
    await completeTodayQuest(context, `occ:tpl_seed_prayer_fajr@${TODAY}`)

    const reopened = await openDatabase({ factory })
    opened.push(reopened)
    const home = await initializeApplication({ database: reopened, clock, ids: createSequentialIds() })

    expect(home.player.totalExp).toBe(10)
    expect(home.today.quests[0]).toMatchObject({ title: 'Fajr', completed: true })
    expect(home.today.progress.completedCount).toBe(1)
    expect(await listTemplates(reopened)).toHaveLength(6)
  })

  it('consumes an existing database without resetting or duplicating it', async () => {
    const { context, database } = await setup()
    await createTemplate(database, buildTemplate({ id: 'tpl_custom', title: 'Custom', createdAt: 5 }))

    const home = await initializeApplication(context)

    expect(await listTemplates(database)).toHaveLength(7)
    // The existing quest keeps its place; the missing seeds are appended after it.
    expect(home.today.quests.map((quest) => quest.title)).toEqual([
      'Custom',
      'Fajr',
      'Dhuhr',
      'Asr',
      'Maghrib',
      'Isha',
      'Sleep before 00:00',
    ])
  })

  it('consumes a restored (imported) database, including its seeds and EXP', async () => {
    const source = await setup()
    await initializeApplication(source.context)
    await completeTodayQuest(source.context, `occ:tpl_seed_sleep@${TODAY}`)
    const backup = serializeBackup(
      await exportBackup(source.database, { exportedAt: noonOn(TODAY), exportedFromTimeZone: ZONE, appVersion: '0.1.0' }),
    )

    const targetFactory = newFactory()
    const target = await openDatabase({ factory: targetFactory })
    opened.push(target)
    const restored = await importBackup(target, backup)
    expect(restored.ok).toBe(true)

    const home = await initializeApplication({ database: target, clock: createTestClock(noonOn(TODAY)), ids: createSequentialIds() })

    expect(await listTemplates(target)).toHaveLength(6)
    expect(home.player.totalExp).toBe(20)
    expect(home.today.quests.find((quest) => quest.title === 'Sleep before 00:00')?.completed).toBe(true)
  })

  it('starts the seeded quests on the initialization date and does not reach into the past', async () => {
    const { context, clock } = await setup()
    clock.set(noonOn('2026-10-09'))

    await initializeApplication(context)
    clock.set(noonOn('2026-10-08'))
    const earlier = await initializeApplication(context)

    expect(earlier.today.dateKey).toBe('2026-10-08')
    expect(earlier.today.quests).toEqual([])
    expect(earlier.today.progress.quality).toBe('no_active_quests')
  })
})
