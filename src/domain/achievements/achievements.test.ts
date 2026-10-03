import { describe, expect, it } from 'vitest'
import { RANK_BANDS } from '../config/ranks'
import { totalExpToReachLevel } from '../progression/levels'
import type { DayQuality } from '../daily/dailyProgress'
import type { ProgressionHistory } from '../stats/history'
import { boardsScored, buildDayChain, buildLedger, finalizedBoard, mondayAfter, questRows, shuffled } from '../stats/testFixtures'
import { activeBoard } from '../weekly/testFixtures'
import { ACHIEVEMENT_CATALOG } from './catalog'
import { evaluateAchievements, summarizeAchievements } from './evaluate'
import type { AchievementDefinition, AchievementStatus } from './types'

const NO_HISTORY: ProgressionHistory = { ledger: [], dailySummaries: [], weeklyBoards: [] }

function statusOf(history: ProgressionHistory, id: string): AchievementStatus {
  const status = evaluateAchievements(history).find((entry) => entry.definition.id === id)
  if (status === undefined) throw new Error(`no achievement ${id}`)
  return status
}

const isUnlocked = (history: ProgressionHistory, id: string) => statusOf(history, id).unlock !== null

const daysHistory = (qualities: readonly DayQuality[]): ProgressionHistory => ({ ...NO_HISTORY, dailySummaries: buildDayChain(qualities) })
const weeksHistory = (scores: readonly number[]): ProgressionHistory => ({ ...NO_HISTORY, weeklyBoards: boardsScored(scores) })
const questHistory = (count: number): ProgressionHistory => ({ ...NO_HISTORY, ledger: buildLedger(questRows(count)) })

describe('the V1 catalog (OD-03)', () => {
  it('has 28 achievements with unique, stable ids', () => {
    expect(ACHIEVEMENT_CATALOG).toHaveLength(28)
    expect(new Set(ACHIEVEMENT_CATALOG.map((definition) => definition.id)).size).toBe(28)
  })

  it('is grouped 6 general · 6 daily · 4 streak · 6 weekly · 6 rank', () => {
    const count = (group: string) => ACHIEVEMENT_CATALOG.filter((definition) => definition.group === group).length
    expect([count('general'), count('daily'), count('streak'), count('weekly'), count('rank')]).toEqual([6, 6, 4, 6, 6])
  })

  it('lists exactly the approved titles', () => {
    expect(ACHIEVEMENT_CATALOG.map((definition) => definition.title)).toEqual([
      'First Quest', '10 Quests', '50 Quests', '100 Quests', '250 Quests', '500 Quests',
      'First Completed Day', 'First Strong Day', 'First Perfect Day', '5 Perfect Days', '10 Perfect Days', '25 Perfect Days',
      '3 Day Streak', '7 Day Streak', '14 Day Streak', '30 Day Streak',
      'First Goal Crusher Week', 'First 6+/10 Week', 'First 8+/10 Week', 'First Perfect Week', '3 Perfect Weeks', '5 Perfect Weeks',
      'Reach D Rank', 'Reach C Rank', 'Reach B Rank', 'Reach A Rank', 'Reach S Rank', 'Level 100',
    ])
  })

  it('gives every achievement a title and description, and awards nothing: a definition has no reward field', () => {
    for (const definition of ACHIEVEMENT_CATALOG) {
      expect(definition.title.trim()).not.toBe('')
      expect(definition.description.trim()).not.toBe('')
      expect(Object.keys(definition).sort()).toEqual(['condition', 'description', 'group', 'id', 'title'])
    }
  })

  it('has only positive whole-number thresholds', () => {
    for (const { condition } of ACHIEVEMENT_CATALOG) {
      const numbers = Object.values(condition).filter((value): value is number => typeof value === 'number')
      for (const value of numbers) expect(Number.isInteger(value) && value >= 0).toBe(true)
      if (condition.type === 'quest_completions' || condition.type === 'finalized_days' || condition.type === 'finalized_weeks') {
        expect(condition.count).toBeGreaterThan(0)
      }
    }
  })

  it('guesses nothing about a specific quest: no Gym, no Fitness (OD-18 is deferred)', () => {
    expect(JSON.stringify(ACHIEVEMENT_CATALOG)).not.toMatch(/gym|fitness|category|template/i)
  })

  it('ties the rank achievements to the rank bands, and Level 100 to a level, never naming the Level 100+ rank (OD-01)', () => {
    const ranks = ACHIEVEMENT_CATALOG.filter((definition) => definition.condition.type === 'rank_reached')
    expect(ranks.map((definition) => (definition.condition.type === 'rank_reached' ? definition.condition.rank : null))).toEqual(['D', 'C', 'B', 'A', 'S'])
    expect(ACHIEVEMENT_CATALOG.find((definition) => definition.id === 'level_100')?.condition).toEqual({ type: 'level_reached', level: 100 })
    expect(ACHIEVEMENT_CATALOG.some((definition) => /\?\?\?|special/i.test(`${definition.title} ${definition.description}`))).toBe(false)
    // each rank description states the level its band starts at
    for (const definition of ranks) {
      const { condition } = definition
      if (condition.type !== 'rank_reached') continue
      const band = RANK_BANDS.find((candidate) => candidate.rank === condition.rank)
      expect(definition.description).toContain(`Level ${band?.minLevel}`)
    }
  })
})

