import { describe, expect, it } from 'vitest'
import { asDateKey, asWeekKey, totalExpToReachLevel, type DomainEvent } from '@/domain'
import { achievementUnlocked, awardBetweenLevels, awardEvents, questCompleted, weeklyFinalized } from '@/test/events'
import { planPresentation, weeklyTierOf } from './plan'
import type { AchievementsEntry, PresentationEntry, ProgressionEntry, WeeklyResultEntry } from './types'

const plan = (events: readonly DomainEvent[], origin: 'action' | 'lifecycle' = 'action') => planPresentation(events, { origin })
const kinds = (entries: readonly PresentationEntry[]) => entries.map((entry) => entry.kind)
const only = <T extends PresentationEntry['kind']>(entries: readonly PresentationEntry[], kind: T) =>
  entries.filter((entry): entry is Extract<PresentationEntry, { kind: T }> => entry.kind === kind)

describe('planPresentation — a plain quest completion', () => {
  it('is one minor feedback entry carrying the EXP the domain awarded', () => {
    const entries = plan([questCompleted('occ:1', 'C'), ...awardEvents(0, 35)])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'quest_feedback', class: 'minor', occurrenceId: 'occ:1', amount: 35, strength: 'base', cue: 'quest', id: 'quest:occ:1' })
  })

  it.each([
    ['E', 'base', 'quest'],
    ['D', 'base', 'quest'],
    ['C', 'base', 'quest'],
    ['B', 'strong', 'quest_strong'],
    ['A', 'strong', 'quest_strong'],
    ['S', 'major', 'quest_strong'],
  ] as const)('a %s quest answers with a %s response and the %s cue', (difficulty, strength, cue) => {
    const [entry] = plan([questCompleted('occ', difficulty), ...awardEvents(0, 10)])
    expect(entry).toMatchObject({ strength, cue })
  })

  it('plans nothing for no events', () => {
    expect(plan([])).toEqual([])
  })
})

describe('planPresentation — Level Up', () => {
  it('is one major entry for a single level, with the old and new level and the EXP gained', () => {
    const events = [questCompleted('occ'), ...awardBetweenLevels(14, 15)]
    const progression = only(plan(events), 'progression')
    expect(progression).toHaveLength(1)
    const entry = progression[0] as ProgressionEntry
    expect(entry.class).toBe('major')
    expect(entry.cue).toBe('level_up')
    expect(entry.level).toEqual({ from: 14, to: 15, levelsCrossed: [15] })
    expect(entry.rank).toBeNull()
    expect(entry.expGained).toBeGreaterThan(0)
  })

  it('folds several levels from one award into ONE entry (LV. 9 → LV. 12) and keeps every crossed level', () => {
    const entries = plan([questCompleted('occ'), ...awardBetweenLevels(11, 14, 3)])
    expect(only(entries, 'progression')).toHaveLength(1)
    const entry = only(entries, 'progression')[0] as ProgressionEntry
    expect(entry.level).toEqual({ from: 11, to: 14, levelsCrossed: [12, 13, 14] })
    expect(entry.class).toBe('major') // 11 → 14 stays inside D rank
  })

  it('holds the HUD at the state BEFORE the award: the old level and rank, with the bar full', () => {
    const before = totalExpToReachLevel(9) + 10
    const events = [questCompleted('occ'), ...awardEvents(before, 700)] // level 9 needs about 570 EXP
    const entry = only(plan(events), 'progression')[0] as ProgressionEntry
    expect(entry.level).toMatchObject({ from: 9, to: 10 })
    expect(entry.hold).toMatchObject({ level: 9, rank: 'E' })
    expect(entry.hold?.expToNext).toBeGreaterThan(0)
  })

  it('does not plan a Level Up for an award that crossed no level', () => {
    expect(only(plan([questCompleted('occ'), ...awardEvents(0, 10)]), 'progression')).toHaveLength(0)
  })

  it('is deduplicated by the award it came from', () => {
    const events = awardBetweenLevels(1, 2, 1)
    const [entry] = only(plan(events), 'progression')
    const xp = events[0]
    expect(entry?.id).toBe(`progression:${xp?.type === 'XPAwarded' ? xp.transactionId : ''}`)
  })
})

