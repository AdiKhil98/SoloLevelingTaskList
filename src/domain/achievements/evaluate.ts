import { RANK_BANDS } from '../config/ranks'
import { DomainError } from '../types/errors'
import type { DailySummary } from '../daily/dailySummary'
import { levelOf, totalExpToReachLevel } from '../progression/levels'
import type { XPTransaction } from '../progression/ledger'
import { dayMeetsMilestone } from '../stats/dailyStats'
import { normalizeHistory, type FinalizedWeeklyBoard, type ProgressionHistory } from '../stats/history'
import { ACHIEVEMENT_CATALOG } from './catalog'
import type {
  AchievementCondition,
  AchievementDefinition,
  AchievementProgress,
  AchievementStatus,
  AchievementUnlock,
} from './types'

/**
 * The history, canonicalized once, plus the few running figures conditions need.
 * Built from `normalizeHistory`, never from the caller's arrays.
 */
interface Timeline {
  /** Quest-completion ledger rows, in ledger order. */
  readonly questRows: readonly XPTransaction[]
  /** Every ledger row, in ledger order, and the lifetime EXP after each of them. */
  readonly ledger: readonly XPTransaction[]
  readonly expAfter: readonly number[]
  readonly totalExp: number
  readonly days: readonly DailySummary[]
  readonly boards: readonly FinalizedWeeklyBoard[]
  readonly bestStreak: number
}

function buildTimeline(history: ProgressionHistory): Timeline {
  const { ledger, days, boards } = normalizeHistory(history)
  const expAfter: number[] = []
  let running = 0
  for (const row of ledger) {
    running += row.amount
    expAfter.push(running)
  }
  return {
    questRows: ledger.filter((row) => row.source.type === 'quest_completion'),
    ledger,
    expAfter,
    totalExp: running,
    days,
    boards,
    bestStreak: days.reduce((best, day) => Math.max(best, day.bestStreakAfter), 0),
  }
}

const unlockedByTransaction = (row: XPTransaction): AchievementUnlock => ({
  unlockedAt: row.createdAt,
  unlockedOn: row.effectiveDate,
  evidence: { type: 'xp_transaction', transactionId: row.id, seq: row.seq },
})

const unlockedByDay = (day: DailySummary): AchievementUnlock => ({
  unlockedAt: day.finalizedAt,
  unlockedOn: day.dateKey,
  evidence: { type: 'daily_summary', dateKey: day.dateKey },
})

const unlockedByBoard = (board: FinalizedWeeklyBoard): AchievementUnlock => ({
  unlockedAt: board.finalization.finalizedAt,
  unlockedOn: board.endDate,
  evidence: { type: 'weekly_board', weekKey: board.weekKey },
})

interface Evaluation {
  readonly progress: AchievementProgress
  readonly unlock: AchievementUnlock | null
}

function progressOf(current: number, target: number): AchievementProgress {
  return { current: Math.min(current, target), target }
}

/** "The Nth matching record" is both the proof and the moment: the first to bring the count to `count`. */
function nthRecord<T>(matching: readonly T[], count: number, unlockOf: (record: T) => AchievementUnlock): Evaluation {
  const record = matching[count - 1]
  return { progress: progressOf(matching.length, count), unlock: record === undefined ? null : unlockOf(record) }
}

function levelReached(timeline: Timeline, level: number): Evaluation {
  const threshold = totalExpToReachLevel(level)
  const index = timeline.expAfter.findIndex((total) => total >= threshold)
  const row = timeline.ledger[index]
  return {
    progress: progressOf(levelOf(timeline.totalExp), level),
    unlock: index === -1 || row === undefined ? null : unlockedByTransaction(row),
  }
}

function evaluateCondition(condition: AchievementCondition, timeline: Timeline): Evaluation {
  switch (condition.type) {
    case 'quest_completions':
      return nthRecord(timeline.questRows, condition.count, unlockedByTransaction)
    case 'finalized_days':
      return nthRecord(
        timeline.days.filter((day) => dayMeetsMilestone(day.quality, condition.milestone)),
        condition.count,
        unlockedByDay,
      )
    case 'daily_streak': {
      // The first day on which the finalized streak stood at `days`: that summary is the record.
      const day = timeline.days.find((candidate) => candidate.currentStreakAfter >= condition.days)
      return { progress: progressOf(timeline.bestStreak, condition.days), unlock: day === undefined ? null : unlockedByDay(day) }
    }
    case 'finalized_weeks':
      return nthRecord(
        timeline.boards.filter((board) => board.finalization.score >= condition.minScore),
        condition.count,
        unlockedByBoard,
      )
    case 'rank_reached': {
      const band = RANK_BANDS.find((candidate) => candidate.rank === condition.rank)
      if (band === undefined) throw new DomainError('invalid_level', `Unknown rank "${condition.rank}"`)
      return levelReached(timeline, band.minLevel)
    }
    case 'level_reached':
      return levelReached(timeline, condition.level)
  }
}

/**
 * Evaluates achievements against the player's history. Pure and deterministic:
 *
 * - Nothing is stored. An achievement is unlocked exactly when history says it
 *   qualified, so evaluating twice, in any order, or after more history was
 *   added, can never unlock it twice, un-unlock it or move its date.
 * - The unlock moment is the exact record that first satisfied the condition
 *   (the Nth completion's ledger row, the finalized day or week, the ledger row
 *   whose EXP first reached the level), never "when this ran".
 * - Days and weeks count only from finalized Daily Summaries and finalized
 *   boards; a day in progress or an active board unlocks nothing.
 * - The history is normalized internally; the order of the arrays passed in
 *   (and the arrays themselves) never affects or changes anything.
 *
 * Results follow the order of `definitions` (the catalog by default).
 */
export function evaluateAchievements(
  history: ProgressionHistory,
  definitions: readonly AchievementDefinition[] = ACHIEVEMENT_CATALOG,
): readonly AchievementStatus[] {
  const timeline = buildTimeline(history)
  return definitions.map((definition): AchievementStatus => {
    const { progress, unlock } = evaluateCondition(definition.condition, timeline)
    return { definition, unlock, progress }
  })
}

export interface AchievementSummary {
  readonly unlockedCount: number
  readonly totalCount: number
  /** The newest unlocks first (by moment, then date, then catalog order), at most `limit`. */
  readonly recent: readonly AchievementStatus[]
}

/** Counts and the most recent unlocks of an evaluated list (which is in catalog order). */
export function summarizeAchievements(statuses: readonly AchievementStatus[], limit: number): AchievementSummary {
  const unlocked = statuses
    .map((status, index) => ({ status, index }))
    .filter((entry): entry is { status: AchievementStatus & { unlock: AchievementUnlock }; index: number } => entry.status.unlock !== null)
  unlocked.sort(
    (a, b) =>
      b.status.unlock.unlockedAt - a.status.unlock.unlockedAt ||
      (a.status.unlock.unlockedOn < b.status.unlock.unlockedOn ? 1 : a.status.unlock.unlockedOn > b.status.unlock.unlockedOn ? -1 : 0) ||
      a.index - b.index,
  )
  return {
    unlockedCount: unlocked.length,
    totalCount: statuses.length,
    recent: unlocked.slice(0, Math.max(0, limit)).map((entry) => entry.status),
  }
}