describe('with no history', () => {
  it('unlocks nothing and reports zero progress (a new player is already Level 1) toward every target', () => {
    const statuses = evaluateAchievements(NO_HISTORY)
    expect(statuses).toHaveLength(28)
    for (const { definition, unlock, progress } of statuses) {
      expect(unlock).toBeNull()
      expect(progress.target).toBeGreaterThan(0)
      const levelBased = definition.condition.type === 'level_reached' || definition.condition.type === 'rank_reached'
      expect(progress.current).toBe(levelBased ? 1 : 0)
    }
  })
})

describe('General: quest completions', () => {
  it.each([
    ['first_quest', 1],
    ['quests_10', 10],
    ['quests_50', 50],
    ['quests_100', 100],
    ['quests_250', 250],
    ['quests_500', 500],
  ] as const)('%s unlocks at exactly the %ith completion', (id, count) => {
    expect(isUnlocked(questHistory(count - 1), id)).toBe(false)
    expect(isUnlocked(questHistory(count), id)).toBe(true)
    expect(isUnlocked(questHistory(count + 7), id)).toBe(true)
  })

  it('takes the unlock from the exact ledger row of the Nth completion, even when more rows follow', () => {
    const ledger = buildLedger(questRows(60))
    const { unlock } = statusOf({ ...NO_HISTORY, ledger }, 'quests_50')
    const fiftieth = ledger[49]!
    expect(unlock).toEqual({
      unlockedAt: fiftieth.createdAt,
      unlockedOn: fiftieth.effectiveDate,
      evidence: { type: 'xp_transaction', transactionId: fiftieth.id, seq: 50 },
    })
  })

  it('does not count weekly bonus rows as quests', () => {
    const ledger = buildLedger([...questRows(9), { kind: 'weekly', weekKey: mondayAfter(0), amount: 500, score: 10 }])
    expect(isUnlocked({ ...NO_HISTORY, ledger }, 'quests_10')).toBe(false)
    expect(statusOf({ ...NO_HISTORY, ledger }, 'quests_10').progress).toEqual({ current: 9, target: 10 })
  })

  it('reports progress toward the target and caps it there', () => {
    expect(statusOf(questHistory(37), 'quests_50').progress).toEqual({ current: 37, target: 50 })
    expect(statusOf(questHistory(70), 'quests_50').progress).toEqual({ current: 50, target: 50 })
  })
})

