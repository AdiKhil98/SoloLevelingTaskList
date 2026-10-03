import type { ClockReading, DomainEvent, WeekKey } from '@/domain'
import { finalizeWeekAtomically, listDueWeeklyBoardKeys } from '@/persistence'
import type { ApplicationContext } from '../context'
import { ApplicationError } from '../errors'

/** One week this reconciliation finalized. */
export interface FinalizedWeekReport {
  readonly weekKey: WeekKey
  readonly score: number
  /** The bonus EXP the week paid (0 below a score of 6). */
  readonly bonusExp: number
  readonly rewardTierMinScore: number | null
  /**
   * `WeeklyBoardFinalized`, then the bonus's `XPAwarded` / `LevelUp` / `RankUp`.
   * Retained for Phase 10; reconciliation never presents or replays them (OD-21).
   */
  readonly events: readonly DomainEvent[]
}

/**
 * Finalizes every active board whose week is over (`endDate < today`), oldest
 * week first, one atomic transaction per board, and pays each bonus exactly
 * once. It runs AFTER the daily reconciliation, so a week's Sunday is always
 * closed first. Idempotent: a finalized board is skipped by the query and, were
 * a racing tab to attempt it anyway, by the command, so a repeat, a second tab
 * or an interrupted catch-up can never pay twice. A week without a board has
 * nothing to finalize.
 */
export async function finalizeDueWeeks(
  context: ApplicationContext,
  reading: ClockReading,
): Promise<readonly FinalizedWeekReport[]> {
  const due = await listDueWeeklyBoardKeys(context.database, reading.dateKey)
  const reports: FinalizedWeekReport[] = []
  for (const weekKey of due) {
    const result = await finalizeWeekAtomically(context.database, {
      weekKey,
      today: reading.dateKey,
      finalizedAt: reading.epochMs,
    })
    if (result.status === 'rejected') {
      throw new ApplicationError('inconsistent_data', `Could not finalize week ${weekKey} (${result.reason.code})`)
    }
    if (result.status === 'finalized') {
      const { finalization } = result.board
      reports.push({
        weekKey,
        score: finalization === null ? 0 : finalization.score,
        bonusExp: finalization === null ? 0 : finalization.bonusExp,
        rewardTierMinScore: finalization?.rewardTier?.minScore ?? null,
        events: result.events,
      })
    }
  }
  return reports
}
