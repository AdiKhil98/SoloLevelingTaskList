// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { ACHIEVEMENT_CATALOG, asWeekKey, type AchievementUnlockedEvent, type DomainEvent } from '@/domain'
import { listXpTransactions, type PersistenceDatabase } from '@/persistence'
import { completeTodayQuest, type CompleteTodayQuestResult } from '../completion/completeTodayQuest'
import { synchronizeAndLoadHome } from '../home'
import { startApplication } from '../initialize'
import { createQuest } from '../quests/createQuest'
import { buildFormValues, createTestContext, noonOn, type TestContext } from '../test-utils/helpers'
import { goalRow, weeklyForm } from '../test-utils/weekly'
import { saveWeeklyBoard } from '../weekly/saveWeeklyBoard'
import { setWeeklyGoalProgress } from '../weekly/setWeeklyGoalProgress'
import { getWeeklyBoard } from '@/persistence'
import {
  completionPresentationEvents,
  OVERNIGHT_MAX_FINALIZED_BOARDS,
  OVERNIGHT_MAX_FINALIZED_DAYS,
  reconciliationPresentationEvents,
} from './presentationEvents'

const MONDAY = '2026-10-05'
const WEDNESDAY = '2026-10-07'
const NEXT_MONDAY = '2026-10-12'
const WEEK = asWeekKey('2026-10-05')
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const
const SEED_IDS = [...PRAYERS.map((key) => `tpl_seed_prayer_${key}`), 'tpl_seed_sleep']

const opened: PersistenceDatabase[] = []
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

async function setup(date = MONDAY): Promise<TestContext> {
  const t = await createTestContext(date)
  opened.push(t.database)
  await startApplication(t.context)
  return t
}

async function advanceTo(t: TestContext, date: string, trigger: 'startup' | 'resume' | 'midnight_tick' = 'resume') {
  t.clock.set(noonOn(date))
  return synchronizeAndLoadHome(t.context, trigger)
}

/** Completes `templateId`'s occurrence for `date` and returns what the presentation layer would be handed. */
async function complete(t: TestContext, templateId: string, date: string) {
  const result = await completeTodayQuest(t.context, `occ:${templateId}@${date}`)
  if (result.status !== 'completed') throw new Error(`completion of ${templateId} was ${result.status}`)
  return result
}

const present = (t: TestContext, result: Extract<CompleteTodayQuestResult, { status: 'completed' }>) =>
  completionPresentationEvents(t.context, { events: result.events, home: result.home })

const unlocked = (events: readonly DomainEvent[]): AchievementUnlockedEvent[] =>
  events.filter((event): event is AchievementUnlockedEvent => event.type === 'AchievementUnlocked')
const ids = (events: readonly DomainEvent[]) => unlocked(events).map((event) => event.achievementId)
const types = (events: readonly DomainEvent[]) => events.map((event) => event.type)

