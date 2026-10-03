import { evaluateAchievements, type AchievementStatus } from '@/domain'
import type { ApplicationContext } from '../context'
import { attemptLoad, type LoadResult } from '../loadResult'
import { readProgressionHistory } from './readProgressionHistory'

export interface AchievementsView {
  /** Every achievement in catalog order, unlocked or not. */
  readonly achievements: readonly AchievementStatus[]
  readonly unlockedCount: number
  readonly totalCount: number
}

/**
 * Evaluates the whole catalog against the stored history. Nothing is written:
 * an achievement is unlocked exactly when history says it qualified, and its
 * date is the date of the record that first qualified it.
 */
export function loadAchievements(context: ApplicationContext): Promise<LoadResult<AchievementsView>> {
  return attemptLoad(async () => {
    const achievements = evaluateAchievements(await readProgressionHistory(context))
    return {
      achievements,
      unlockedCount: achievements.filter((status) => status.unlock !== null).length,
      totalCount: achievements.length,
    }
  })
}