describe('Daily: finalized days', () => {
  it('First Completed Day unlocks from a day at 70% or better, not from an incomplete or empty one', () => {
    expect(isUnlocked(daysHistory(['incomplete', 'no_active_quests']), 'first_completed_day')).toBe(false)
    expect(isUnlocked(daysHistory(['incomplete', 'completed']), 'first_completed_day')).toBe(true)
  })

  it('First Strong Day unlocks from Strong or Perfect, not from Completed', () => {
    expect(isUnlocked(daysHistory(['completed', 'completed']), 'first_strong_day')).toBe(false)
    expect(isUnlocked(daysHistory(['strong']), 'first_strong_day')).toBe(true)
    expect(isUnlocked(daysHistory(['perfect']), 'first_strong_day')).toBe(true)
  })

  it('a Perfect day also meets the Completed and Strong milestones, on the same record', () => {
    const history = daysHistory(['incomplete', 'perfect'])
    for (const id of ['first_completed_day', 'first_strong_day', 'first_perfect_day']) {
      expect(statusOf(history, id).unlock?.evidence).toEqual({ type: 'daily_summary', dateKey: '2026-03-02' })
    }
  })

  it('First Perfect Day needs a Perfect day (100%), not a Strong one', () => {
    expect(isUnlocked(daysHistory(['strong', 'strong']), 'first_perfect_day')).toBe(false)
    expect(isUnlocked(daysHistory(['strong', 'perfect']), 'first_perfect_day')).toBe(true)
  })

  it.each([
    ['perfect_days_5', 5],
    ['perfect_days_10', 10],
    ['perfect_days_25', 25],
  ] as const)('%s unlocks at exactly the %ith Perfect day', (id, count) => {
    const filler: DayQuality[] = ['incomplete', 'strong']
    const build = (perfect: number) => daysHistory([...filler, ...Array.from({ length: perfect }, () => 'perfect' as const)])
    expect(isUnlocked(build(count - 1), id)).toBe(false)
    expect(isUnlocked(build(count), id)).toBe(true)
  })

  it('takes the Nth Perfect day as the record, counting only Perfect days, and uses its finalization', () => {
    const chain = buildDayChain(['perfect', 'incomplete', 'perfect', 'strong', 'perfect', 'perfect', 'perfect', 'no_active_quests', 'perfect'])
    const { unlock } = statusOf({ ...NO_HISTORY, dailySummaries: chain }, 'perfect_days_5')
    const fifthPerfect = chain[6]! // days 1, 3, 5, 6, 7 are Perfect
    expect(unlock).toEqual({ unlockedAt: fifthPerfect.finalizedAt, unlockedOn: fifthPerfect.dateKey, evidence: { type: 'daily_summary', dateKey: fifthPerfect.dateKey } })
  })

  it('unlocks only from finalized Daily Summaries: completions alone, however many, unlock no day achievement', () => {
    // 10 quests were completed today (they are in the ledger) but no day is finalized yet.
    const history: ProgressionHistory = { ...NO_HISTORY, ledger: buildLedger(questRows(10)) }
    for (const id of ['first_completed_day', 'first_strong_day', 'first_perfect_day', 'perfect_days_5']) {
      expect(isUnlocked(history, id)).toBe(false)
    }
    expect(statusOf(history, 'first_perfect_day').progress).toEqual({ current: 0, target: 1 })
  })
})

describe('Streak', () => {
  const streak = (length: number, quality: DayQuality = 'completed'): DayQuality[] => Array.from({ length }, () => quality)

  it.each([
    ['streak_3', 3],
    ['streak_7', 7],
    ['streak_14', 14],
    ['streak_30', 30],
  ] as const)('%s unlocks on the day the streak first stands at %i', (id, days) => {
    expect(isUnlocked(daysHistory(streak(days - 1)), id)).toBe(false)
    const history = daysHistory(streak(days + 3))
    const { unlock } = statusOf(history, id)
    const reaching = history.dailySummaries.find((day) => day.currentStreakAfter === days)!
    expect(unlock).toEqual({ unlockedAt: reaching.finalizedAt, unlockedOn: reaching.dateKey, evidence: { type: 'daily_summary', dateKey: reaching.dateKey } })
  })

  it('stays unlocked after the streak resets, and progress follows the best streak', () => {
    const history = daysHistory([...streak(7), 'incomplete', ...streak(2)])
    expect(isUnlocked(history, 'streak_7')).toBe(true)
    expect(statusOf(history, 'streak_14').progress).toEqual({ current: 7, target: 14 })
  })

  it('is not broken by a No Active Quests day (neutral) but is by an Incomplete day', () => {
    expect(isUnlocked(daysHistory(['completed', 'completed', 'no_active_quests', 'completed']), 'streak_3')).toBe(true)
    expect(isUnlocked(daysHistory(['completed', 'completed', 'incomplete', 'completed']), 'streak_3')).toBe(false)
  })

  it('counts Strong and Perfect days toward the Daily Streak too', () => {
    expect(isUnlocked(daysHistory(['strong', 'perfect', 'completed']), 'streak_3')).toBe(true)
  })

  it('needs finalized days: no streak achievement without summaries', () => {
    expect(isUnlocked({ ...NO_HISTORY, ledger: buildLedger(questRows(40)) }, 'streak_3')).toBe(false)
  })
})

