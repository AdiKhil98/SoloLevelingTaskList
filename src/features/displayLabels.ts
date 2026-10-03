import type { Category, DayQuality, Difficulty, IsoWeekday, RankId } from '@/domain'

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

/**
 * UI wording for difficulty. The identifiers (E–S) and their EXP are the
 * domain's; these descriptive names are presentation only.
 */
const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  E: 'Trivial',
  D: 'Easy',
  C: 'Normal',
  B: 'Hard',
  A: 'Very Hard',
  S: 'Major',
}

export function difficultyName(difficulty: Difficulty): string {
  return DIFFICULTY_NAMES[difficulty]
}

/** `B — Hard` */
export function difficultyLabel(difficulty: Difficulty): string {
  return `${difficulty} — ${DIFFICULTY_NAMES[difficulty]}`
}

const WEEKDAY_NAMES: Record<IsoWeekday, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
}

/** `Monday` */
export function weekdayName(weekday: IsoWeekday): string {
  return WEEKDAY_NAMES[weekday]
}

/** `Mon` */
export function weekdayShortName(weekday: IsoWeekday): string {
  return WEEKDAY_NAMES[weekday].slice(0, 3)
}
