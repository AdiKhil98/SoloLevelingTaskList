import {
  evaluateAchievements,
  summarizeAchievements,
  summarizeDailyHistory,
  summarizeLedger,
  summarizeWeeklyHistory,
  type AchievementSummary,
  type CategoryStats,
  type DailyStats,
  type QuestTally,
  type QuestTemplate,
  type WeeklyStats,
} from '@/domain'
import { getOccurrence, listTemplates, listWeeklyRewardClaims } from '@/persistence'
import type { ApplicationContext } from '../context'
import { attemptLoad, type LoadResult } from '../loadResult'
import { readProgressionHistory } from './readProgressionHistory'

/** The Status screen lists this many most-completed quests. */
export const TOP_QUEST_COUNT = 3
/** The Status screen lists this many most-recent achievements. */
export const RECENT_ACHIEVEMENT_COUNT = 3

export interface TopQuest {
  readonly templateId: string
  /**
   * The quest's name: its template's current title; failing that, the title
   * stored in the snapshot of its latest completion (history survives a missing
   * template); null when neither exists, and the UI shows a fallback label.
   */
  readonly title: string | null
  readonly titleSource: 'template' | 'history' | 'unknown'
  readonly archived: boolean
  readonly completions: number
  readonly exp: number
}

export interface WeeklyProfile extends WeeklyStats {
  /** Finalized weeks whose real-life reward was claimed. */
  readonly rewardsClaimed: number
}

/** Everything the Status screen shows beyond today's snapshot, derived from history on every load. */
export interface PlayerProfile {
  /** Lifetime EXP as the ledger sums it (always equal to the level engine's input). */
  readonly totalExp: number
  /** EXP from quest completions only (no weekly bonus). */
  readonly questExp: number
  readonly totalCompletions: number
  /** Quest templates that are currently active. */
  readonly activeQuestCount: number
  readonly topQuests: readonly TopQuest[]
  /** The five categories, quest EXP only: weekly bonus EXP has no category. */
  readonly categories: readonly CategoryStats[]
  readonly days: DailyStats
  readonly weekly: WeeklyProfile
  readonly achievements: AchievementSummary
}

async function describeTopQuest(
  context: ApplicationContext,
  tally: QuestTally,
  templates: ReadonlyMap<string, QuestTemplate>,
): Promise<TopQuest> {
  const template = templates.get(tally.templateId)
  const base = { templateId: tally.templateId, completions: tally.completions, exp: tally.exp }
  if (template !== undefined) {
    return { ...base, title: template.title, titleSource: 'template', archived: template.status === 'archived' }
  }
  // The template is gone: the snapshot of its latest completion still names the quest.
  const occurrence = await getOccurrence(context.database, tally.lastOccurrenceId)
  if (occurrence !== null) return { ...base, title: occurrence.snapshot.title, titleSource: 'history', archived: false }
  return { ...base, title: null, titleSource: 'unknown', archived: false }
}

/**
 * Derives the player's statistics from stored history. Nothing here is a
 * counter: quest and category totals come from the XP ledger (immutable
 * snapshots, so editing or archiving a template cannot change them), day totals
 * from the Daily Summary chain, week totals from the finalized boards, and
 * achievements from all three. Reading writes nothing.
 */
export function loadPlayerProfile(context: ApplicationContext): Promise<LoadResult<PlayerProfile>> {
  return attemptLoad(async () => {
    const [history, templates, claims] = await Promise.all([
      readProgressionHistory(context),
      listTemplates(context.database),
      listWeeklyRewardClaims(context.database),
    ])
    const ledger = summarizeLedger(history.ledger)
    const templatesById = new Map(templates.map((template) => [template.id, template]))
    const topQuests = await Promise.all(
      ledger.quests.slice(0, TOP_QUEST_COUNT).map((tally) => describeTopQuest(context, tally, templatesById)),
    )

    return {
      totalExp: ledger.totalExp,
      questExp: ledger.questExp,
      totalCompletions: ledger.totalCompletions,
      activeQuestCount: templates.filter((template) => template.status === 'active').length,
      topQuests,
      categories: ledger.categories,
      days: summarizeDailyHistory(history.dailySummaries),
      weekly: { ...summarizeWeeklyHistory(history.weeklyBoards), rewardsClaimed: claims.length },
      achievements: summarizeAchievements(evaluateAchievements(history), RECENT_ACHIEVEMENT_COUNT),
    }
  })
}