describe('planPresentation — Rank Up', () => {
  it.each([
    [9, 'E', 'D', 10],
    [19, 'D', 'C', 20],
    [34, 'C', 'B', 35],
    [49, 'B', 'A', 50],
    [74, 'A', 'S', 75],
    [99, 'S', 'special_100_plus', 100],
  ] as const)('LV. %i → the next level crosses %s → %s: critical, one entry, with the boundary level', (fromLevel, from, to, atLevel) => {
    const entry = only(plan(awardBetweenLevels(fromLevel, fromLevel + 1)), 'progression')[0] as ProgressionEntry
    expect(entry.class).toBe('critical')
    expect(entry.rank).toEqual({ from, to, atLevels: [atLevel] })
    expect(entry.level?.to).toBe(fromLevel + 1)
  })

  it('shows the same single overlay for LV. 9 → LV. 12 and the D-rank transition (level phase, then rank phase)', () => {
    const entry = only(plan(awardBetweenLevels(9, 12, 1)), 'progression')[0] as ProgressionEntry
    expect(entry.level).toEqual({ from: 9, to: 12, levelsCrossed: [10, 11, 12] })
    expect(entry.rank).toEqual({ from: 'E', to: 'D', atLevels: [10] })
    expect(entry.class).toBe('critical')
  })

  it('folds several rank transitions of one award into one entry (first previous → last new, every boundary kept)', () => {
    const entry = only(plan(awardBetweenLevels(8, 36)), 'progression')[0] as ProgressionEntry
    expect(entry.rank).toEqual({ from: 'E', to: 'B', atLevels: [10, 20, 35] })
  })

  it('past Level 100 the rank stays special_100_plus: a level up, not a rank up', () => {
    const entry = only(plan(awardBetweenLevels(100, 101)), 'progression')[0] as ProgressionEntry
    expect(entry.class).toBe('major')
    expect(entry.rank).toBeNull()
    expect(entry.level).toMatchObject({ from: 100, to: 101 })
  })

  it('uses the strongest cue for the Level 100 milestone and the rank cue for other ranks', () => {
    expect((only(plan(awardBetweenLevels(99, 100)), 'progression')[0] as ProgressionEntry).cue).toBe('perfect_week')
    expect((only(plan(awardBetweenLevels(9, 10)), 'progression')[0] as ProgressionEntry).cue).toBe('rank_up')
  })
})

describe('planPresentation — achievements', () => {
  it('is one medium entry for all unlocks of one action, in the order the events came (catalog order)', () => {
    const entries = plan([achievementUnlocked('a_first'), achievementUnlocked('b_second'), achievementUnlocked('c_third')])
    const entry = only(entries, 'achievements')
    expect(entry).toHaveLength(1)
    const achievements = entry[0] as AchievementsEntry
    expect(achievements.class).toBe('medium')
    expect(achievements.items.map((item) => item.id)).toEqual(['a_first', 'b_second', 'c_third'])
    expect(achievements.cue).toBe('achievement')
  })

  it('comes AFTER the Level Up / Rank Up reveal, so an achievement cannot spoil it', () => {
    const entries = plan([questCompleted('occ'), ...awardBetweenLevels(9, 10), achievementUnlocked('rank_d')])
    expect(kinds(entries)).toEqual(['quest_feedback', 'progression', 'achievements'])
  })
})

