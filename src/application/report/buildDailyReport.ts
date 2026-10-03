import { isStreakSecured, projectedDailyStreak, type DateKey, type DayQuality } from '@/domain'
import type { HomeSnapshot } from '../home'

/**
 * The Daily Report of the day in progress. It is LIVE / PROVISIONAL: a view of
 * today's stored state, derived on demand and never stored. The day is only
 * final at local midnight, when its Daily Summary is written; until then the
 * numbers can still change and nothing here has touched the persisted streak.
 */
export interface DailyReport {
  readonly dateKey: DateKey
  /** Always `provisional` before midnight; the final result is the Daily Summary. */
  readonly status: 'provisional'
  readonly eligibleCount: number
  readonly completedCount: number
  /** Floored whole percent; null with no eligible quests. */
  readonly displayPercent: number | null
  readonly quality: DayQuality
  /** Quest EXP earned today (the sum of the completed quests' snapshots). */
  readonly expEarned: number
  /** The persisted (finalized) Daily Streak: today is not in it. */
  readonly currentStreak: number
  /** The persisted streak if the day closed in its current state. */
  readonly projectedStreak: number
  /** The day already meets the Completed threshold, so the streak will continue at midnight. */
  readonly streakSecured: boolean
  readonly isPerfect: boolean
}

export function buildDailyReport(snapshot: HomeSnapshot): DailyReport {
  const { today, streaks } = snapshot
  const { progress } = today
  return {
    dateKey: today.dateKey,
    status: 'provisional',
    eligibleCount: progress.eligibleCount,
    completedCount: progress.completedCount,
    displayPercent: progress.displayPercent,
    quality: progress.quality,
    expEarned: today.quests.reduce((sum, quest) => sum + (quest.completed ? quest.expReward : 0), 0),
    currentStreak: streaks.currentStreak,
    projectedStreak: projectedDailyStreak(streaks.currentStreak, progress.quality),
    streakSecured: isStreakSecured(progress.quality),
    isPerfect: progress.quality === 'perfect',
  }
}
