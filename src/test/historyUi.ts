import { addDays, asDateKey } from '@/domain'
import { archiveQuest, completeTodayQuest, DEFAULT_QUEST_SEEDS, loadHome, startApplication, synchronizeAndLoadHome } from '@/application'
import { createSequentialIds, createTestClock, noonOn, type TestClock } from '@/application/test-utils/helpers'
import { openDatabase } from '@/persistence'

/** Helpers for the progression UI tests: real played days, written through the application use cases. Test-only. */

/**
 * Plays `start` on a fresh database: completes the first `completeCount` of the
 * default quests (all six when omitted), then lets the clock reach the next day
 * so that day is finalized exactly as the lifecycle does. Returns a clock set to
 * that next day, ready for `renderApp({ factory, clock })`.
 */
export async function playFirstDay(
  factory: IDBFactory,
  { start = '2026-10-05', completeCount = 6 }: { start?: string; completeCount?: number } = {},
): Promise<TestClock> {
  const database = await openDatabase({ factory })
  const clock = createTestClock(noonOn(start))
  const context = { database, clock, ids: createSequentialIds() }
  try {
    await startApplication(context)
    const { today } = await loadHome(context)
    for (const quest of today.quests.slice(0, completeCount)) {
      const result = await completeTodayQuest(context, quest.occurrenceId)
      if (result.status !== 'completed') throw new Error(`completion was ${result.status}`)
    }
    const next = addDays(asDateKey(start), 1)
    clock.set(noonOn(next))
    await synchronizeAndLoadHome(context, 'resume')
    return createTestClock(noonOn(next))
  } finally {
    database.close()
  }
}

/** Starts the app on `start`, then lets `days` empty days pass (each finalized Incomplete). Returns a clock on the new day. */
export async function letDaysPass(factory: IDBFactory, days: number, start = '2026-10-05'): Promise<TestClock> {
  const database = await openDatabase({ factory })
  const clock = createTestClock(noonOn(start))
  const context = { database, clock, ids: createSequentialIds() }
  try {
    await startApplication(context)
    const arrival = addDays(asDateKey(start), days)
    clock.set(noonOn(arrival))
    await synchronizeAndLoadHome(context, 'resume')
    return createTestClock(noonOn(arrival))
  } finally {
    database.close()
  }
}

/**
 * Archives every default quest on `start` (so today's occurrences remain, the days after have none), then lets
 * `days` days pass: the first is finalized Incomplete, the rest No Active Quests. Returns a clock on the new day.
 */
export async function letNeutralDaysPass(factory: IDBFactory, days: number, start = '2026-10-05'): Promise<TestClock> {
  const database = await openDatabase({ factory })
  const clock = createTestClock(noonOn(start))
  const context = { database, clock, ids: createSequentialIds() }
  try {
    await startApplication(context)
    for (const seed of DEFAULT_QUEST_SEEDS) {
      const result = await archiveQuest(context, seed.templateId)
      if (result.status !== 'archived') throw new Error(`archive was ${result.status}`)
    }
    const arrival = addDays(asDateKey(start), days)
    clock.set(noonOn(arrival))
    await synchronizeAndLoadHome(context, 'resume')
    return createTestClock(noonOn(arrival))
  } finally {
    database.close()
  }
}