describe('completionPresentationEvents', () => {
  it('reports the first quest as a newly unlocked achievement, after the completion\'s own events, from its ledger row', async () => {
    const t = await setup()
    const result = await complete(t, 'tpl_seed_prayer_fajr', MONDAY)
    const { events, errors } = await present(t, result)

    expect(errors).toEqual([])
    expect(types(events).slice(0, 2)).toEqual(['QuestCompleted', 'XPAwarded'])
    expect(ids(events)).toEqual(['first_quest'])
    const [first] = unlocked(events)
    const awarded = result.events.find((event) => event.type === 'XPAwarded')
    expect(first?.evidence).toMatchObject({ type: 'xp_transaction', transactionId: awarded?.type === 'XPAwarded' ? awarded.transactionId : 'missing' })
    expect(first).toMatchObject({ title: 'First Quest', description: 'Complete your first quest.' })
  })

  it('awards 0 EXP for an achievement: the ledger holds only the quest row', async () => {
    const t = await setup()
    const result = await complete(t, 'tpl_seed_prayer_fajr', MONDAY)
    await present(t, result)
    const ledger = await listXpTransactions(t.database)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.source.type).toBe('quest_completion')
  })

  it('does not replay an old achievement on the next completion', async () => {
    const t = await setup()
    await present(t, await complete(t, 'tpl_seed_prayer_fajr', MONDAY))
    const { events } = await present(t, await complete(t, 'tpl_seed_prayer_dhuhr', MONDAY))
    expect(ids(events)).toEqual([])
  })

  it('a repeated completion reports nothing: no events, nothing to present', async () => {
    const t = await setup()
    await complete(t, 'tpl_seed_prayer_fajr', MONDAY)
    const repeat = await completeTodayQuest(t.context, `occ:tpl_seed_prayer_fajr@${MONDAY}`)
    expect(repeat.status).toBe('already_completed')
    expect('events' in repeat).toBe(false)
  })

  it('unlocks "10 Quests" at exactly the tenth completion and not before', async () => {
    const t = await setup()
    const custom: string[] = []
    for (const title of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const created = await createQuest(t.context, buildFormValues({ title }, MONDAY))
      if (created.status !== 'created') throw new Error('create failed')
      custom.push(created.templateId)
    }
    const unlockedAt: string[][] = []
    for (const templateId of [...SEED_IDS, ...custom]) {
      unlockedAt.push(ids((await present(t, await complete(t, templateId, MONDAY))).events))
    }
    expect(unlockedAt.map((list) => list.join())).toEqual(['first_quest', '', '', '', '', '', '', '', '', 'quests_10'])
  })

  it('reports a live Perfect Day only on the completion that reaches 100 %', async () => {
    const t = await setup()
    const results: DomainEvent[][] = []
    for (const templateId of SEED_IDS) results.push([...(await present(t, await complete(t, templateId, MONDAY))).events])
    const perfect = results.map((events) => events.some((event) => event.type === 'PerfectDayReached'))
    expect(perfect).toEqual([false, false, false, false, false, true])
    expect(results[5]?.find((event) => event.type === 'PerfectDayReached')).toMatchObject({ dateKey: MONDAY, completedCount: 6, eligibleCount: 6 })
  })

  it('does not call the live day a finalized Perfect Day: no achievement for it until the day ends', async () => {
    const t = await setup()
    let last: DomainEvent[] = []
    for (const templateId of SEED_IDS) last = [...(await present(t, await complete(t, templateId, MONDAY))).events]
    expect(ids(last)).not.toContain('first_perfect_day')
  })

  describe('linked weekly goals', () => {
    async function board(t: TestContext, target: string, points = 10) {
      const saved = await saveWeeklyBoard(t.context, weeklyForm({ goals: [goalRow('g1', { title: 'Pray Fajr', points, target, trackingMode: 'linked_quest', templateId: 'tpl_seed_prayer_fajr' }), ...(points < 10 ? [goalRow('g2', { points: 10 - points })] : [])] }))
      if (saved.status !== 'created') throw new Error(`save was ${saved.status}`)
    }

    it('reports the goal on the completion that brings it to its target (and not before)', async () => {
      const t = await setup(WEDNESDAY)
      await board(t, '2')
      const first = await present(t, await complete(t, 'tpl_seed_prayer_fajr', WEDNESDAY))
      expect(first.events.some((event) => event.type === 'WeeklyGoalCompleted')).toBe(false)

      await advanceTo(t, '2026-10-08')
      const second = await present(t, await complete(t, 'tpl_seed_prayer_fajr', '2026-10-08'))
      const goals = second.events.filter((event) => event.type === 'WeeklyGoalCompleted')
      expect(goals).toEqual([expect.objectContaining({ type: 'WeeklyGoalCompleted', weekKey: WEEK, earnedPoints: 10, scoreNow: 10 })])
    })

    it('does not report it again on a later completion once it is already complete', async () => {
      const t = await setup(WEDNESDAY)
      await board(t, '1')
      expect((await present(t, await complete(t, 'tpl_seed_prayer_fajr', WEDNESDAY))).events.some((event) => event.type === 'WeeklyGoalCompleted')).toBe(true)
      await advanceTo(t, '2026-10-08')
      expect((await present(t, await complete(t, 'tpl_seed_prayer_fajr', '2026-10-08'))).events.some((event) => event.type === 'WeeklyGoalCompleted')).toBe(false)
    })

    it('a completion of an unrelated quest reports no weekly goal', async () => {
      const t = await setup(WEDNESDAY)
      await board(t, '1')
      expect((await present(t, await complete(t, 'tpl_seed_prayer_dhuhr', WEDNESDAY))).events.some((event) => event.type === 'WeeklyGoalCompleted')).toBe(false)
    })

    it('a finalized board is never reported as a live goal: a completion in the next week reports none', async () => {
      const t = await setup(WEDNESDAY)
      await board(t, '1')
      const synced = await advanceTo(t, NEXT_MONDAY)
      expect(synced.finalizedWeeks).toHaveLength(1) // last week's board is final now
      const { events } = await present(t, await complete(t, 'tpl_seed_prayer_fajr', NEXT_MONDAY))
      expect(events.some((event) => event.type === 'WeeklyGoalCompleted')).toBe(false)
    })
  })

  it('never fails the action: a read that fails is reported in `errors` and the completion\'s own events still come back', async () => {
    const t = await setup()
    const result = await complete(t, 'tpl_seed_prayer_fajr', MONDAY)
    t.database.close() // every later read now fails
    const { events, errors } = await completionPresentationEvents(t.context, { events: result.events, home: result.home })
    expect(errors.length).toBeGreaterThan(0)
    expect(types(events)).toEqual(types(result.events))
  })
})

