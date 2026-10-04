import {
  addDays,
  applyExpAward,
  asDateKey,
  asWeekKey,
  totalExpToReachLevel,
  type Difficulty,
  type DomainEvent,
  type WeekKey,
} from '@/domain'

/**
 * Synthetic domain events for the development-only effects lab. They are plain
 * objects in the shape the real engine reports; nothing here reads or writes a
 * database, the clock or any game state, and nothing here exists in a
 * production build (only the lab imports it, and the lab is not in the route
 * table there).
 */

let counter = 0
/** A fresh number, so the queue's deduplication never swallows a repeated press. */
const fresh = (): number => {
  counter += 1
  return counter
}

const DATE = asDateKey('2026-10-05')
const FIRST_WEEK = asWeekKey('2026-10-05')

/** A distinct, valid Monday for every call. */
function freshWeek(): WeekKey {
  return addDays(FIRST_WEEK, 7 * fresh()) as WeekKey
}

/** An EXP award of `amount` starting at `startLevel` plus `into` EXP into it, as the progression engine would report it. */
function awardEvents(startLevel: number, into: number, amount: number): DomainEvent[] {
  const before = totalExpToReachLevel(startLevel) + into
  const change = applyExpAward(before, amount)
  const events: DomainEvent[] = [
    {
      type: 'XPAwarded',
      transactionId: `lab-tx-${fresh()}`,
      amount,
      sourceType: 'quest_completion',
      category: null,
      totalExpBefore: before,
      totalExpAfter: change.totalExpAfter,
    },
  ]
  if (change.levelsCrossed.length > 0) {
    events.push({
      type: 'LevelUp',
      previousLevel: change.before.level,
      newLevel: change.after.level,
      levelsCrossed: change.levelsCrossed,
      expIntoLevel: change.after.expIntoLevel,
      expToNext: change.after.expToNext,
    })
  }
  for (const transition of change.rankTransitions) events.push({ type: 'RankUp', ...transition })
  return events
}

/** A quest completion on a lab occurrence, so the lab's own completed rows can play their feedback. */
export function questCompletion(occurrenceId: string, difficulty: Difficulty, amount: number): DomainEvent[] {
  return [
    { type: 'QuestCompleted', occurrenceId, templateId: 'lab-template', dateKey: DATE, difficulty, category: 'discipline' },
    ...awardEvents(3, 10, amount).slice(0, 1), // only the EXP fact: no level change
  ]
}

/** One award that lifts the level from `fromLevel` by `levels` (a rank change follows when a boundary is crossed). */
export function levelUp(fromLevel: number, levels: number): DomainEvent[] {
  const before = totalExpToReachLevel(fromLevel) + 1
  const target = totalExpToReachLevel(fromLevel + levels) + 5
  return awardEvents(fromLevel, 1, target - before)
}

export function perfectDay(): DomainEvent[] {
  return [{ type: 'PerfectDayReached', dateKey: addDays(DATE, fresh()), completedCount: 6, eligibleCount: 6 }]
}

export function weeklyGoal(scoreNow: number): DomainEvent[] {
  return [{ type: 'WeeklyGoalCompleted', weekKey: FIRST_WEEK, goalId: `lab-goal-${fresh()}`, earnedPoints: 2, scoreNow }]
}

const ACHIEVEMENT_TITLES = ['First Quest', '10 Quests', '7 Day Streak', 'Perfect Week', 'Reach D Rank'] as const

export function achievements(count: number): DomainEvent[] {
  return Array.from({ length: count }, (_, index): DomainEvent => ({
    type: 'AchievementUnlocked',
    achievementId: `lab-${fresh()}`,
    title: ACHIEVEMENT_TITLES[index % ACHIEVEMENT_TITLES.length] ?? 'Achievement',
    description: 'A synthetic achievement from the effects lab.',
    evidence: { type: 'xp_transaction', transactionId: `lab-ev-${fresh()}`, seq: 1 },
    unlockedOn: DATE,
  }))
}

/** A finalized weekly board with `score` and `bonusExp` (the real bonus table is the domain's; the lab just shows a value). */
export function weeklyResult(score: number, bonusExp: number): DomainEvent[] {
  return [{ type: 'WeeklyBoardFinalized', weekKey: freshWeek(), score, bonusExp, rewardTierMinScore: score >= 6 ? score : null }]
}
