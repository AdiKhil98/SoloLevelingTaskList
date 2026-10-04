import type { PerfectDayReachedEvent } from '../events/types'
import type { DailyProgress } from './dailyProgress'

/**
 * `PerfectDayReached` when the day in progress stands at 100 %. A day with no
 * eligible quest is never perfect (it is `no_active_quests`). This reports the
 * live state only; whether the day counts as a Perfect Day for streaks and
 * achievements is decided at finalization and never here.
 */
export function buildPerfectDayReachedEvent(progress: DailyProgress): PerfectDayReachedEvent | null {
  if (progress.quality !== 'perfect') return null
  return {
    type: 'PerfectDayReached',
    dateKey: progress.dateKey,
    completedCount: progress.completedCount,
    eligibleCount: progress.eligibleCount,
  }
}
