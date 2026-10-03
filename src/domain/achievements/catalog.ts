import { DAILY_QUALITY_THRESHOLDS } from '../config/daily'
import { RANK_BANDS, type RankId } from '../config/ranks'
import { WEEKLY_BOARD_TOTAL_POINTS } from '../config/weekly'
import type { AchievementCondition, AchievementDefinition, AchievementGroup } from './types'

/**
 * The V1 achievement catalog (OD-03, resolved in Phase 08): 28 trophies, all
 * quest-agnostic. Nothing here recognizes a "Gym" or any other specific quest
 * (OD-18 is deferred); every condition is a total, a streak, a day or week
 * result, or a level. Days and weeks count only once they are finalized.
 */

function define(
  group: AchievementGroup,
  id: string,
  title: string,
  description: string,
  condition: AchievementCondition,
): AchievementDefinition {
  return { id, group, title, description, condition }
}

function rankBandStart(rank: RankId): number {
  const band = RANK_BANDS.find((candidate) => candidate.rank === rank)
  if (band === undefined) throw new Error(`Unknown rank ${rank}`)
  return band.minLevel
}

function reachRank(rank: Exclude<RankId, 'E' | 'special_100_plus'>): AchievementDefinition {
  return define(
    'rank',
    `rank_${rank.toLowerCase()}`,
    `Reach ${rank} Rank`,
    `Reach Level ${rankBandStart(rank)}, where ${rank} Rank begins.`,
    { type: 'rank_reached', rank },
  )
}

const { completedPercent, strongPercent } = DAILY_QUALITY_THRESHOLDS
const TOP = WEEKLY_BOARD_TOTAL_POINTS

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  // General
  define('general', 'first_quest', 'First Quest', 'Complete your first quest.', { type: 'quest_completions', count: 1 }),
  define('general', 'quests_10', '10 Quests', 'Complete 10 quests.', { type: 'quest_completions', count: 10 }),
  define('general', 'quests_50', '50 Quests', 'Complete 50 quests.', { type: 'quest_completions', count: 50 }),
  define('general', 'quests_100', '100 Quests', 'Complete 100 quests.', { type: 'quest_completions', count: 100 }),
  define('general', 'quests_250', '250 Quests', 'Complete 250 quests.', { type: 'quest_completions', count: 250 }),
  define('general', 'quests_500', '500 Quests', 'Complete 500 quests.', { type: 'quest_completions', count: 500 }),

  // Daily: a day counts after it ends
  define('daily', 'first_completed_day', 'First Completed Day', `End a day with at least ${completedPercent}% of its quests complete.`, {
    type: 'finalized_days',
    milestone: 'completed',
    count: 1,
  }),
  define('daily', 'first_strong_day', 'First Strong Day', `End a day with at least ${strongPercent}% of its quests complete.`, {
    type: 'finalized_days',
    milestone: 'strong',
    count: 1,
  }),
  define('daily', 'first_perfect_day', 'First Perfect Day', 'End a day with every quest complete.', {
    type: 'finalized_days',
    milestone: 'perfect',
    count: 1,
  }),
  define('daily', 'perfect_days_5', '5 Perfect Days', 'End 5 days with every quest complete.', { type: 'finalized_days', milestone: 'perfect', count: 5 }),
  define('daily', 'perfect_days_10', '10 Perfect Days', 'End 10 days with every quest complete.', { type: 'finalized_days', milestone: 'perfect', count: 10 }),
  define('daily', 'perfect_days_25', '25 Perfect Days', 'End 25 days with every quest complete.', { type: 'finalized_days', milestone: 'perfect', count: 25 }),

  // Streak
  define('streak', 'streak_3', '3 Day Streak', 'Reach a Daily Streak of 3 days.', { type: 'daily_streak', days: 3 }),
  define('streak', 'streak_7', '7 Day Streak', 'Reach a Daily Streak of 7 days.', { type: 'daily_streak', days: 7 }),
  define('streak', 'streak_14', '14 Day Streak', 'Reach a Daily Streak of 14 days.', { type: 'daily_streak', days: 14 }),
  define('streak', 'streak_30', '30 Day Streak', 'Reach a Daily Streak of 30 days.', { type: 'daily_streak', days: 30 }),

  // Weekly Goal Crusher: a week counts after it is finalized
  define('weekly', 'first_goal_crusher_week', 'First Goal Crusher Week', 'Finish your first Weekly Goal Crusher week.', {
    type: 'finalized_weeks',
    minScore: 0,
    count: 1,
  }),
  define('weekly', 'first_week_6_plus', 'First 6+/10 Week', `Finish a Goal Crusher week scoring 6 or more out of ${TOP}.`, {
    type: 'finalized_weeks',
    minScore: 6,
    count: 1,
  }),
  define('weekly', 'first_week_8_plus', 'First 8+/10 Week', `Finish a Goal Crusher week scoring 8 or more out of ${TOP}.`, {
    type: 'finalized_weeks',
    minScore: 8,
    count: 1,
  }),
  define('weekly', 'first_perfect_week', 'First Perfect Week', `Finish a Goal Crusher week scoring ${TOP} out of ${TOP}.`, {
    type: 'finalized_weeks',
    minScore: TOP,
    count: 1,
  }),
  define('weekly', 'perfect_weeks_3', '3 Perfect Weeks', `Finish 3 Goal Crusher weeks scoring ${TOP} out of ${TOP}.`, {
    type: 'finalized_weeks',
    minScore: TOP,
    count: 3,
  }),
  define('weekly', 'perfect_weeks_5', '5 Perfect Weeks', `Finish 5 Goal Crusher weeks scoring ${TOP} out of ${TOP}.`, {
    type: 'finalized_weeks',
    minScore: TOP,
    count: 5,
  }),

  // Rank. Level 100 is its own milestone and does not name the Level 100+ rank (OD-01).
  reachRank('D'),
  reachRank('C'),
  reachRank('B'),
  reachRank('A'),
  reachRank('S'),
  define('rank', 'level_100', 'Level 100', 'Reach Level 100.', { type: 'level_reached', level: 100 }),
]
