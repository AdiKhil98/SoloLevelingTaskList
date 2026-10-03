import { DAILY_QUALITY_THRESHOLDS } from '../config/daily'
import type { QuestOccurrence } from '../quests/types'
import { DomainError } from '../types/errors'
import { err, ok, type Result } from '../types/result'
import type { DateKey } from '../types/scalars'

export type DayQuality =
  | 'incomplete'
  | 'completed'
  | 'strong'
  | 'perfect'
  | 'no_active_quests'

export interface DailyProgress {
  readonly dateKey: DateKey
  readonly eligibleCount: number
  readonly completedCount: number
  readonly quality: DayQuality
  /**
   * Whole-number display percentage, floored (never rounded). Null when no
   * quest is eligible: an empty day has no ratio. Display only; classification
   * never uses it.
   */
  readonly displayPercent: number | null
}

export type DailyProgressError =
  | {
      readonly code: 'occurrence_date_mismatch'
      readonly occurrenceId: string
      readonly occurrenceDate: DateKey
    }
  | { readonly code: 'duplicate_occurrence'; readonly occurrenceId: string }

function assertCounts(completed: number, eligible: number): void {
  if (
    !Number.isSafeInteger(completed) ||
    !Number.isSafeInteger(eligible) ||
    completed < 0 ||
    eligible < 0 ||
    completed > eligible
  ) {
    throw new DomainError(
      'invalid_count',
      `Need 0 ≤ completed ≤ eligible (safe integers), got ${completed}/${eligible}`,
    )
  }
}

/**
 * Classifies a day by the EXACT ratio `completed / eligible` using integer
 * cross-multiplication (MASTER_SPEC §7.2). Zero eligible quests is
 * `no_active_quests`, never 0 % and never Perfect.
 */
export function classifyDayQuality(
  completedCount: number,
  eligibleCount: number,
): DayQuality {
  assertCounts(completedCount, eligibleCount)
  if (eligibleCount === 0) return 'no_active_quests'
  if (completedCount === eligibleCount) return 'perfect'

  const scaled = completedCount * 100
  if (scaled >= DAILY_QUALITY_THRESHOLDS.strongPercent * eligibleCount) {
    return 'strong'
  }
  if (scaled >= DAILY_QUALITY_THRESHOLDS.completedPercent * eligibleCount) {
    return 'completed'
  }
  return 'incomplete'
}

/** `⌊completed × 100 / eligible⌋` by integer division; null when none eligible. */
export function displayPercentOf(
  completedCount: number,
  eligibleCount: number,
): number | null {
  assertCounts(completedCount, eligibleCount)
  if (eligibleCount === 0) return null
  const scaled = completedCount * 100
  return (scaled - (scaled % eligibleCount)) / eligibleCount
}

export function summarizeDay(
  dateKey: DateKey,
  completedCount: number,
  eligibleCount: number,
): DailyProgress {
  return {
    dateKey,
    eligibleCount,
    completedCount,
    quality: classifyDayQuality(completedCount, eligibleCount),
    displayPercent: displayPercentOf(completedCount, eligibleCount),
  }
}

/**
 * Daily completion for one date. Every occurrence counts as exactly one
 * quest regardless of difficulty or EXP; a quest is completed when its id is
 * in `completedOccurrenceIds`. Ids that match no occurrence are ignored.
 */
export function computeDailyProgress(input: {
  readonly dateKey: DateKey
  readonly occurrences: readonly QuestOccurrence[]
  readonly completedOccurrenceIds: ReadonlySet<string>
}): Result<DailyProgress, DailyProgressError> {
  const seen = new Set<string>()
  let completedCount = 0

  for (const occurrence of input.occurrences) {
    if (occurrence.dateKey !== input.dateKey) {
      return err({
        code: 'occurrence_date_mismatch',
        occurrenceId: occurrence.id,
        occurrenceDate: occurrence.dateKey,
      })
    }
    if (seen.has(occurrence.id)) {
      return err({ code: 'duplicate_occurrence', occurrenceId: occurrence.id })
    }
    seen.add(occurrence.id)
    if (input.completedOccurrenceIds.has(occurrence.id)) completedCount += 1
  }

  return ok(summarizeDay(input.dateKey, completedCount, seen.size))
}
