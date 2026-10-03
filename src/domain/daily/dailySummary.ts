import { addDays, compareDateKeys } from '../time/dateKey'
import type { DateKey, EpochMs } from '../types/scalars'
import { classifyDayQuality, type DailyProgress, type DayQuality } from './dailyProgress'

/** What a finalized day does to a streak (DATA_MODEL §7). */
export type StreakEffect = 'increment' | 'reset' | 'neutral'

/**
 * The immutable result of one finalized calendar date (DATA_MODEL §7). Counts
 * only: a percentage is never stored (derive it with `displayPercentOf`).
 */
export interface DailySummary {
  readonly dateKey: DateKey
  /** Denominator at finalization. */
  readonly eligibleCount: number
  readonly completedCount: number
  /** Which occurrences were eligible, so the day is reconstructable. */
  readonly occurrenceIds: readonly string[]
  readonly quality: DayQuality
  /** True only for `perfect` (never for `no_active_quests`). */
  readonly isPerfect: boolean
  readonly dailyStreakEffect: StreakEffect
  readonly perfectStreakEffect: StreakEffect
  /** Sum of the quest-completion EXP earned on this date (no bonuses). */
  readonly questExp: number
  readonly currentStreakAfter: number
  readonly bestStreakAfter: number
  readonly perfectStreakAfter: number
  readonly finalizedAt: EpochMs
  /** True when finalized by catch-up (startup, resume, several days at once). */
  readonly finalizedLate: boolean
}

/** The streak numbers the chain of summaries folds to. */
export interface StreakState {
  readonly currentStreak: number
  readonly bestStreak: number
  readonly perfectStreak: number
  readonly totalPerfectDays: number
}

export const INITIAL_STREAK_STATE: StreakState = {
  currentStreak: 0,
  bestStreak: 0,
  perfectStreak: 0,
  totalPerfectDays: 0,
}

/** The two streak effects of a day of this quality (MASTER_SPEC §7.3–7.5). */
export function streakEffectsOf(quality: DayQuality): {
  readonly daily: StreakEffect
  readonly perfect: StreakEffect
} {
  switch (quality) {
    case 'perfect':
      return { daily: 'increment', perfect: 'increment' }
    case 'strong':
    case 'completed':
      return { daily: 'increment', perfect: 'reset' }
    case 'incomplete':
      return { daily: 'reset', perfect: 'reset' }
    case 'no_active_quests':
      return { daily: 'neutral', perfect: 'neutral' }
  }
}

function applyEffect(value: number, effect: StreakEffect): number {
  switch (effect) {
    case 'increment':
      return value + 1
    case 'reset':
      return 0
    case 'neutral':
      return value
  }
}

/** The streak state after a finalized day of `quality`. */
export function applyDayToStreaks(state: StreakState, quality: DayQuality): StreakState {
  const effects = streakEffectsOf(quality)
  const currentStreak = applyEffect(state.currentStreak, effects.daily)
  return {
    currentStreak,
    bestStreak: Math.max(state.bestStreak, currentStreak),
    perfectStreak: applyEffect(state.perfectStreak, effects.perfect),
    totalPerfectDays: state.totalPerfectDays + (quality === 'perfect' ? 1 : 0),
  }
}

/**
 * The persisted Daily Streak a live day would leave if it were finalized in its
 * current state. View data only: persisted streaks change at finalization.
 */
export function projectedDailyStreak(persistedStreak: number, liveQuality: DayQuality): number {
  return applyEffect(persistedStreak, streakEffectsOf(liveQuality).daily)
}

/** The live day already meets the Completed threshold, so the streak will continue at midnight. */
export function isStreakSecured(liveQuality: DayQuality): boolean {
  return streakEffectsOf(liveQuality).daily === 'increment'
}

export interface BuildDailySummaryInput {
  readonly dateKey: DateKey
  readonly progress: DailyProgress
  readonly occurrenceIds: readonly string[]
  readonly questExp: number
  /** The previous summary of the chain, or null for the first day. */
  readonly previous: Pick<DailySummary, 'currentStreakAfter' | 'bestStreakAfter' | 'perfectStreakAfter'> | null
  readonly finalizedAt: EpochMs
  readonly finalizedLate: boolean
}

/** Builds the summary of a finalized day, applying its streak effects to the previous chain state. */
export function buildDailySummary(input: BuildDailySummaryInput): DailySummary {
  const { progress, previous } = input
  const effects = streakEffectsOf(progress.quality)
  const before: StreakState = {
    currentStreak: previous?.currentStreakAfter ?? 0,
    bestStreak: previous?.bestStreakAfter ?? 0,
    perfectStreak: previous?.perfectStreakAfter ?? 0,
    totalPerfectDays: 0,
  }
  const after = applyDayToStreaks(before, progress.quality)
  return {
    dateKey: input.dateKey,
    eligibleCount: progress.eligibleCount,
    completedCount: progress.completedCount,
    occurrenceIds: [...input.occurrenceIds],
    quality: progress.quality,
    isPerfect: progress.quality === 'perfect',
    dailyStreakEffect: effects.daily,
    perfectStreakEffect: effects.perfect,
    questExp: input.questExp,
    currentStreakAfter: after.currentStreak,
    bestStreakAfter: after.bestStreak,
    perfectStreakAfter: after.perfectStreak,
    finalizedAt: input.finalizedAt,
    finalizedLate: input.finalizedLate,
  }
}

/** The quality a summary's counts imply (the stored `quality` must equal it). */
export function qualityOfSummaryCounts(summary: Pick<DailySummary, 'completedCount' | 'eligibleCount'>): DayQuality {
  return classifyDayQuality(summary.completedCount, summary.eligibleCount)
}

export interface ChainProblem {
  /** Index into the chain the problem is about. */
  readonly index: number
  readonly field: string
  readonly code: 'not_contiguous' | 'streak_mismatch'
  readonly message: string
}

/** Streak state of a verified chain (the fold). Streaks are a pure fold over summaries. */
export function foldStreaks(summaries: readonly DailySummary[]): StreakState {
  let state = INITIAL_STREAK_STATE
  for (const summary of summaries) state = applyDayToStreaks(state, summary.quality)
  return state
}

/**
 * Verifies a chain sorted by date: finalized dates are contiguous (INV-13) and
 * every `*After` value equals the fold of the days before it (INV-21). A
 * `no_active_quests` day changes nothing (INV-22) by the same rule.
 */
export function verifySummaryChain(summaries: readonly DailySummary[]): readonly ChainProblem[] {
  const problems: ChainProblem[] = []
  let state = INITIAL_STREAK_STATE
  summaries.forEach((summary, index) => {
    const previous = summaries[index - 1]
    if (previous !== undefined && compareDateKeys(summary.dateKey, addDays(previous.dateKey, 1)) !== 0) {
      problems.push({
        index,
        field: 'dateKey',
        code: 'not_contiguous',
        message: `Expected ${addDays(previous.dateKey, 1)} after ${previous.dateKey}`,
      })
    }
    state = applyDayToStreaks(state, summary.quality)
    const expected: ReadonlyArray<readonly [string, number, number]> = [
      ['currentStreakAfter', summary.currentStreakAfter, state.currentStreak],
      ['bestStreakAfter', summary.bestStreakAfter, state.bestStreak],
      ['perfectStreakAfter', summary.perfectStreakAfter, state.perfectStreak],
    ]
    for (const [field, actual, wanted] of expected) {
      if (actual !== wanted) {
        problems.push({
          index,
          field,
          code: 'streak_mismatch',
          message: `Expected ${wanted}, found ${actual}`,
        })
      }
    }
  })
  return problems
}
