import type { Category } from '../config/categories'
import { summarizeDay, type DayQuality } from '../daily/dailyProgress'
import { buildDailySummary, type DailySummary } from '../daily/dailySummary'
import type { XPTransaction } from '../progression/ledger'
import { occurrenceIdOf, questCompletionIdempotencyKey, questCompletionTransactionId } from '../quests/keys'
import { addDays, asDateKey } from '../time/dateKey'
import { asWeekKey, weekEndOf } from '../time/weekKey'
import type { DateKey, WeekKey } from '../types/scalars'
import { weeklyBonusIdempotencyKey, weeklyBonusTransactionId } from '../weekly/keys'
import { activeBoard } from '../weekly/testFixtures'
import type { WeeklyGoalBoard } from '../weekly/types'

/** Test-only builders for the statistics and achievement tests. Not part of the public domain API. */

export type LedgerEntry =
  | {
      readonly kind: 'quest'
      readonly templateId?: string
      readonly date?: string
      readonly category?: Category
      readonly amount?: number
    }
  | { readonly kind: 'weekly'; readonly weekKey: string; readonly amount: number; readonly score?: number }

const BASE_TIME = Date.UTC(2026, 0, 1, 12, 0, 0)

/** A consistent ledger (seq 1.., running totals, deterministic ids/keys) from a list of entries. */
export function buildLedger(entries: readonly LedgerEntry[]): XPTransaction[] {
  let total = 0
  return entries.map((entry, index): XPTransaction => {
    const seq = index + 1
    total += entry.amount ?? 10
    const createdAt = BASE_TIME + seq * 60_000
    if (entry.kind === 'weekly') {
      const weekKey = asWeekKey(entry.weekKey)
      return {
        id: weeklyBonusTransactionId(weekKey),
        seq,
        idempotencyKey: weeklyBonusIdempotencyKey(weekKey),
        source: { type: 'weekly_goal_crusher', weekKey, score: entry.score ?? 6 },
        amount: entry.amount,
        category: null,
        createdAt,
        effectiveDate: weekEndOf(weekKey),
        sourceWeekKey: weekKey,
        totalExpAfter: total,
      }
    }
    const templateId = entry.templateId ?? 'tpl_a'
    const date = asDateKey(entry.date ?? '2026-03-01')
    const occurrenceId = occurrenceIdOf(templateId, date)
    return {
      id: questCompletionTransactionId(occurrenceId),
      seq,
      idempotencyKey: questCompletionIdempotencyKey(occurrenceId),
      source: { type: 'quest_completion', occurrenceId, templateId },
      amount: entry.amount ?? 10,
      category: entry.category ?? 'discipline',
      createdAt,
      effectiveDate: date,
      sourceWeekKey: null,
      totalExpAfter: total,
    }
  })
}

/** `count` quest rows on consecutive days (so every occurrence id is unique), `amount` EXP each. */
export function questRows(count: number, { amount = 10, start = '2026-01-01', ...rest }: { amount?: number; start?: string; templateId?: string; category?: Category } = {}): LedgerEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: 'quest' as const,
    date: addDays(asDateKey(start), index),
    amount,
    ...rest,
  }))
}

/** Counts that classify as `quality` out of ten eligible quests (0 / 0 for No Active Quests). */
const COUNTS: Record<DayQuality, readonly [completed: number, eligible: number]> = {
  perfect: [10, 10],
  strong: [9, 10],
  completed: [7, 10],
  incomplete: [5, 10],
  no_active_quests: [0, 0],
}

/** A UTC instant on `dateKey` at `hour`:00. */
const utcAt = (dateKey: DateKey, hour: number): number => Date.parse(`${dateKey}T${String(hour).padStart(2, '0')}:00:00Z`)

/** The finalizing instant of a day: the next morning, as a normal overnight finalization writes it. */
export const finalizedAtOf = (dateKey: DateKey): number => utcAt(addDays(dateKey, 1), 6)

/** A contiguous chain of finalized days (streaks folded exactly as finalization does), starting `start`. */
export function buildDayChain(qualities: readonly DayQuality[], start = '2026-03-01'): DailySummary[] {
  const chain: DailySummary[] = []
  qualities.forEach((quality, index) => {
    const dateKey = addDays(asDateKey(start), index)
    const [completed, eligible] = COUNTS[quality]
    chain.push(
      buildDailySummary({
        dateKey,
        progress: summarizeDay(dateKey, completed, eligible),
        occurrenceIds: Array.from({ length: eligible }, (_, slot) => occurrenceIdOf(`tpl_${slot}`, dateKey)),
        questExp: completed * 10,
        previous: chain[index - 1] ?? null,
        finalizedAt: finalizedAtOf(dateKey),
        finalizedLate: false,
      }),
    )
  })
  return chain
}

/** One day of an exact quality, built directly from counts (for rate tests). */
export function dayFromCounts(dateKey: string, completed: number, eligible: number, previous: DailySummary | null = null): DailySummary {
  const key = asDateKey(dateKey)
  return buildDailySummary({
    dateKey: key,
    progress: summarizeDay(key, completed, eligible),
    occurrenceIds: Array.from({ length: eligible }, (_, slot) => occurrenceIdOf(`tpl_${slot}`, key)),
    questExp: completed * 10,
    previous,
    finalizedAt: finalizedAtOf(key),
    finalizedLate: false,
  })
}

/** A finalized board scored `score`, finalized the Wednesday after its week. */
export function finalizedBoard(weekKey: string, score: number, bonusExp = 0): WeeklyGoalBoard {
  const key: WeekKey = asWeekKey(weekKey)
  return {
    ...activeBoard({ weekKey: key, startDate: key, endDate: weekEndOf(key) }),
    status: 'finalized',
    finalization: {
      finalizedAt: utcAt(addDays(weekEndOf(key), 3), 8),
      score,
      bonusExp,
      xpTransactionId: bonusExp > 0 ? weeklyBonusTransactionId(key) : null,
      goalResults: [],
      rewardTier: null,
    },
  }
}

/** The Monday `index` weeks after 2026-03-02 (a Monday). */
export function mondayAfter(index: number): string {
  return addDays(asDateKey('2026-03-02'), index * 7)
}

/** Boards of the given scores on consecutive weeks. A bonus is recorded for scores of 6+ (the 6 → 100 / 10 → 500 lookup is not under test). */
export function boardsScored(scores: readonly number[]): WeeklyGoalBoard[] {
  return scores.map((score, index) => finalizedBoard(mondayAfter(index), score, score >= 6 ? 100 : 0))
}

/** Deterministic shuffle (no randomness: tests must be reproducible). */
export function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items]
  let seed = 12_345
  for (let index = copy.length - 1; index > 0; index -= 1) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    const swap = seed % (index + 1)
    ;[copy[index], copy[swap]] = [copy[swap]!, copy[index]!]
  }
  return copy
}
