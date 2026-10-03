import { describe, expect, it } from 'vitest'
import { CATEGORIES } from '../config/categories'
import { levelStateOf, totalExpToReachLevel } from '../progression/levels'
import { foldStreaks } from '../daily/dailySummary'
import { dayMeetsMilestone, summarizeDailyHistory } from './dailyStats'
import { finalizedBoardsInWeekOrder, inDayOrder, inLedgerOrder, normalizeHistory } from './history'
import { summarizeLedger } from './ledgerStats'
import { activeBoard } from '../weekly/testFixtures'
import { summarizeWeeklyHistory } from './weeklyStats'
import { boardsScored, buildDayChain, buildLedger, dayFromCounts, finalizedBoard, mondayAfter, questRows, shuffled } from './testFixtures'

describe('history normalization', () => {
  it('sorts the ledger by seq, the days by date and the boards by week, without touching the input', () => {
    const ledger = Object.freeze(shuffled(buildLedger(questRows(6))))
    const days = Object.freeze(shuffled(buildDayChain(['perfect', 'strong', 'completed', 'incomplete'])))
    const boards = Object.freeze(shuffled(boardsScored([3, 6, 8, 10])))

    expect(inLedgerOrder(ledger).map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6])
    expect(inDayOrder(days).map((day) => day.dateKey)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04'])
    expect(finalizedBoardsInWeekOrder(boards).map((board) => board.weekKey)).toEqual([0, 1, 2, 3].map(mondayAfter))
    expect(ledger).toHaveLength(6) // frozen arrays would throw if sorted in place
  })

  it('drops boards that are not finalized: an active board is not history', () => {
    const history = normalizeHistory({ ledger: [], dailySummaries: [], weeklyBoards: [activeBoard(), finalizedBoard(mondayAfter(0), 7, 150)] })
    expect(history.boards.map((board) => board.weekKey)).toEqual([mondayAfter(0)])
  })
})

describe('player stats from the ledger', () => {
  it('sums lifetime EXP, splitting quest EXP from weekly bonus EXP', () => {
    const stats = summarizeLedger(buildLedger([...questRows(3, { amount: 20 }), { kind: 'weekly', weekKey: mondayAfter(0), amount: 150, score: 7 }]))
    expect(stats.totalExp).toBe(210)
    expect(stats.questExp).toBe(60)
    expect(stats.weeklyBonusExp).toBe(150)
    expect(stats.totalCompletions).toBe(3)
  })

  it('is all zeros with an empty ledger and still lists the five categories', () => {
    const stats = summarizeLedger([])
    expect(stats).toMatchObject({ totalExp: 0, questExp: 0, weeklyBonusExp: 0, totalCompletions: 0, quests: [] })
    expect(stats.categories.map((entry) => entry.category)).toEqual([...CATEGORIES])
    expect(stats.categories.every((entry) => entry.exp === 0 && entry.completions === 0)).toBe(true)
  })

  it('derives the level and rank from lifetime EXP, with no cap and `special_100_plus` from Level 100', () => {
    const at = (level: number, extra = 0) => levelStateOf(summarizeLedger(buildLedger([{ kind: 'quest', amount: totalExpToReachLevel(level) + extra }])).totalExp)

    expect(at(99)).toMatchObject({ level: 99, rank: 'S' })
    expect(at(100)).toMatchObject({ level: 100, rank: 'special_100_plus' })
    expect(at(101)).toMatchObject({ level: 101, rank: 'special_100_plus' })
    expect(at(250)).toMatchObject({ level: 250, rank: 'special_100_plus' })
    // one EXP short of Level 100 is still Level 99
    expect(levelStateOf(totalExpToReachLevel(100) - 1)).toMatchObject({ level: 99, rank: 'S' })
  })
})

describe('category statistics', () => {
  const ledger = buildLedger([
    { kind: 'quest', date: '2026-03-01', category: 'discipline', amount: 10 },
    { kind: 'quest', date: '2026-03-02', category: 'discipline', amount: 20 },
    { kind: 'quest', date: '2026-03-03', category: 'fitness', amount: 55 },
    { kind: 'quest', date: '2026-03-04', category: 'trading', amount: 80 },
    { kind: 'weekly', weekKey: mondayAfter(0), amount: 500, score: 10 },
  ])

  it('totals EXP and completions per category, in the fixed category order', () => {
    expect(summarizeLedger(ledger).categories).toEqual([
      { category: 'discipline', exp: 30, completions: 2 },
      { category: 'fitness', exp: 55, completions: 1 },
      { category: 'business', exp: 0, completions: 0 },
      { category: 'knowledge', exp: 0, completions: 0 },
      { category: 'trading', exp: 80, completions: 1 },
    ])
  })

  it('never lets the weekly bonus (which has no category) into a category', () => {
    const stats = summarizeLedger(ledger)
    const categoryTotal = stats.categories.reduce((sum, entry) => sum + entry.exp, 0)
    expect(categoryTotal).toBe(stats.questExp)
    expect(categoryTotal).toBe(165)
    expect(stats.weeklyBonusExp).toBe(500)
    expect(stats.totalExp).toBe(categoryTotal + stats.weeklyBonusExp) // INV-9
  })

  it('counts completions per category from the ledger, so it matches the total', () => {
    const stats = summarizeLedger(ledger)
    expect(stats.categories.reduce((sum, entry) => sum + entry.completions, 0)).toBe(stats.totalCompletions)
  })
})

