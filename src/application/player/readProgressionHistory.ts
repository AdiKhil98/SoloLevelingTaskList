import type { ProgressionHistory } from '@/domain'
import { listDailySummaries, listWeeklyBoards, listXpTransactions } from '@/persistence'
import type { ApplicationContext } from '../context'

/**
 * Reads the immutable record every statistic and achievement is derived from:
 * the XP ledger, the finalized days and the weekly boards. Reads only; the
 * three lists are independent, append-only histories, and the screens reload
 * them whenever the stored state changes.
 */
export async function readProgressionHistory(context: ApplicationContext): Promise<ProgressionHistory> {
  const [ledger, dailySummaries, weeklyBoards] = await Promise.all([
    listXpTransactions(context.database),
    listDailySummaries(context.database),
    listWeeklyBoards(context.database),
  ])
  return { ledger, dailySummaries, weeklyBoards }
}
