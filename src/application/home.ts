import type { ClockReading, DailySummary } from '@/domain'
import { readClock } from './clock'
import type { ApplicationContext } from './context'
import { selectDailyMessage, type DailyMessage } from './dailyMessage/selectDailyMessage'
import { assessDay, synchronizeDay, type ClockStatus, type ReconcileTrigger } from './lifecycle/synchronization'
import { loadPlayerStatus, type PlayerStatus } from './player/loadPlayerStatus'
import { loadStreakStats, type StreakStats } from './player/loadStreakStats'
import { loadToday, type TodayView } from './today/loadToday'

/** Everything the Home and Status screens render, read from stored truth. */
export interface HomeSnapshot {
  readonly today: TodayView
  readonly player: PlayerStatus
  /** Finalized streaks and Perfect Day totals (the day in progress is not in them). */
  readonly streaks: StreakStats
  /**
   * `behind` when the device date is earlier than the last recorded day (OD-22).
   * Then `today` is NOT materialized (it holds only what is already stored for
   * the device date), and the screens pause every change.
   */
  readonly clock: ClockStatus
  /** Chosen from today's `DateKey`, so it always matches the quests shown. */
  readonly dailyMessage: DailyMessage
}

/**
 * Reads today's quests and the player's progression. This is also the
 * "authoritative reload" used after every completion: the dataset is tiny, so
 * re-reading it is simpler and safer than patching state with guessed values.
 *
 * It does not reconcile: callers run `synchronizeAndLoadHome` for that. When
 * the clock is behind the recorded history it materializes nothing.
 */
export async function loadHome(
  context: ApplicationContext,
  reading: ClockReading = readClock(context.clock),
): Promise<HomeSnapshot> {
  const { clock } = await assessDay(context, reading)
  const today = await loadToday(context, reading, { materialize: clock.status === 'ok' })
  const player = await loadPlayerStatus(context)
  const streaks = await loadStreakStats(context)
  return { today, player, streaks, clock, dailyMessage: selectDailyMessage(today.dateKey) }
}

export interface SynchronizedHome {
  readonly home: HomeSnapshot
  /** The days this call finalized, oldest first (empty when nothing was missing). */
  readonly finalized: readonly DailySummary[]
}

/**
 * The lifecycle entry point of the screens (startup, resume, midnight timer,
 * Refresh): read the clock, reconcile every missed day in order, then load
 * today's view from the same clock reading. Safe to repeat at any time.
 */
export async function synchronizeAndLoadHome(
  context: ApplicationContext,
  trigger: ReconcileTrigger,
): Promise<SynchronizedHome> {
  const { reading, finalized } = await synchronizeDay(context, trigger)
  return { home: await loadHome(context, reading), finalized }
}