describe('quest statistics', () => {
  const ledger = buildLedger([
    { kind: 'quest', templateId: 'tpl_b', date: '2026-03-01', amount: 55 },
    { kind: 'quest', templateId: 'tpl_a', date: '2026-03-01', amount: 10 },
    { kind: 'quest', templateId: 'tpl_a', date: '2026-03-02', amount: 10 },
    { kind: 'quest', templateId: 'tpl_b', date: '2026-03-02', amount: 55 },
    { kind: 'quest', templateId: 'tpl_c', date: '2026-03-02', amount: 20 },
    { kind: 'quest', templateId: 'tpl_a', date: '2026-03-03', amount: 10 },
  ])

  it('counts completions and EXP per template, most completed first', () => {
    const { quests } = summarizeLedger(ledger)
    expect(quests.map((quest) => [quest.templateId, quest.completions, quest.exp])).toEqual([
      ['tpl_a', 3, 30],
      ['tpl_b', 2, 110],
      ['tpl_c', 1, 20],
    ])
  })

  it('breaks ties by the earlier first completion, then by id: deterministic', () => {
    const tied = buildLedger([
      { kind: 'quest', templateId: 'tpl_z', date: '2026-03-01' },
      { kind: 'quest', templateId: 'tpl_y', date: '2026-03-01' },
      { kind: 'quest', templateId: 'tpl_a', date: '2026-03-02' },
    ])
    expect(summarizeLedger(tied).quests.map((quest) => quest.templateId)).toEqual(['tpl_z', 'tpl_y', 'tpl_a'])
    expect(summarizeLedger(shuffled(tied)).quests.map((quest) => quest.templateId)).toEqual(['tpl_z', 'tpl_y', 'tpl_a'])
  })

  it('remembers the most recent occurrence so a historical label can be read when the template is gone', () => {
    const quest = summarizeLedger(ledger).quests.find((entry) => entry.templateId === 'tpl_a')
    expect(quest).toMatchObject({ firstSeq: 2, lastOccurrenceId: 'occ:tpl_a@2026-03-03' })
  })

  it('depends on nothing but the ledger rows, so edited or archived templates cannot change it', () => {
    // The tally is keyed by the template id stored in each immutable row; no template is ever consulted.
    expect(summarizeLedger(ledger)).toEqual(summarizeLedger(structuredClone(ledger)))
  })

  it('does not depend on the order the rows arrive in', () => {
    expect(summarizeLedger(shuffled(ledger))).toEqual(summarizeLedger(ledger))
  })
})

