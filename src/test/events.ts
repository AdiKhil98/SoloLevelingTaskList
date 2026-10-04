import {
  applyExpAward,
  asDateKey,
  asWeekKey,
  totalExpToReachLevel,
  type AchievementUnlockedEvent,
  type DomainEvent,
  type Difficulty,
} from '@/domain'

/** Builders for domain events in the shape the real engine reports them. Test-only. */

let sequence = 0
const next = () => {
  sequence += 1
  return sequence
}

/** `XPAwarded`, then `LevelUp` / `RankUp` exactly as the progression engine would report an award of `amount` from `totalExpBefore`. */
export function awardEvents(totalExpBefore: number, amount: number, transactionId = `tx-${next()}`): DomainEvent[] {
  const change = applyExpAward(totalExpBefore, amount)
  const events: DomainEvent[] = [
    { type: 'XPAwarded', transactionId, amount, sourceType: 'quest_completion', category: 'discipline', totalExpBefore, totalExpAfter: change.totalExpAfter },
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

/** An award that takes a player who is `into` EXP into `fromLevel` to the start of `toLevel` plus `extra`. */
export function awardBetweenLevels(fromLevel: number, toLevel: number, into = 1, extra = 0): DomainEvent[] {
  const before = totalExpToReachLevel(fromLevel) + into
  return awardEvents(before, totalExpToReachLevel(toLevel) + extra - before)
}

export function questCompleted(occurrenceId: string, difficulty: Difficulty = 'E'): DomainEvent {
  return { type: 'QuestCompleted', occurrenceId, templateId: 'tpl', dateKey: asDateKey('2026-10-05'), difficulty, category: 'discipline' }
}

export function achievementUnlocked(id: string, title = id.toUpperCase()): AchievementUnlockedEvent {
  return {
    type: 'AchievementUnlocked',
    achievementId: id,
    title,
    description: `${title} description`,
    evidence: { type: 'xp_transaction', transactionId: `ev-${id}`, seq: 1 },
    unlockedOn: asDateKey('2026-10-05'),
  }
}

export function weeklyFinalized(score: number, bonusExp: number, week = '2026-09-28', tier: number | null = score >= 6 ? score : null): DomainEvent {
  return { type: 'WeeklyBoardFinalized', weekKey: asWeekKey(week), score, bonusExp, rewardTierMinScore: tier }
}
