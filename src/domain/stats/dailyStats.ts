import { displayPercentOf, type DayQuality } from '../daily/dailyProgress'
import type { DailySummary } from '../daily/dailySummary'
import type { DateKey } from '../types/scalars'
import { inDayOrder } from './history'

/**
 * The day-quality milestones, cumulative: a Strong day also met the Completed
 * threshold and a Perfect day met both (MASTER_SPEC §7.2).
 */
export type DayMilestone = 'completed' | 'strong' | 'perfect'

const MILESTONE_RANK: Record<DayMilestone, number> = { completed: 1, strong: 2, perfect: 3 }

const QUALITY_RANK: Record<DayQuality, number> = {
  no_active_quests: 0, // never meets a milestone: an empty day is neutral, not a good day
  incomplete: 0,
  completed: 1,
  strong: 2,
  perfect: 3,
}

/** A finalized day of `quality` met `milestone` (Strong and Perfect meet Completed; No Active Quests meets none). */
export function dayMeetsMilestone(quality: DayQuality, milestone: DayMilestone): boolean {
  return QUALITY_RANK[quality] >= MILESTONE_RANK[milestone]
}

export interface DailyStats {
  /** Days with a Daily Summary. The day in progress is not one of them. */
  readonly finalizedDays: number
  /** Finalized days that had at least one eligible quest (the days a rate is defined for). */
  readonly activeDays: number
  /** Days at the Completed threshold or better (includes Strong and Perfect). */
  readonly completedDays: number
  /** Days at the Strong threshold or better (includes Perfect). */
  readonly strongDays: number
  readonly perfectDays: number
  readonly incompleteDays: number
  /** Neutral days: no eligible quest, so no streak effect and no rate. */
  readonly noActiveQuestDays: number
  /** Quests completed over every active finalized day. */
  readonly questsCompleted: number
  /** Quests that were eligible over every active finalized day. */
  readonly questsEligible: number
  /** Floored whole percent of `questsCompleted / questsEligible` (count-based); null when nothing was ever eligible. */
  readonly completionRatePercent: number | null
  /** The streaks as the newest summary records them (finalized values only). */
  readonly currentStreak: number
  readonly bestStreak: number
  readonly perfectStreak: number
  readonly lastFinalizedDate: DateKey | null
}

/**
 * Derives the daily statistics from the Daily Summary chain alone. Summaries
 * are immutable, so a finalized day reads the same forever. The input may be in
 * any order; days without eligible quests (No Active Quests) count as finalized
 * days but never enter a rate or a streak.
 */
export function summarizeDailyHistory(summaries: readonly DailySummary[]): DailyStats {
  const days = inDayOrder(summaries)
  let completedDays = 0
  let strongDays = 0
  let perfectDays = 0
  let incompleteDays = 0
  let noActiveQuestDays = 0
  let questsCompleted = 0
  let questsEligible = 0

  for (const day of days) {
    if (day.quality === 'no_active_quests') {
      noActiveQuestDays += 1
      continue
    }
    questsCompleted += day.completedCount
    questsEligible += day.eligibleCount
    if (day.quality === 'incomplete') incompleteDays += 1
    if (dayMeetsMilestone(day.quality, 'completed')) completedDays += 1
    if (dayMeetsMilestone(day.quality, 'strong')) strongDays += 1
    if (day.quality === 'perfect') perfectDays += 1
  }

  const latest = days[days.length - 1]
  return {
    finalizedDays: days.length,
    activeDays: days.length - noActiveQuestDays,
    completedDays,
    strongDays,
    perfectDays,
    incompleteDays,
    noActiveQuestDays,
    questsCompleted,
    questsEligible,
    completionRatePercent: displayPercentOf(questsCompleted, questsEligible),
    currentStreak: latest?.currentStreakAfter ?? 0,
    bestStreak: latest?.bestStreakAfter ?? 0,
    perfectStreak: latest?.perfectStreakAfter ?? 0,
    lastFinalizedDate: latest?.dateKey ?? null,
  }
}
