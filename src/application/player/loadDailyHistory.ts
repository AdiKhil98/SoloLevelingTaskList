import { displayPercentOf, inDayOrder, type DateKey, type DayQuality } from '@/domain'
import { listDailySummaries } from '@/persistence'
import type { ApplicationContext } from '../context'
import { attemptLoad, type LoadResult } from '../loadResult'

/** One finalized day, as the Daily History lists it. Every figure is from its immutable summary. */
export interface DailyHistoryEntry {
  readonly dateKey: DateKey
  readonly quality: DayQuality
  readonly completedCount: number
  readonly eligibleCount: number
  /** Floored whole percent; null for a No Active Quests day. */
  readonly displayPercent: number | null
  /** Quest EXP earned on that date (no bonuses). */
  readonly questExp: number
  /** The Daily Streak after that day was finalized. */
  readonly streakAfter: number
}

/** Every finalized day, newest first. The day in progress is not in it. */
export function loadDailyHistory(context: ApplicationContext): Promise<LoadResult<readonly DailyHistoryEntry[]>> {
  return attemptLoad(async () =>
    inDayOrder(await listDailySummaries(context.database))
      .reverse()
      .map((summary): DailyHistoryEntry => ({
        dateKey: summary.dateKey,
        quality: summary.quality,
        completedCount: summary.completedCount,
        eligibleCount: summary.eligibleCount,
        displayPercent: displayPercentOf(summary.completedCount, summary.eligibleCount),
        questExp: summary.questExp,
        streakAfter: summary.currentStreakAfter,
      })),
  )
}