describe('Weekly Goal Crusher', () => {
  it('First Goal Crusher Week unlocks from any finalized board, whatever its score', () => {
    expect(isUnlocked(weeksHistory([]), 'first_goal_crusher_week')).toBe(false)
    expect(isUnlocked(weeksHistory([0]), 'first_goal_crusher_week')).toBe(true)
  })

  it('does not count an active board', () => {
    const history: ProgressionHistory = { ...NO_HISTORY, weeklyBoards: [activeBoard()] }
    expect(isUnlocked(history, 'first_goal_crusher_week')).toBe(false)
  })

  it.each([
    ['first_week_6_plus', 6],
    ['first_week_8_plus', 8],
    ['first_perfect_week', 10],
  ] as const)('%s unlocks from the first board scoring %i or more', (id, minimum) => {
    expect(isUnlocked(weeksHistory([minimum - 1, minimum - 2]), id)).toBe(false)
    expect(isUnlocked(weeksHistory([minimum - 1, minimum]), id)).toBe(true)
    expect(isUnlocked(weeksHistory([10]), id)).toBe(true)
  })

  it('only a board scoring exactly 10/10 is a Perfect Week', () => {
    expect(isUnlocked(weeksHistory([9, 9, 9]), 'first_perfect_week')).toBe(false)
  })

  it.each([
    ['perfect_weeks_3', 3],
    ['perfect_weeks_5', 5],
  ] as const)('%s unlocks at exactly the %ith Perfect Week', (id, count) => {
    const scores = (perfect: number) => [4, 9, ...Array.from({ length: perfect }, () => 10)]
    expect(isUnlocked(weeksHistory(scores(count - 1)), id)).toBe(false)
    expect(isUnlocked(weeksHistory(scores(count)), id)).toBe(true)
  })

  it('takes the board that first met the condition: its week, Sunday and finalization instant', () => {
    const boards = boardsScored([5, 7, 10, 10, 9])
    const { unlock } = statusOf({ ...NO_HISTORY, weeklyBoards: boards }, 'first_week_6_plus')
    const second = boards[1]!
    expect(unlock).toEqual({
      unlockedAt: second.finalization!.finalizedAt,
      unlockedOn: second.endDate,
      evidence: { type: 'weekly_board', weekKey: second.weekKey },
    })
  })

  it('reports progress toward Perfect Weeks from the finalized snapshots', () => {
    expect(statusOf(weeksHistory([10, 9, 10]), 'perfect_weeks_5').progress).toEqual({ current: 2, target: 5 })
  })

  it('reads the frozen finalization score, never the goals’ progress (the fixture’s goals are all still at 0)', () => {
    const board = finalizedBoard(mondayAfter(0), 10, 500)
    expect(board.goals.every((goal) => goal.manualProgress === 0)).toBe(true)
    expect(isUnlocked({ ...NO_HISTORY, weeklyBoards: [board] }, 'first_perfect_week')).toBe(true)
  })
})

