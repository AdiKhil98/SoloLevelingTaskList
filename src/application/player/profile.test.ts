import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  ACHIEVEMENT_CATALOG,
  asWeekKey,
  levelStateOf,
  summarizeLedger,
  weekEndOf,
  type XPTransaction,
} from '@/domain'
import {
  exportBackup,
  importBackup,
  listDailySummaries,
  listXpTransactions,
  openDatabase,
  serializeBackup,
  type PersistenceDatabase,
} from '@/persistence'
import { completeTodayQuest } from '../completion/completeTodayQuest'
import { loadHome, synchronizeAndLoadHome } from '../home'
import { archiveQuest } from '../quests/archiveQuest'
import { createQuest } from '../quests/createQuest'
import { updateQuest } from '../quests/updateQuest'
import { startApplication } from '../initialize'
import { DEFAULT_QUEST_SEEDS } from '../seeds/defaultQuests'
import { buildFormValues, createSequentialIds, createTestClock, createTestContext, newFactory, noonOn, ZONE, type TestContext } from '../test-utils/helpers'
import { setWeeklyGoalProgress } from '../weekly/setWeeklyGoalProgress'
import { saveWeeklyBoard } from '../weekly/saveWeeklyBoard'
import { getWeeklyBoard } from '@/persistence'
import { weeklyForm } from '../test-utils/weekly'
import { loadAchievements } from './loadAchievements'
import { loadDailyHistory } from './loadDailyHistory'
import { loadPlayerProfile, type PlayerProfile } from './loadPlayerProfile'
import { loadPlayerStatus } from './loadPlayerStatus'
import { loadStreakStats } from './loadStreakStats'

const opened: PersistenceDatabase[] = []
afterEach(() => {
  vi.restoreAllMocks()
})
afterAll(() => {
  while (opened.length > 0) opened.pop()?.close()
})

const MONDAY = '2026-10-05'
const NEXT_MONDAY = '2026-10-12'
const WEEK = asWeekKey(MONDAY)

async function advanceTo(t: TestContext, date: string) {
  t.clock.set(noonOn(date))
  return synchronizeAndLoadHome(t.context, 'resume')
}

/** Completes the first `count` quests of today's list, in display order. */
async function completeFirst(t: TestContext, count: number): Promise<void> {
  const { today } = await loadHome(t.context)
  for (const quest of today.quests.slice(0, count)) {
    const result = await completeTodayQuest(t.context, quest.occurrenceId)
    if (result.status !== 'completed') throw new Error(`completion was ${result.status}`)
  }
}

/**
 * A week of real play, driven through the use cases (nothing is written to storage directly):
 * the six defaults plus a Fitness "Gym" quest (B, 55 EXP) and a Weekly Goal Crusher scored 10/10.
 *
 *   Mon  all 7 quests            → Perfect          (125 EXP)
 *   Tue  6 of 7 (not Gym)        → Strong           (70 EXP)
 *   Wed  5 of 7 (the prayers)    → Completed        (50 EXP)
 *   Thu  1 of 7 (Fajr)           → Incomplete       (10 EXP)
 *   Fri–Sun  nothing             → Incomplete ×3
 *   next Monday: days finalized, the week finalized with a 500 EXP bonus.
 */
async function playTheWeek(): Promise<{ t: TestContext; gymId: string }> {
  const t = await createTestContext(MONDAY)
  opened.push(t.database)
  await startApplication(t.context)
  const gym = await createQuest(t.context, buildFormValues({ title: 'Gym', difficulty: 'B', category: 'fitness' }, MONDAY))
  if (gym.status !== 'created') throw new Error('Gym was not created')

  const saved = await saveWeeklyBoard(t.context, weeklyForm())
  if (saved.status !== 'created') throw new Error(`the board was ${saved.status}`)
  const board = await getWeeklyBoard(t.database, WEEK)
  for (const goal of board?.goals ?? []) {
    const progress = await setWeeklyGoalProgress(t.context, goal.id, goal.target)
    if (progress.status !== 'updated') throw new Error(`progress was ${progress.status}`)
  }

  await completeFirst(t, 7)
  await advanceTo(t, '2026-10-06')
  await completeFirst(t, 6)
  await advanceTo(t, '2026-10-07')
  await completeFirst(t, 5)
  await advanceTo(t, '2026-10-08')
  await completeFirst(t, 1)
  await advanceTo(t, NEXT_MONDAY)
  return { t, gymId: gym.templateId }
}