describe('planPresentation — the live day and week', () => {
  it('a live Perfect Day is a medium entry that never claims a finalized day', () => {
    const entries = plan([{ type: 'PerfectDayReached', dateKey: asDateKey('2026-10-05'), completedCount: 6, eligibleCount: 6 }])
    expect(entries).toEqual([expect.objectContaining({ kind: 'perfect_day', class: 'medium', id: 'perfect:2026-10-05' })])
  })

  it('a weekly goal reached while the week is open is minor feedback, not a result', () => {
    const entries = plan([{ type: 'WeeklyGoalCompleted', weekKey: asWeekKey('2026-10-05'), goalId: 'g1', earnedPoints: 2, scoreNow: 4 }])
    expect(entries).toEqual([expect.objectContaining({ kind: 'weekly_goal', class: 'minor', goalsReached: 1, score: 4 })])
  })

  it('all ten points reached while the week is open is a medium notice, still not a result', () => {
    const entries = plan([{ type: 'WeeklyGoalCompleted', weekKey: asWeekKey('2026-10-05'), goalId: 'g1', earnedPoints: 2, scoreNow: 10 }])
    expect(entries).toEqual([expect.objectContaining({ kind: 'weekly_all_goals', class: 'medium' })])
    expect(kinds(entries)).not.toContain('weekly_result')
  })
})

describe('planPresentation — Weekly Goal Crusher result (OD-20)', () => {
  it.each([
    [0, 'restrained', 'medium', null],
    [3, 'restrained', 'medium', null],
    [5, 'restrained', 'medium', null],
    [6, 'success', 'major', 'weekly_result'],
    [7, 'success', 'major', 'weekly_result'],
    [8, 'strong', 'major', 'weekly_result'],
    [9, 'strong', 'major', 'weekly_result'],
    [10, 'perfect', 'critical', 'perfect_week'],
  ] as const)('a score of %i is %s: %s, cue %s', (score, tier, presentationClass, cue) => {
    expect(weeklyTierOf(score)).toBe(tier)
    const [entry] = plan([weeklyFinalized(score, 0)], 'lifecycle')
    expect(entry).toMatchObject({ kind: 'weekly_result', tier, class: presentationClass, cue, origin: 'lifecycle' })
  })

  it('carries the score, the bonus EXP and the reward tier the domain reported', () => {
    const entry = only(plan([weeklyFinalized(8, 225, '2026-09-28', 8)]), 'weekly_result')[0] as WeeklyResultEntry
    expect(entry).toMatchObject({ score: 8, bonusExp: 225, rewardTierMinScore: 8, weekKey: '2026-09-28', id: 'weekly:2026-09-28' })
  })

  it('shows no reward tier when none was earned', () => {
    expect((only(plan([weeklyFinalized(4, 0)]), 'weekly_result')[0] as WeeklyResultEntry).rewardTierMinScore).toBeNull()
  })

  it('shows the result first and the level or rank the bonus caused after it', () => {
    const before = totalExpToReachLevel(9) + 300 // the 500 EXP bonus takes level 9 past its ~570 EXP
    const events = [weeklyFinalized(10, 500), ...awardEvents(before, 500)]
    const entries = plan(events, 'lifecycle')
    expect(kinds(entries)).toEqual(['weekly_result', 'progression'])
    expect((entries[1] as ProgressionEntry).origin).toBe('lifecycle')
  })
})

describe('planPresentation — order and identity', () => {
  it('orders one batch: feedback, goal, perfect day, weekly result, progression, achievements', () => {
    const events: DomainEvent[] = [
      questCompleted('occ'),
      ...awardBetweenLevels(9, 10),
      { type: 'PerfectDayReached', dateKey: asDateKey('2026-10-05'), completedCount: 6, eligibleCount: 6 },
      { type: 'WeeklyGoalCompleted', weekKey: asWeekKey('2026-10-05'), goalId: 'g', earnedPoints: 1, scoreNow: 2 },
      achievementUnlocked('x'),
    ]
    expect(kinds(plan(events))).toEqual(['quest_feedback', 'weekly_goal', 'perfect_day', 'progression', 'achievements'])
  })

  it('gives every entry of a batch a distinct id', () => {
    const entries = plan([questCompleted('occ'), ...awardBetweenLevels(9, 10), achievementUnlocked('x')])
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length)
  })

  it('the same events plan to the same entries (pure and deterministic)', () => {
    const events = [questCompleted('occ'), ...awardBetweenLevels(9, 12), achievementUnlocked('x')]
    expect(plan(events)).toEqual(plan(events))
  })
})
