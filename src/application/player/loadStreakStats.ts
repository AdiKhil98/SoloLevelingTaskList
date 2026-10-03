import type { DateKey } from '@/domain'
import { readDailyChainTip } from '@/persistence'
import type { ApplicationContext } from '../context'

/**
 * The streak numbers as persisted by finalization. They come from the tip of
 * the Daily Summary chain (its `*After` values) and a count of finalized
 * Perfect Days, never from a separate counter, and they never include the
 * day in progress.
 */
export interface StreakStats {
  /** Finalized Daily Streak. */
  readonly currentStreak: number
  /** The highest finalized Daily Streak ever reached. */
  readonly bestStreak: number
  /** Consecutive finalized Perfect Days. */
  readonly perfectStreak: number
  /** Finalized Perfect Days, ever. Never decreases. */
  readonly totalPerfectDays: number
  /** The newest finalized date, or null before the first day was finalized. */
  readonly lastFinalizedDate: DateKey | null
}

export async function loadStreakStats(context: ApplicationContext): Promise<StreakStats> {
  const { latest, totalPerfectDays } = await readDailyChainTip(context.database)
  return {
    currentStreak: latest?.currentStreakAfter ?? 0,
    bestStreak: latest?.bestStreakAfter ?? 0,
    perfectStreak: latest?.perfectStreakAfter ?? 0,
    totalPerfectDays,
    lastFinalizedDate: latest?.dateKey ?? null,
  }
}