describe('reconciliationPresentationEvents', () => {
  /** A week whose result is 10/10, lived day by day, so the Monday sync finalizes exactly one day and one board. */
  async function perfectWeekClosedOvernight() {
    const t = await setup(WEDNESDAY)
    const gym = await createQuest(t.context, buildFormValues({ title: 'Gym' }, WEDNESDAY))
    if (gym.status !== 'created') throw new Error('create failed')
    const saved = await saveWeeklyBoard(
      t.context,
      weeklyForm({ goals: [goalRow('g1', { title: 'Gym sessions', points: 6, target: '2', trackingMode: 'linked_quest', templateId: gym.templateId }), goalRow('g2', { title: 'Report', points: 4, target: '1' })] }),
    )
    if (saved.status !== 'created') throw new Error(`save was ${saved.status}`)
    const board = await getWeeklyBoard(t.database, WEEK)
    await setWeeklyGoalProgress(t.context, board!.goals[1]!.id, 1)
    await complete(t, gym.templateId, WEDNESDAY)
    await advanceTo(t, '2026-10-08')
    await complete(t, gym.templateId, '2026-10-08')
    for (const date of ['2026-10-09', '2026-10-10', '2026-10-11']) await advanceTo(t, date)
    return t
  }

  it('presents a strict overnight reconciliation: the board result, the bonus, and the achievements its records unlocked', async () => {
    const t = await perfectWeekClosedOvernight()
    t.clock.set(noonOn(NEXT_MONDAY))
    const synced = await synchronizeAndLoadHome(t.context, 'startup')
    expect(synced.finalized).toHaveLength(OVERNIGHT_MAX_FINALIZED_DAYS)
    expect(synced.finalizedWeeks).toHaveLength(OVERNIGHT_MAX_FINALIZED_BOARDS)

    const { events, errors } = await reconciliationPresentationEvents(t.context, synced)
    expect(errors).toEqual([])
    expect(types(events).slice(0, 2)).toEqual(['WeeklyBoardFinalized', 'XPAwarded'])
    expect(events[0]).toMatchObject({ type: 'WeeklyBoardFinalized', weekKey: WEEK, score: 10, bonusExp: 500, rewardTierMinScore: 10 })
    // Several simultaneous unlocks come out in catalog order, deterministically.
    const weeklyIds = ids(events).filter((id) => ACHIEVEMENT_CATALOG.find((definition) => definition.id === id)?.group === 'weekly')
    expect(weeklyIds).toEqual(['first_goal_crusher_week', 'first_week_6_plus', 'first_week_8_plus', 'first_perfect_week'])
    const order = ids(events).map((id) => ACHIEVEMENT_CATALOG.findIndex((definition) => definition.id === id))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('is silent for the same week when the app was away for several days (catch-up, OD-21): money still paid, nothing presented', async () => {
    const t = await setup(WEDNESDAY)
    const saved = await saveWeeklyBoard(t.context, weeklyForm({ goals: [goalRow('g1', { points: 10, target: '1' })] }))
    if (saved.status !== 'created') throw new Error('save failed')
    const board = await getWeeklyBoard(t.database, WEEK)
    await setWeeklyGoalProgress(t.context, board!.goals[0]!.id, 1)

    t.clock.set(noonOn(NEXT_MONDAY))
    const synced = await synchronizeAndLoadHome(t.context, 'startup') // Wed … Sun in one go
    expect(synced.finalized.length).toBeGreaterThan(OVERNIGHT_MAX_FINALIZED_DAYS)
    expect(synced.finalizedWeeks).toHaveLength(1)

    expect(await reconciliationPresentationEvents(t.context, synced)).toEqual({ events: [], errors: [] })
    expect(synced.finalizedWeeks[0]?.events.length).toBeGreaterThan(0) // retained for audit, never replayed
    expect(synced.finalizedWeeks[0]?.bonusExp).toBe(500) // the EXP itself is correct
  })

  it('is silent when several boards were finalized at once', async () => {
    const t = await perfectWeekClosedOvernight()
    t.clock.set(noonOn(NEXT_MONDAY))
    const synced = await synchronizeAndLoadHome(t.context, 'startup')
    const twoBoards = { finalized: synced.finalized, finalizedWeeks: [...synced.finalizedWeeks, ...synced.finalizedWeeks] }
    expect(await reconciliationPresentationEvents(t.context, twoBoards)).toEqual({ events: [], errors: [] })
  })

  it('presents the achievements of a single finalized day (overnight) and nothing when nothing was finalized', async () => {
    const t = await setup()
    for (const templateId of SEED_IDS) await complete(t, templateId, MONDAY)
    expect(await reconciliationPresentationEvents(t.context, { finalized: [], finalizedWeeks: [] })).toEqual({ events: [], errors: [] })

    const synced = await advanceTo(t, '2026-10-06')
    expect(synced.finalized).toHaveLength(1)
    const { events } = await reconciliationPresentationEvents(t.context, synced)
    expect(ids(events)).toEqual(['first_completed_day', 'first_strong_day', 'first_perfect_day'])
    expect(events.some((event) => event.type === 'WeeklyBoardFinalized')).toBe(false)
  })

  it('never replays an old achievement on a later reconciliation or a restart', async () => {
    const t = await setup()
    for (const templateId of SEED_IDS) await complete(t, templateId, MONDAY)
    await reconciliationPresentationEvents(t.context, await advanceTo(t, '2026-10-06')) // first_* unlock here
    const next = await advanceTo(t, '2026-10-07') // Tuesday (nothing done) finalizes
    expect(ids((await reconciliationPresentationEvents(t.context, next)).events)).toEqual([])

    const restarted = await startApplication(t.context) // a reload/reopen: nothing to finalize
    expect(await reconciliationPresentationEvents(t.context, restarted)).toEqual({ events: [], errors: [] })
  })

  it('reports a failed read instead of throwing', async () => {
    const t = await setup()
    for (const templateId of SEED_IDS) await complete(t, templateId, MONDAY)
    const synced = await advanceTo(t, '2026-10-06')
    t.database.close()
    const { events, errors } = await reconciliationPresentationEvents(t.context, synced)
    expect(errors.length).toBeGreaterThan(0)
    expect(events).toEqual([])
  })
})
