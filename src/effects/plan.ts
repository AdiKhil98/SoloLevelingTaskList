import {
  levelStateOf,
  WEEKLY_BOARD_TOTAL_POINTS,
  WEEKLY_REWARD_TIER_SCORES,
  type AchievementUnlockedEvent,
  type Difficulty,
  type DomainEvent,
  type LevelUpEvent,
  type PerfectDayReachedEvent,
  type QuestCompletedEvent,
  type RankUpEvent,
  type WeeklyBoardFinalizedEvent,
  type WeeklyGoalCompletedEvent,
  type XPAwardedEvent,
} from '@/domain'
import type { Cue, PresentationEntry, PresentationOrigin, ProgressionEntry, QuestFeedbackEntry, WeeklyResultEntry, WeeklyTier } from './types'

/**
 * The first score that counts as a "successful" Goal Crusher result: the
 * lowest reward tier (also the lowest score that pays bonus EXP).
 */
const SUCCESS_MIN_SCORE = WEEKLY_REWARD_TIER_SCORES[0]
/** From this score a result is "strong" (8–9). */
const STRONG_MIN_SCORE = 8

/** Presentation strength of a result (OD-20): 0–5 restrained, 6–7 success, 8–9 strong, 10 perfect. */
export function weeklyTierOf(score: number): WeeklyTier {
  if (score >= WEEKLY_BOARD_TOTAL_POINTS) return 'perfect'
  if (score >= STRONG_MIN_SCORE) return 'strong'
  if (score >= SUCCESS_MIN_SCORE) return 'success'
  return 'restrained'
}

/** B and A quests get a stronger (still short) response, S the strongest. */
function strengthOf(difficulty: Difficulty): QuestFeedbackEntry['strength'] {
  if (difficulty === 'S') return 'major'
  if (difficulty === 'B' || difficulty === 'A') return 'strong'
  return 'base'
}

export interface PlanOptions {
  /** `lifecycle` for a startup / resume / midnight reconciliation, `action` for something the player just did. */
  readonly origin: PresentationOrigin
}

function eventsOfType<T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T): readonly Extract<DomainEvent, { type: T }>[] {
  return events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)
}

function questFeedback(completed: QuestCompletedEvent, awarded: XPAwardedEvent | undefined, origin: PresentationOrigin): QuestFeedbackEntry {
  const strength = strengthOf(completed.difficulty)
  return {
    kind: 'quest_feedback',
    class: 'minor',
    id: `quest:${completed.occurrenceId}`,
    origin,
    cue: strength === 'base' ? 'quest' : 'quest_strong',
    occurrenceId: completed.occurrenceId,
    amount: awarded?.amount ?? 0,
    strength,
  }
}

function progressionEntry(
  awarded: XPAwardedEvent | undefined,
  levelUp: LevelUpEvent | undefined,
  rankUps: readonly RankUpEvent[],
  origin: PresentationOrigin,
): ProgressionEntry | null {
  if (levelUp === undefined && rankUps.length === 0) return null
  const firstRank = rankUps[0]
  const lastRank = rankUps[rankUps.length - 1]
  const rank = firstRank === undefined || lastRank === undefined
    ? null
    : { from: firstRank.previousRank, to: lastRank.newRank, atLevels: rankUps.map((transition) => transition.atLevel) }
  const level = levelUp === undefined ? null : { from: levelUp.previousLevel, to: levelUp.newLevel, levelsCrossed: levelUp.levelsCrossed }

  // The held HUD is the state BEFORE the award (read back from the event's own totals, never recomputed from the player).
  const held = awarded === undefined ? null : levelStateOf(awarded.totalExpBefore)
  const reachedHundred = rank !== null && rank.to === 'special_100_plus'
  const cue: Cue = rank === null ? 'level_up' : reachedHundred ? 'perfect_week' : 'rank_up'
  return {
    kind: 'progression',
    class: rank === null ? 'major' : 'critical',
    id: `progression:${awarded?.transactionId ?? `level-${levelUp?.newLevel ?? 'rank'}`}`,
    origin,
    cue,
    level,
    rank,
    expGained: awarded?.amount ?? 0,
    hold: held === null ? null : { level: held.level, rank: held.rank, expToNext: held.expToNext },
  }
}