async function profileOf(t: TestContext): Promise<PlayerProfile> {
  const result = await loadPlayerProfile(t.context)
  if (result.status !== 'ok') throw new Error('the profile failed to load')
  return result.value
}

const seedId = (key: string) => DEFAULT_QUEST_SEEDS.find((seed) => seed.seedKey === key)!.templateId

describe('player profile from a played week', () => {
  let t: TestContext
  let profile: PlayerProfile
  let ledger: readonly XPTransaction[]

  beforeAll(async () => {
    ;({ t } = await playTheWeek())
    profile = await profileOf(t)
    ledger = await listXpTransactions(t.database)
  }, 60_000)

  describe('player', () => {
    it('sums lifetime EXP from the ledger and agrees with the level engine the Status screen already uses', async () => {
      const status = await loadPlayerStatus(t.context)
      expect(profile.totalExp).toBe(255 + 500)
      expect(profile.totalExp).toBe(status.totalExp)
      expect(levelStateOf(profile.totalExp)).toMatchObject({ level: status.level, rank: status.rank, expIntoLevel: status.expIntoLevel })
    })
  })

  describe('quests and categories', () => {
    it('counts every completion and the quest EXP they earned', () => {
      expect(profile.totalCompletions).toBe(7 + 6 + 5 + 1)
      expect(profile.questExp).toBe(255)
      expect(profile.activeQuestCount).toBe(7)
    })

    it('totals EXP and completions per category from normal quest completions only', () => {
      const byCategory = Object.fromEntries(profile.categories.map((entry) => [entry.category, entry]))
      expect(byCategory.discipline).toEqual({ category: 'discipline', exp: 200, completions: 18 })
      expect(byCategory.fitness).toEqual({ category: 'fitness', exp: 55, completions: 1 })
      for (const empty of ['business', 'knowledge', 'trading']) {
        expect(byCategory[empty]).toMatchObject({ exp: 0, completions: 0 })
      }
    })

    it('keeps the 500 EXP Weekly Goal Crusher bonus out of every category (INV-9)', () => {
      const categoryTotal = profile.categories.reduce((sum, entry) => sum + entry.exp, 0)
      expect(categoryTotal).toBe(profile.questExp)
      expect(categoryTotal + profile.weekly.totalBonusExp).toBe(profile.totalExp)
      const bonusRows = ledger.filter((row) => row.source.type === 'weekly_goal_crusher')
      expect(bonusRows).toHaveLength(1)
      expect(bonusRows[0]).toMatchObject({ category: null, amount: 500 })
    })

    it('lists the three most completed quests: ties go to the quest completed first', () => {
      expect(profile.topQuests.map((quest) => [quest.templateId, quest.completions])).toEqual([
        [seedId('prayer.fajr'), 4],
        [seedId('prayer.dhuhr'), 3],
        [seedId('prayer.asr'), 3],
      ])
      expect(profile.topQuests.map((quest) => quest.title)).toEqual(['Fajr', 'Dhuhr', 'Asr'])
      expect(profile.topQuests.every((quest) => quest.titleSource === 'template' && !quest.archived)).toBe(true)
    })

    it('agrees with the ledger summary it is derived from', () => {
      const summary = summarizeLedger(ledger)
      expect(profile.categories).toEqual(summary.categories)
      expect(profile.totalCompletions).toBe(summary.totalCompletions)
    })
  })

  describe('days', () => {
    it('counts the finalized days by quality, cumulatively', () => {
      expect(profile.days).toMatchObject({
        finalizedDays: 7,
        activeDays: 7,
        completedDays: 3,
        strongDays: 2,
        perfectDays: 1,
        incompleteDays: 4,
        noActiveQuestDays: 0,
        lastFinalizedDate: '2026-10-11',
      })
    })

    it('has a count-based completion rate (19 of 49 quests = 38%, floored)', () => {
      expect(profile.days).toMatchObject({ questsCompleted: 19, questsEligible: 49, completionRatePercent: 38 })
    })

    it('reads the same streaks the Home and Status screens show, from the persisted chain', async () => {
      const streaks = await loadStreakStats(t.context)
      expect(profile.days).toMatchObject({
        currentStreak: streaks.currentStreak,
        bestStreak: streaks.bestStreak,
        perfectStreak: streaks.perfectStreak,
      })
      expect(profile.days.perfectDays).toBe(streaks.totalPerfectDays)
      expect(profile.days.bestStreak).toBe(3) // Perfect, Strong, Completed, then four incomplete days
      expect(profile.days.currentStreak).toBe(0)
    })
  })

  describe('weekly', () => {
    it('reads the finalized board’s frozen snapshot: one week, scored 10/10, 500 EXP bonus', () => {
      expect(profile.weekly).toEqual({
        finalizedBoards: 1,
        perfectWeeks: 1,
        bestScore: 10,
        averageScore: 10,
        totalBonusExp: 500,
        rewardsClaimed: 0,
      })
    })
  })

  describe('achievements', () => {
    const EXPECTED = [
      'first_quest',
      'quests_10',
      'first_completed_day',
      'first_strong_day',
      'first_perfect_day',
      'streak_3',
      'first_goal_crusher_week',
      'first_week_6_plus',
      'first_week_8_plus',
      'first_perfect_week',
    ]

    it('unlocks exactly what this history earned', async () => {
      const result = await loadAchievements(t.context)
      if (result.status !== 'ok') throw new Error('failed')
      const unlocked = result.value.achievements.filter((status) => status.unlock !== null).map((status) => status.definition.id)
      expect(unlocked).toEqual(EXPECTED)
      expect(result.value).toMatchObject({ unlockedCount: EXPECTED.length, totalCount: ACHIEVEMENT_CATALOG.length })
      expect(profile.achievements).toMatchObject({ unlockedCount: EXPECTED.length, totalCount: 28 })
    })

    it('dates each unlock from the exact record that first earned it', async () => {
      const result = await loadAchievements(t.context)
      if (result.status !== 'ok') throw new Error('failed')
      const unlock = (id: string) => result.value.achievements.find((status) => status.definition.id === id)?.unlock
      const tenth = ledger.filter((row) => row.source.type === 'quest_completion')[9]!
      expect(unlock('quests_10')).toEqual({ unlockedAt: tenth.createdAt, unlockedOn: '2026-10-06', evidence: { type: 'xp_transaction', transactionId: tenth.id, seq: tenth.seq } })
      expect(tenth.effectiveDate).toBe('2026-10-06') // Monday had 7 completions: the 10th is Tuesday’s third
      // The streak reached 3 when Wednesday was finalized, though that happened later, at the next sync.
      expect(unlock('streak_3')).toMatchObject({ unlockedOn: '2026-10-07', evidence: { type: 'daily_summary', dateKey: '2026-10-07' } })
      expect(unlock('first_perfect_day')).toMatchObject({ unlockedOn: '2026-10-05' })
      expect(unlock('first_perfect_week')).toMatchObject({ unlockedOn: weekEndOf(WEEK), evidence: { type: 'weekly_board', weekKey: WEEK } })
    })

    it('lists the most recent unlocks first', () => {
      const moments = profile.achievements.recent.map((status) => status.unlock?.unlockedAt ?? 0)
      expect(profile.achievements.recent).toHaveLength(3)
      expect([...moments].sort((a, b) => b - a)).toEqual(moments)
      expect(profile.achievements.recent[0]?.definition.group).toBe('weekly') // the board was finalized last
    })

    it('awards no EXP and writes nothing: loading is read-only and the ledger is untouched', async () => {
      const writes = vi.spyOn(t.database, 'openTransaction')
      const before = await listXpTransactions(t.database)
      await Promise.all([loadPlayerProfile(t.context), loadAchievements(t.context), loadDailyHistory(t.context)])
      const after = await listXpTransactions(t.database)
      expect(writes.mock.calls.filter(([, mode]) => mode === 'readwrite')).toEqual([])
      expect(after).toEqual(before)
      expect(after.every((row) => row.source.type === 'quest_completion' || row.source.type === 'weekly_goal_crusher')).toBe(true)
    })

    it('is idempotent: every load, and a fresh connection to the same data, gives identical results', async () => {
      const first = await loadAchievements(t.context)
      const second = await loadAchievements(t.context)
      expect(second).toEqual(first)

      const reopened = await openDatabase({ factory: t.factory })
      opened.push(reopened)
      const afterRestart = await loadAchievements({ ...t.context, database: reopened })
      expect(afterRestart).toEqual(first)
    })

    it('follows a restored backup with no migration or extra step: the same data unlocks the same trophies', async () => {
      const text = serializeBackup(await exportBackup(t.database, { exportedAt: noonOn(NEXT_MONDAY), exportedFromTimeZone: ZONE, appVersion: '0.1.0' }))
      const fresh = await openDatabase({ factory: newFactory() })
      opened.push(fresh)
      const restored = await importBackup(fresh, text)
      expect(restored.ok).toBe(true)

      const context = { database: fresh, clock: createTestClock(noonOn(NEXT_MONDAY)), ids: createSequentialIds() }
      expect(await loadAchievements(context)).toEqual(await loadAchievements(t.context))
      expect(await loadPlayerProfile(context)).toEqual(await loadPlayerProfile(t.context))
    })
  })

  describe('daily history', () => {
    it('lists every finalized day newest first, from the immutable summaries', async () => {
      const result = await loadDailyHistory(t.context)
      if (result.status !== 'ok') throw new Error('failed')
      const days = result.value
      expect(days.map((day) => day.dateKey)).toEqual(['2026-10-11', '2026-10-10', '2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05'])
      expect(days[6]).toMatchObject({ quality: 'perfect', completedCount: 7, eligibleCount: 7, displayPercent: 100, questExp: 125, streakAfter: 1 })
      expect(days[5]).toMatchObject({ quality: 'strong', completedCount: 6, displayPercent: 85, questExp: 70, streakAfter: 2 })
      expect(days[4]).toMatchObject({ quality: 'completed', completedCount: 5, displayPercent: 71, questExp: 50, streakAfter: 3 })
      expect(days[3]).toMatchObject({ quality: 'incomplete', completedCount: 1, displayPercent: 14, questExp: 10, streakAfter: 0 })
    })

    it('never includes the day in progress', async () => {
      const result = await loadDailyHistory(t.context)
      if (result.status !== 'ok') throw new Error('failed')
      expect(result.value.some((day) => day.dateKey === NEXT_MONDAY)).toBe(false)
      expect(result.value).toHaveLength((await listDailySummaries(t.database)).length)
    })
  })

  describe('historical statistics survive template changes', () => {
    it('keeps every figure when a quest is edited into another category and difficulty, then archived', async () => {
      const own = await playTheWeek()
      const before = await profileOf(own.t)
      const edited = await updateQuest(own.t.context, own.gymId, buildFormValues({ title: 'Lift heavy things', difficulty: 'S', category: 'business' }, NEXT_MONDAY))
      expect(edited.status).toBe('updated')
      const archived = await archiveQuest(own.t.context, own.gymId)
      expect(archived.status).toBe('archived')

      const after = await profileOf(own.t)
      expect(after.categories).toEqual(before.categories) // the 55 EXP is still Fitness, not Business
      expect(after.totalCompletions).toBe(before.totalCompletions)
      expect(after.questExp).toBe(before.questExp)
      expect(after.days).toEqual(before.days)
      expect(after.activeQuestCount).toBe(before.activeQuestCount - 1)
    })

    it('labels an archived quest with its current title and marks it archived', async () => {
      const own = await playTheWeek()
      const fajr = seedId('prayer.fajr')
      await archiveQuest(own.t.context, fajr)
      const after = await profileOf(own.t)
      expect(after.topQuests[0]).toMatchObject({ templateId: fajr, title: 'Fajr', titleSource: 'template', archived: true, completions: 4 })
    })

    it('still counts, and names, a quest whose template is missing, using its stored history', async () => {
      const own = await playTheWeek()
      const fajr = seedId('prayer.fajr')
      const transaction = own.t.database.openTransaction(['questTemplates'], 'readwrite')
      transaction.objectStore('questTemplates').delete(fajr)
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })

      const after = await profileOf(own.t)
      expect(after.topQuests[0]).toMatchObject({ templateId: fajr, title: 'Fajr', titleSource: 'history', completions: 4, exp: 40 })
      expect(after.totalCompletions).toBe(19)
      expect(after.categories.find((entry) => entry.category === 'discipline')).toMatchObject({ exp: 200, completions: 18 })
    })

    it('keeps the count with an explicit fallback when neither the template nor its occurrence can name it', async () => {
      const own = await playTheWeek()
      const fajr = seedId('prayer.fajr')
      const transaction = own.t.database.openTransaction(['questTemplates', 'questOccurrences'], 'readwrite')
      transaction.objectStore('questTemplates').delete(fajr)
      transaction.objectStore('questOccurrences').delete(`occ:${fajr}@2026-10-08`) // its latest completion
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })

      const after = await profileOf(own.t)
      expect(after.topQuests[0]).toMatchObject({ templateId: fajr, title: null, titleSource: 'unknown', completions: 4 })
    })
  })
})

