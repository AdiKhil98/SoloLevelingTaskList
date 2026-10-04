import { dateKeyParts, type AchievementGroup, type Category, type DateKey, type DayQuality, type Difficulty, type IsoWeekday, type RankId } from '@/domain'

/**
 * Display text for domain identifiers. These are presentation only: they name
 * what the domain decided and never decide anything themselves.
 */

/**
 * The generic player identity: shown when the player skipped the name (or is a
 * legacy player who never chose one). Never a real name.
 */
export const PLAYER_LABEL = 'PLAYER'

/** The name to show: the chosen one, or the generic label when none was chosen. */
export function playerDisplayName(name: string | null | undefined): string {
  return name ?? PLAYER_LABEL
}

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

/** `1 day` / `4 days` */
export function daysLabel(days: number): string {
  return days === 1 ? '1 day' : `${days} days`
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** `Oct 5, 2026` */
export function formatDateKey(key: DateKey): string {
  const { year, month, day } = dateKeyParts(key)
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

/**
 * The name shown for a quest that history counts but that neither its template
 * nor any stored snapshot can name. The count itself is never dropped.
 */
export const UNKNOWN_QUEST_LABEL = 'Unknown quest'

/** The order the Achievements screen lists its groups in. */
export const ACHIEVEMENT_GROUP_ORDER: readonly AchievementGroup[] = ['general', 'daily', 'streak', 'weekly', 'rank']

const ACHIEVEMENT_GROUP_LABELS: Record<AchievementGroup, string> = {
  general: 'General',
  daily: 'Daily',
  streak: 'Streak',
  weekly: 'Weekly',
  rank: 'Rank',
}

export function achievementGroupLabel(group: AchievementGroup): string {
  return ACHIEVEMENT_GROUP_LABELS[group]
}

/** A mean weekly score to one decimal (`7.3`), or a dash before any week was finalized. */
export function averageScoreLabel(average: number | null): string {
  return average === null ? '—' : (Math.round(average * 10) / 10).toFixed(1)
}