describe('Rank and Level 100', () => {
  const ledgerReaching = (totalExp: number) => buildLedger([{ kind: 'quest', amount: totalExp }])
  const bands = [
    ['rank_d', 10],
    ['rank_c', 20],
    ['rank_b', 35],
    ['rank_a', 50],
    ['rank_s', 75],
    ['level_100', 100],
  ] as const

  it.each(bands)('%s unlocks at exactly the EXP that reaches Level %i, one EXP short does not', (id, level) => {
    const needed = totalExpToReachLevel(level)
    expect(isUnlocked({ ...NO_HISTORY, ledger: ledgerReaching(needed - 1) }, id)).toBe(false)
    expect(isUnlocked({ ...NO_HISTORY, ledger: ledgerReaching(needed) }, id)).toBe(true)
  })

  it('takes the exact ledger row whose EXP first reached the level, not a later one', () => {
    const needed = totalExpToReachLevel(10)
    const ledger = buildLedger([{ kind: 'quest', date: '2026-03-01', amount: needed - 5 }, { kind: 'quest', date: '2026-03-02', amount: 5 }, { kind: 'quest', date: '2026-03-03', amount: 500 }])
    const { unlock } = statusOf({ ...NO_HISTORY, ledger }, 'rank_d')
    expect(unlock).toEqual({ unlockedAt: ledger[1]!.createdAt, unlockedOn: '2026-03-02', evidence: { type: 'xp_transaction', transactionId: ledger[1]!.id, seq: 2 } })
  })

  it('one large award crosses several ranks at once and unlocks each on that same record', () => {
    const history: ProgressionHistory = { ...NO_HISTORY, ledger: ledgerReaching(totalExpToReachLevel(50)) }
    const evidence = ['rank_d', 'rank_c', 'rank_b', 'rank_a'].map((id) => statusOf(history, id).unlock?.evidence)
    expect(new Set(evidence.map((entry) => JSON.stringify(entry))).size).toBe(1)
    expect(evidence[0]).not.toBeUndefined()
    expect(isUnlocked(history, 'rank_s')).toBe(false)
  })

  it('a weekly bonus can cross a level, dated to the Sunday of its week with the real write instant', () => {
    const needed = totalExpToReachLevel(10)
    const ledger = buildLedger([{ kind: 'quest', amount: needed - 100 }, { kind: 'weekly', weekKey: mondayAfter(0), amount: 100, score: 6 }])
    const { unlock } = statusOf({ ...NO_HISTORY, ledger }, 'rank_d')
    expect(unlock).toEqual({ unlockedAt: ledger[1]!.createdAt, unlockedOn: '2026-03-08', evidence: { type: 'xp_transaction', transactionId: ledger[1]!.id, seq: 2 } })
  })

  it('has no further rank achievement past Level 100: Level 101 and Level 250 unlock nothing new', () => {
    const atHundred = evaluateAchievements({ ...NO_HISTORY, ledger: ledgerReaching(totalExpToReachLevel(100)) })
    const atTwoFifty = evaluateAchievements({ ...NO_HISTORY, ledger: ledgerReaching(totalExpToReachLevel(250)) })
    expect(atHundred.every((status) => (status.definition.group === 'rank' ? status.unlock !== null : true))).toBe(true)
    expect(atTwoFifty.filter((status) => status.unlock !== null).map((status) => status.definition.id)).toEqual(atHundred.filter((status) => status.unlock !== null).map((status) => status.definition.id))
  })

  it('reports progress as the current level toward the target level, and caps it', () => {
    expect(statusOf({ ...NO_HISTORY, ledger: ledgerReaching(totalExpToReachLevel(7)) }, 'rank_d').progress).toEqual({ current: 7, target: 10 })
    expect(statusOf({ ...NO_HISTORY, ledger: ledgerReaching(totalExpToReachLevel(130)) }, 'level_100').progress).toEqual({ current: 100, target: 100 })
  })
})

const RICH_DAYS: readonly DayQuality[] = ['completed', 'strong', 'perfect', 'perfect', 'completed', 'incomplete', 'perfect', 'no_active_quests', 'perfect', 'perfect', 'perfect']

