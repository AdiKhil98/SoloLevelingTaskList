import type { Category, DayQuality, RankId } from '@/domain'

/**
 * Display text for domain identifiers. These are presentation only: they name
 * what the domain decided and never decide anything themselves.
 */

/**
 * Neutral stand-in until Player Name onboarding exists (a later phase). Never a
 * real name.
 */
export const PLAYER_LABEL = 'PLAYER'

/**
 * `special_100_plus` shows `???` because its real display name is still open
 * (OD-01). This map is the one place that label lives.
 */
const RANK_LABELS: Record<RankId, string> = {
  E: 'E-RANK',
  D: 'D-RANK',
  C: 'C-RANK',
  B: 'B-RANK',
  A: 'A-RANK',
  S: 'S-RANK',
  special_100_plus: '???',
}

export function rankLabel(rank: RankId): string {
  return RANK_LABELS[rank]
}

const DAY_QUALITY_LABELS: Record<DayQuality, string> = {
  incomplete: 'Incomplete',
  completed: 'Completed',
  strong: 'Strong',
  perfect: 'Perfect',
  no_active_quests: 'No Active Quests',
}

export function dayQualityLabel(quality: DayQuality): string {
  return DAY_QUALITY_LABELS[quality]
}

const CATEGORY_LABELS: Record<Category, string> = {
  discipline: 'Discipline',
  fitness: 'Fitness',
  business: 'Business',
  knowledge: 'Knowledge',
  trading: 'Trading',
}

export function categoryLabel(category: Category): string {
  return CATEGORY_LABELS[category]
}
