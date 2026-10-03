import type { RankId } from '@/domain'
import { readProgression } from '@/persistence'
import type { ApplicationContext } from '../context'

/**
 * The player's progression as the UI shows it. Everything is derived from the
 * XP ledger by the persistence and domain layers; nothing is computed here.
 */
export interface PlayerStatus {
  /** Lifetime EXP: the ledger tip's running total. */
  readonly totalExp: number
  readonly level: number
  /** EXP earned inside the current level (the main progress bar's value). */
  readonly expIntoLevel: number
  /** EXP the current level requires (the main progress bar's maximum). */
  readonly expToNext: number
  readonly rank: RankId
}

export async function loadPlayerStatus(context: ApplicationContext): Promise<PlayerStatus> {
  const progression = await readProgression(context.database)
  const { level, expIntoLevel, expToNext, rank } = progression.levelState
  return { totalExp: progression.totalExp, level, expIntoLevel, expToNext, rank }
}