describe('determinism and idempotency', () => {
  function richHistory(): ProgressionHistory {
    return {
      ledger: buildLedger([...questRows(60), { kind: 'weekly', weekKey: mondayAfter(0), amount: 500, score: 10 }, { kind: 'quest', date: '2026-06-01', amount: 20_000 }]),
      dailySummaries: buildDayChain(RICH_DAYS),
      weeklyBoards: [...boardsScored([6, 10, 8, 10]), activeBoard()],
    }
  }

  it('gives the same result when evaluated again: nothing is consumed, nothing is stored', () => {
    const history = richHistory()
    expect(evaluateAchievements(history)).toEqual(evaluateAchievements(history))
  })

  it('cannot be affected by the order of the arrays the caller passes', () => {
    const history = richHistory()
    const reversed: ProgressionHistory = {
      ledger: [...history.ledger].reverse(),
      dailySummaries: [...history.dailySummaries].reverse(),
      weeklyBoards: [...history.weeklyBoards].reverse(),
    }
    const mixed: ProgressionHistory = {
      ledger: shuffled(history.ledger),
      dailySummaries: shuffled(history.dailySummaries),
      weeklyBoards: shuffled(history.weeklyBoards),
    }
    expect(evaluateAchievements(reversed)).toEqual(evaluateAchievements(history))
    expect(evaluateAchievements(mixed)).toEqual(evaluateAchievements(history))
  })

  it('never reorders or mutates the caller’s arrays', () => {
    const history = richHistory()
    const frozen: ProgressionHistory = {
      ledger: Object.freeze([...history.ledger].reverse()),
      dailySummaries: Object.freeze([...history.dailySummaries].reverse()),
      weeklyBoards: Object.freeze([...history.weeklyBoards].reverse()),
    }
    const before = JSON.stringify(frozen)
    expect(() => evaluateAchievements(frozen)).not.toThrow()
    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('never moves or revokes an unlock when more history arrives (every unlock is permanent)', () => {
    const history = richHistory()
    const later: ProgressionHistory = {
      ledger: buildLedger([...questRows(60), { kind: 'weekly', weekKey: mondayAfter(0), amount: 500, score: 10 }, { kind: 'quest', date: '2026-06-01', amount: 20_000 }, ...questRows(40, { start: '2027-01-01' })]),
      dailySummaries: buildDayChain([...RICH_DAYS, 'incomplete', 'incomplete']),
      weeklyBoards: [...boardsScored([6, 10, 8, 10, 0, 0])],
    }
    const earlier = evaluateAchievements(history)
    const now = evaluateAchievements(later)
    for (const [index, status] of earlier.entries()) {
      if (status.unlock !== null) expect(now[index]?.unlock).toEqual(status.unlock)
    }
    expect(now.filter((status) => status.unlock !== null).length).toBeGreaterThanOrEqual(earlier.filter((status) => status.unlock !== null).length)
  })

  it('unlocks each achievement at most once: one status per definition, in catalog order', () => {
    const statuses = evaluateAchievements(richHistory())
    expect(statuses.map((status) => status.definition.id)).toEqual(ACHIEVEMENT_CATALOG.map((definition) => definition.id))
  })

  it('evaluates any custom definitions it is given, in that order (the engine is data-driven)', () => {
    const custom: AchievementDefinition[] = [
      { id: 'c_two', group: 'general', title: 'Two', description: 'Two quests.', condition: { type: 'quest_completions', count: 2 } },
      { id: 'c_one', group: 'general', title: 'One', description: 'One quest.', condition: { type: 'quest_completions', count: 1 } },
    ]
    const statuses = evaluateAchievements(questHistory(1), custom)
    expect(statuses.map((status) => [status.definition.id, status.unlock !== null])).toEqual([['c_two', false], ['c_one', true]])
  })

  it('unlocks the whole earned history at once for a player who already has it (no upgrade step exists or is needed)', () => {
    const statuses = evaluateAchievements(richHistory())
    const unlocked = statuses.filter((status) => status.unlock !== null).map((status) => status.definition.id)
    expect(unlocked).toEqual(expect.arrayContaining(['first_quest', 'quests_50', 'first_perfect_day', 'perfect_days_5', 'streak_3', 'first_perfect_week', 'rank_d', 'rank_c']))
    expect(unlocked).not.toContain('perfect_weeks_3') // only two of its weeks scored 10/10
    expect(unlocked).not.toContain('level_100')
  })
})

describe('summarizeAchievements', () => {
  const history: ProgressionHistory = {
    ledger: buildLedger(questRows(12)),
    dailySummaries: buildDayChain(['perfect', 'perfect']),
    weeklyBoards: boardsScored([7]),
  }

  it('counts unlocked and total and lists the newest unlocks first', () => {
    const statuses = evaluateAchievements(history)
    const summary = summarizeAchievements(statuses, 3)
    expect(summary.totalCount).toBe(28)
    expect(summary.unlockedCount).toBe(statuses.filter((status) => status.unlock !== null).length)
    expect(summary.recent).toHaveLength(3)
    const moments = summary.recent.map((status) => status.unlock!.unlockedAt)
    expect([...moments].sort((a, b) => b - a)).toEqual(moments)
  })

  it('breaks ties between unlocks of one moment by catalog order, so the list is stable', () => {
    // Level 10 reached by one row unlocks Reach D Rank only; First Quest and the quest count share seq-1 evidence
    const ledger = buildLedger([{ kind: 'quest', amount: totalExpToReachLevel(20) }])
    const summary = summarizeAchievements(evaluateAchievements({ ...NO_HISTORY, ledger }), 10)
    expect(summary.recent.map((status) => status.definition.id)).toEqual(['first_quest', 'rank_d', 'rank_c'])
  })

  it('lists nothing when nothing is unlocked and respects a zero or negative limit', () => {
    const none = evaluateAchievements(NO_HISTORY)
    expect(summarizeAchievements(none, 3)).toMatchObject({ unlockedCount: 0, totalCount: 28, recent: [] })
    expect(summarizeAchievements(evaluateAchievements(history), 0).recent).toEqual([])
    expect(summarizeAchievements(evaluateAchievements(history), -2).recent).toEqual([])
  })
})