function weeklyResult(finalized: WeeklyBoardFinalizedEvent, origin: PresentationOrigin): WeeklyResultEntry {
  const tier = weeklyTierOf(finalized.score)
  const cue: Cue | null = tier === 'perfect' ? 'perfect_week' : tier === 'restrained' ? null : 'weekly_result'
  return {
    kind: 'weekly_result',
    class: tier === 'perfect' ? 'critical' : tier === 'restrained' ? 'medium' : 'major',
    id: `weekly:${finalized.weekKey}`,
    origin,
    cue,
    tier,
    weekKey: finalized.weekKey,
    score: finalized.score,
    bonusExp: finalized.bonusExp,
    rewardTierMinScore: finalized.rewardTierMinScore,
  }
}

/**
 * Turns the domain events one action or reconciliation produced into the
 * presentation entries to show, in the order to show them. Pure: no clock, no
 * storage, no randomness. It reads facts; it never decides one.
 *
 * Narrative order (a batch is first-in, first-out; heavier classes never
 * overtake an earlier entry, they only pause the lighter ones):
 *
 *   1. quest feedback (minor)      2. goal feedback (minor)
 *   3. all-goals / perfect day (medium)
 *   4. weekly result (by tier)     5. level / rank reveal (major or critical)
 *   6. achievements (medium, one popup)
 *
 * Progression comes BEFORE achievements, so an achievement can never spoil a
 * Level or Rank reveal. One award that crosses several levels is one entry
 * (`LV. 9 → LV. 12`), and a rank change makes that same entry critical.
 */
export function planPresentation(events: readonly DomainEvent[], { origin }: PlanOptions): readonly PresentationEntry[] {
  const entries: PresentationEntry[] = []
  const awarded = eventsOfType(events, 'XPAwarded')[0]

  const completed = eventsOfType(events, 'QuestCompleted')[0]
  if (completed !== undefined) entries.push(questFeedback(completed, awarded, origin))

  const goalEvents: readonly WeeklyGoalCompletedEvent[] = eventsOfType(events, 'WeeklyGoalCompleted')
  const lastGoal = goalEvents[goalEvents.length - 1]
  if (lastGoal !== undefined) {
    const weekKey = lastGoal.weekKey
    const ids = goalEvents.map((event) => event.goalId).join(',')
    if (lastGoal.scoreNow >= WEEKLY_BOARD_TOTAL_POINTS) {
      entries.push({ kind: 'weekly_all_goals', class: 'medium', id: `weekly_all:${weekKey}`, origin, cue: 'achievement', weekKey })
    } else {
      entries.push({
        kind: 'weekly_goal',
        class: 'minor',
        id: `weekly_goal:${weekKey}:${ids}:${lastGoal.scoreNow}`,
        origin,
        cue: null,
        weekKey,
        goalsReached: goalEvents.length,
        score: lastGoal.scoreNow,
      })
    }
  }

  const perfect: PerfectDayReachedEvent | undefined = eventsOfType(events, 'PerfectDayReached')[0]
  if (perfect !== undefined) {
    entries.push({ kind: 'perfect_day', class: 'medium', id: `perfect:${perfect.dateKey}`, origin, cue: 'perfect_day', dateKey: perfect.dateKey })
  }

  for (const finalized of eventsOfType(events, 'WeeklyBoardFinalized')) entries.push(weeklyResult(finalized, origin))

  const progression = progressionEntry(awarded, eventsOfType(events, 'LevelUp')[0], eventsOfType(events, 'RankUp'), origin)
  if (progression !== null) entries.push(progression)

  const unlocked: readonly AchievementUnlockedEvent[] = eventsOfType(events, 'AchievementUnlocked')
  if (unlocked.length > 0) {
    entries.push({
      kind: 'achievements',
      class: 'medium',
      id: `achievements:${unlocked.map((event) => event.achievementId).join('|')}`,
      origin,
      cue: 'achievement',
      items: unlocked.map((event) => ({ id: event.achievementId, title: event.title, description: event.description })),
    })
  }

  return entries
}