describe('daily statistics', () => {
  it('counts the milestones cumulatively: Strong includes Perfect and Completed includes both', () => {
    const stats = summarizeDailyHistory(buildDayChain(['perfect', 'strong', 'completed', 'incomplete', 'incomplete', 'no_active_quests']))
    expect(stats).toMatchObject({
      finalizedDays: 6,
      activeDays: 5,
      completedDays: 3,
      strongDays: 2,
      perfectDays: 1,
      incompleteDays: 2,
      noActiveQuestDays: 1,
    })
  })

  it('says which qualities meet which milestone (No Active Quests meets none)', () => {
    expect(dayMeetsMilestone('perfect', 'perfect')).toBe(true)
    expect(dayMeetsMilestone('strong', 'perfect')).toBe(false)
    expect(dayMeetsMilestone('strong', 'strong')).toBe(true)
    expect(dayMeetsMilestone('completed', 'strong')).toBe(false)
    expect(dayMeetsMilestone('completed', 'completed')).toBe(true)
    expect(dayMeetsMilestone('incomplete', 'completed')).toBe(false)
    for (const milestone of ['completed', 'strong', 'perfect'] as const) {
      expect(dayMeetsMilestone('no_active_quests', milestone)).toBe(false)
    }
  })

  it('treats a No Active Quests day as neutral: not in the rate, not in the streaks', () => {
    const withGap = summarizeDailyHistory(buildDayChain(['perfect', 'no_active_quests', 'perfect']))
    const without = summarizeDailyHistory(buildDayChain(['perfect', 'perfect']))
    expect(withGap.finalizedDays).toBe(3)
    expect(withGap.currentStreak).toBe(2) // the neutral day neither increments nor resets
    expect(withGap.perfectStreak).toBe(2)
    expect(withGap.questsCompleted).toBe(without.questsCompleted)
    expect(withGap.completionRatePercent).toBe(100)
  })

  it('takes the streaks from the newest summary and they equal the fold of the whole chain', () => {
    const chain = buildDayChain(['perfect', 'perfect', 'strong', 'incomplete', 'completed', 'perfect'])
    const stats = summarizeDailyHistory(chain)
    const fold = foldStreaks(chain)
    expect(stats).toMatchObject({ currentStreak: fold.currentStreak, bestStreak: fold.bestStreak, perfectStreak: fold.perfectStreak, lastFinalizedDate: '2026-03-06' })
    expect(stats.bestStreak).toBe(3)
    expect(stats.currentStreak).toBe(2)
    expect(stats.perfectDays).toBe(fold.totalPerfectDays)
  })

  it('computes a count-based completion rate and floors it for display (69.6% shows 69%)', () => {
    // 87 of 125 quests = 69.6 %: floors to 69, never rounds to 70
    const days = [dayFromCounts('2026-03-01', 40, 50), dayFromCounts('2026-03-02', 47, 75)]
    expect(summarizeDailyHistory(days)).toMatchObject({ questsCompleted: 87, questsEligible: 125, completionRatePercent: 69 })
    expect(summarizeDailyHistory([dayFromCounts('2026-03-01', 3, 3)]).completionRatePercent).toBe(100)
  })

  it('has no rate, streak or date before the first day was finalized', () => {
    expect(summarizeDailyHistory([])).toEqual({
      finalizedDays: 0,
      activeDays: 0,
      completedDays: 0,
      strongDays: 0,
      perfectDays: 0,
      incompleteDays: 0,
      noActiveQuestDays: 0,
      questsCompleted: 0,
      questsEligible: 0,
      completionRatePercent: null,
      currentStreak: 0,
      bestStreak: 0,
      perfectStreak: 0,
      lastFinalizedDate: null,
    })
    expect(summarizeDailyHistory(buildDayChain(['no_active_quests', 'no_active_quests'])).completionRatePercent).toBeNull()
  })

  it('does not depend on the order the summaries arrive in', () => {
    const chain = buildDayChain(['perfect', 'strong', 'incomplete', 'perfect', 'completed', 'no_active_quests', 'perfect'])
    expect(summarizeDailyHistory(shuffled(chain))).toEqual(summarizeDailyHistory(chain))
  })
})

describe('weekly statistics', () => {
  it('summarizes the finalized boards: count, best, average, Perfect Weeks and bonus EXP', () => {
    const boards = [finalizedBoard(mondayAfter(0), 10, 500), finalizedBoard(mondayAfter(1), 6, 100), finalizedBoard(mondayAfter(2), 3, 0), finalizedBoard(mondayAfter(3), 10, 500)]
    expect(summarizeWeeklyHistory(boards)).toEqual({ finalizedBoards: 4, perfectWeeks: 2, bestScore: 10, averageScore: 7.25, totalBonusExp: 1100 })
  })

  it('counts only the frozen finalization snapshot and ignores an active board', () => {
    const stats = summarizeWeeklyHistory([activeBoard(), finalizedBoard(mondayAfter(0), 8, 225)])
    expect(stats).toMatchObject({ finalizedBoards: 1, bestScore: 8, averageScore: 8, totalBonusExp: 225, perfectWeeks: 0 })
  })

  it('is empty (not zero scores) before any week was finalized', () => {
    const expected = { finalizedBoards: 0, perfectWeeks: 0, bestScore: null, averageScore: null, totalBonusExp: 0 }
    expect(summarizeWeeklyHistory([])).toEqual(expected)
    expect(summarizeWeeklyHistory([activeBoard()])).toEqual(expected)
  })

  it('counts a week that scored 0 as a finalized board (a week without a board is not counted)', () => {
    expect(summarizeWeeklyHistory(boardsScored([0, 0]))).toMatchObject({ finalizedBoards: 2, bestScore: 0, averageScore: 0, perfectWeeks: 0 })
  })

  it('does not depend on the order the boards arrive in', () => {
    const boards = boardsScored([3, 10, 6, 8, 10])
    expect(summarizeWeeklyHistory(shuffled(boards))).toEqual(summarizeWeeklyHistory(boards))
  })
})
