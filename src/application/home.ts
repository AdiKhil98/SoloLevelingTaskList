import type { ClockReading } from '@/domain'
import { readClock } from './clock'
import type { ApplicationContext } from './context'
import { selectDailyMessage, type DailyMessage } from './dailyMessage/selectDailyMessage'
import { loadPlayerStatus, type PlayerStatus } from './player/loadPlayerStatus'
import { loadToday, type TodayView } from './today/loadToday'

/** Everything the Home and Status screens render, read from stored truth. */
export interface HomeSnapshot {
  readonly today: TodayView
  readonly player: PlayerStatus
  /** Chosen from today's `DateKey`, so it always matches the quests shown. */
  readonly dailyMessage: DailyMessage
}

/**
 * Reads today's quests and the player's progression. This is also the
 * "authoritative reload" used after every completion: the dataset is tiny, so
 * re-reading it is simpler and safer than patching state with guessed values.
 */
export async function loadHome(
  context: ApplicationContext,
  reading: ClockReading = readClock(context.clock),
): Promise<HomeSnapshot> {
  const today = await loadToday(context, reading)
  const player = await loadPlayerStatus(context)
  return { today, player, dailyMessage: selectDailyMessage(today.dateKey) }
}
