import { readClock } from './clock'
import type { ApplicationContext } from './context'
import { synchronizeAndLoadHome, type HomeSnapshot, type SynchronizedHome } from './home'
import { ensureDefaultQuests } from './seeds/ensureDefaultQuests'

/**
 * Startup use case. With the database already open (the caller owns the
 * handle):
 *
 *  1. take one clock reading (date, instant, zone);
 *  2. make sure the approved default quests exist, starting on that date;
 *  3. reconcile every missed day (finalize it, in order) as a startup catch-up;
 *  4. materialize and load today's quests, completions, progression and streaks.
 *
 * Safe to run on every launch against any valid database: it only adds missing
 * approved seeds and never resets, replaces or duplicates anything.
 */
export async function startApplication(context: ApplicationContext): Promise<SynchronizedHome> {
  const reading = readClock(context.clock)
  await ensureDefaultQuests(context.database, { startDate: reading.dateKey, now: reading.epochMs })
  return synchronizeAndLoadHome(context, 'startup')
}

/** `startApplication`, returning only the loaded Home state. */
export async function initializeApplication(context: ApplicationContext): Promise<HomeSnapshot> {
  return (await startApplication(context)).home
}