describe('a brand-new player', () => {
  it('has an empty but complete profile: zeros, five categories, 28 locked achievements, nothing invented', async () => {
    const t = await createTestContext(MONDAY)
    opened.push(t.database)
    await startApplication(t.context)
    const profile = await profileOf(t)

    expect(profile).toMatchObject({ totalExp: 0, questExp: 0, totalCompletions: 0, activeQuestCount: 6, topQuests: [] })
    expect(profile.categories).toHaveLength(5)
    expect(profile.days).toMatchObject({ finalizedDays: 0, completionRatePercent: null, lastFinalizedDate: null })
    expect(profile.weekly).toEqual({ finalizedBoards: 0, perfectWeeks: 0, bestScore: null, averageScore: null, totalBonusExp: 0, rewardsClaimed: 0 })
    expect(profile.achievements).toMatchObject({ unlockedCount: 0, totalCount: 28, recent: [] })

    const history = await loadDailyHistory(t.context)
    expect(history).toEqual({ status: 'ok', value: [] })
  })
})

describe('No Active Quests days', () => {
  it('are finalized days that stay neutral: no rate, no streak change, no day achievement', async () => {
    const t = await createTestContext(MONDAY)
    opened.push(t.database)
    await startApplication(t.context)
    for (const seed of DEFAULT_QUEST_SEEDS) await archiveQuest(t.context, seed.templateId)
    await advanceTo(t, '2026-10-08') // finalizes Mon (its occurrences remain, none done) and the empty Tue and Wed

    const profile = await profileOf(t)
    expect(profile.days).toMatchObject({ finalizedDays: 3, activeDays: 1, incompleteDays: 1, noActiveQuestDays: 2, currentStreak: 0, bestStreak: 0 })
    expect(profile.days.completionRatePercent).toBe(0) // the one active day: 0 of 6
    const history = await loadDailyHistory(t.context)
    if (history.status !== 'ok') throw new Error('failed')
    expect(history.value.map((day) => day.quality)).toEqual(['no_active_quests', 'no_active_quests', 'incomplete'])
    expect(history.value[0]).toMatchObject({ displayPercent: null, eligibleCount: 0 })
    expect(profile.achievements.unlockedCount).toBe(0)
  })
})

describe('a failed read', () => {
  it('is reported as a player-safe failure, never thrown', async () => {
    const t = await createTestContext(MONDAY)
    t.database.close()
    const results = await Promise.all([loadPlayerProfile(t.context), loadAchievements(t.context), loadDailyHistory(t.context)])
    for (const result of results) expect(result).toMatchObject({ status: 'failed', reason: 'database_unavailable' })
  })
})
