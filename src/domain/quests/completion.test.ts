import { describe, expect, it } from 'vitest'
import { buildOccurrence } from '../test-utils/builders'
import { totalExpToReachLevel } from '../progression/levels'
import { completeQuest, type CompleteQuestInput, type CompleteQuestResult } from './completion'
import type { QuestOccurrence } from './types'

const ZONE = 'Europe/Berlin'
// 2026-10-03 12:00 in Berlin (CEST, UTC+2).
const NOON = Date.UTC(2026, 9, 3, 10, 0, 0)

const tradingB = buildOccurrence({
  id: 'tpl_backtest',
  difficulty: 'B',
  category: 'trading',
})

function input(overrides: Partial<CompleteQuestInput> = {}): CompleteQuestInput {
  return {
    occurrence: tradingB,
    existingCompletion: null,
    ledger: { totalExp: 0, lastSeq: 0 },
    completedAt: NOON,
    timeZone: ZONE,
    ...overrides,
  }
}

function completed(result: CompleteQuestResult) {
  if (result.status !== 'completed') {
    throw new Error(`expected completed, got ${JSON.stringify(result)}`)
  }
  return result
}

describe('completeQuest — success', () => {
  it('creates one completion record for the occurrence', () => {
    const { completion } = completed(completeQuest(input()))
    expect(completion).toEqual({
      occurrenceId: 'occ:tpl_backtest@2026-10-03',
      templateId: 'tpl_backtest',
      dateKey: '2026-10-03',
      category: 'trading',
      expAwarded: 55,
      completedAt: NOON,
      utcOffsetMinutes: 120,
      timeZone: 'Europe/Berlin',
      xpTransactionId: 'xp:quest_completion:occ:tpl_backtest@2026-10-03',
    })
  })

  it('produces exactly one positive XP transaction with full audit information', () => {
    const { xpTransaction, completion } = completed(
      completeQuest(input({ ledger: { totalExp: 1_000, lastSeq: 7 } })),
    )
    expect(xpTransaction).toEqual({
      id: 'xp:quest_completion:occ:tpl_backtest@2026-10-03',
      seq: 8,
      idempotencyKey: 'quest_completion:occ:tpl_backtest@2026-10-03',
      source: {
        type: 'quest_completion',
        occurrenceId: 'occ:tpl_backtest@2026-10-03',
        templateId: 'tpl_backtest',
      },
      amount: 55,
      category: 'trading',
      createdAt: NOON,
      effectiveDate: '2026-10-03',
      sourceWeekKey: null,
      totalExpAfter: 1_055,
    })
    expect(completion.xpTransactionId).toBe(xpTransaction.id)
    expect(xpTransaction.amount).toBe(completion.expAwarded)
  })

  it('attributes the quest EXP to the quest category', () => {
    const fitness = buildOccurrence({ difficulty: 'S', category: 'fitness' })
    const { xpTransaction } = completed(completeQuest(input({ occurrence: fitness })))
    expect(xpTransaction.amount).toBe(120)
    expect(xpTransaction.category).toBe('fitness')
  })

  it('awards the occurrence snapshot, not the current configuration or template', () => {
    const snapshotted: QuestOccurrence = {
      ...tradingB,
      snapshot: { ...tradingB.snapshot, expReward: 7 },
    }
    expect(
      completed(completeQuest(input({ occurrence: snapshotted }))).xpTransaction.amount,
    ).toBe(7)
  })

  it('respects the supplied completion timestamp and timezone', () => {
    const lateEvening = Date.UTC(2026, 9, 3, 21, 59, 59, 999) // 23:59:59.999 in Berlin
    const { completion, xpTransaction } = completed(
      completeQuest(input({ completedAt: lateEvening })),
    )
    expect(completion.completedAt).toBe(lateEvening)
    expect(xpTransaction.createdAt).toBe(lateEvening)
    expect(completion.dateKey).toBe('2026-10-03')

    const tokyo = completed(
      completeQuest(
        input({ timeZone: 'Asia/Tokyo', completedAt: Date.UTC(2026, 9, 3, 3, 0, 0) }),
      ),
    )
    expect(tokyo.completion).toMatchObject({ timeZone: 'Asia/Tokyo', utcOffsetMinutes: 540 })
  })

  it('does not mutate its inputs', () => {
    const ledger = { totalExp: 10, lastSeq: 1 }
    const args = input({ ledger })
    const snapshot = structuredClone(args)
    completeQuest(args)
    expect(args).toEqual(snapshot)
    expect(ledger).toEqual({ totalExp: 10, lastSeq: 1 })
  })

  it('is deterministic: the same input yields identical records and events', () => {
    expect(completeQuest(input())).toEqual(completeQuest(input()))
  })
})

describe('completeQuest — idempotency', () => {
  it('recognizes a second attempt as already completed and awards nothing', () => {
    const first = completed(completeQuest(input()))

    const second = completeQuest(
      input({
        existingCompletion: first.completion,
        // The ledger already contains the first award.
        ledger: { totalExp: first.xpTransaction.totalExpAfter, lastSeq: first.xpTransaction.seq },
        completedAt: NOON + 5_000,
      }),
    )

    expect(second).toEqual({ status: 'already_completed', completion: first.completion })
    expect(second).not.toHaveProperty('xpTransaction')
    expect(second).not.toHaveProperty('events')
    expect(second).not.toHaveProperty('progression')
  })

  it('stays an idempotent no-op even after the occurrence day has ended', () => {
    const first = completed(completeQuest(input()))
    const nextDayLater = Date.UTC(2026, 9, 5, 10, 0, 0)
    expect(
      completeQuest(input({ existingCompletion: first.completion, completedAt: nextDayLater })),
    ).toMatchObject({ status: 'already_completed' })
  })

  it('never emits a level-up or rank-up event on the duplicate attempt', () => {
    // First completion crosses Level 10 (E → D).
    const boundary = { totalExp: totalExpToReachLevel(10) - 1, lastSeq: 40 }
    const first = completed(completeQuest(input({ ledger: boundary })))
    expect(first.events.map((e) => e.type)).toContain('LevelUp')

    const second = completeQuest(
      input({
        existingCompletion: first.completion,
        ledger: { totalExp: first.xpTransaction.totalExpAfter, lastSeq: first.xpTransaction.seq },
      }),
    )
    expect(second.status).toBe('already_completed')
    expect(second).not.toHaveProperty('events')
  })

  it('uses the same transaction identity and idempotency key on every attempt', () => {
    const a = completed(completeQuest(input({ completedAt: NOON })))
    const b = completed(completeQuest(input({ completedAt: NOON + 60_000 })))
    expect(b.xpTransaction.id).toBe(a.xpTransaction.id)
    expect(b.xpTransaction.idempotencyKey).toBe(a.xpTransaction.idempotencyKey)
    expect(b.completion.occurrenceId).toBe(a.completion.occurrenceId)
  })

  it('rejects an existing completion that belongs to another occurrence', () => {
    const other = completed(
      completeQuest(input({ occurrence: buildOccurrence({ id: 'tpl_other' }) })),
    )
    expect(completeQuest(input({ existingCompletion: other.completion }))).toEqual({
      status: 'rejected',
      reason: { code: 'existing_completion_mismatch' },
    })
  })
})

describe('completeQuest — day rules', () => {
  it('rejects completion before the occurrence date', () => {
    const dayBefore = Date.UTC(2026, 9, 2, 10, 0, 0)
    expect(completeQuest(input({ completedAt: dayBefore }))).toEqual({
      status: 'rejected',
      reason: {
        code: 'occurrence_not_yet_active',
        occurrenceDate: '2026-10-03',
        localDate: '2026-10-02',
      },
    })
  })

  it('rejects completion after the occurrence day has ended', () => {
    const midnight = Date.UTC(2026, 9, 3, 22, 0, 0, 0) // 00:00:00.000 on the 4th in Berlin
    expect(completeQuest(input({ completedAt: midnight }))).toEqual({
      status: 'rejected',
      reason: {
        code: 'occurrence_day_ended',
        occurrenceDate: '2026-10-03',
        localDate: '2026-10-04',
      },
    })
  })

  it('decides the day from the explicit timezone, not the host', () => {
    // 2026-10-03 23:30 UTC: the 3rd in Los Angeles, already the 4th in Auckland.
    const instant = Date.UTC(2026, 9, 3, 23, 30, 0)
    expect(completeQuest(input({ completedAt: instant, timeZone: 'America/Los_Angeles' })).status).toBe(
      'completed',
    ) // 16:30 on the 3rd
    expect(completeQuest(input({ completedAt: instant, timeZone: 'Pacific/Auckland' })).status).toBe(
      'rejected',
    ) // 12:30 on the 4th
  })
})

describe('completeQuest — invalid input', () => {
  it('rejects an unknown timezone and an unusable instant', () => {
    expect(completeQuest(input({ timeZone: 'Mars/Olympus' }))).toEqual({
      status: 'rejected',
      reason: { code: 'invalid_clock', detail: { code: 'invalid_time_zone', timeZone: 'Mars/Olympus' } },
    })
    expect(completeQuest(input({ completedAt: Number.NaN }))).toMatchObject({
      status: 'rejected',
      reason: { code: 'invalid_clock' },
    })
  })

  it('rejects a corrupted ledger state', () => {
    for (const ledger of [
      { totalExp: -1, lastSeq: 0 },
      { totalExp: 1.5, lastSeq: 0 },
      { totalExp: 0, lastSeq: -1 },
      { totalExp: Number.NaN, lastSeq: 0 },
    ]) {
      expect(completeQuest(input({ ledger }))).toEqual({
        status: 'rejected',
        reason: { code: 'invalid_ledger_state' },
      })
    }
  })

  it('rejects an occurrence whose identity, date, category or reward is invalid', () => {
    const tamperedId = { ...tradingB, id: 'occ:tpl_backtest@2026-10-04' }
    const badDate = { ...tradingB, dateKey: '2026-02-30' as never }
    const badCategory = { ...tradingB, snapshot: { ...tradingB.snapshot, category: 'x' as never } }
    const zeroReward = { ...tradingB, snapshot: { ...tradingB.snapshot, expReward: 0 } }
    const fractionalReward = { ...tradingB, snapshot: { ...tradingB.snapshot, expReward: 2.5 } }

    const problems = [tamperedId, badDate, badCategory, zeroReward, fractionalReward].map(
      (occurrence) => {
        const result = completeQuest(input({ occurrence }))
        return result.status === 'rejected' && result.reason.code === 'invalid_occurrence'
          ? result.reason.problem
          : null
      },
    )
    expect(problems).toEqual(['id', 'date', 'category', 'exp_reward', 'exp_reward'])
  })

  it('reports a technical overflow rather than corrupting the total', () => {
    expect(
      completeQuest(input({ ledger: { totalExp: Number.MAX_SAFE_INTEGER, lastSeq: 0 } })),
    ).toEqual({ status: 'rejected', reason: { code: 'exp_overflow' } })
  })
})

describe('completeQuest — progression and events', () => {
  const types = (result: CompleteQuestResult) =>
    result.status === 'completed' ? result.events.map((e) => e.type) : []

  it('emits QuestCompleted then XPAwarded when no level is gained', () => {
    const result = completeQuest(input())
    expect(types(result)).toEqual(['QuestCompleted', 'XPAwarded'])
    const { events, progression } = completed(result)
    expect(progression.levelsCrossed).toEqual([])
    expect(events).toEqual([
      {
        type: 'QuestCompleted',
        occurrenceId: 'occ:tpl_backtest@2026-10-03',
        templateId: 'tpl_backtest',
        dateKey: '2026-10-03',
        difficulty: 'B',
        category: 'trading',
      },
      {
        type: 'XPAwarded',
        transactionId: 'xp:quest_completion:occ:tpl_backtest@2026-10-03',
        amount: 55,
        sourceType: 'quest_completion',
        category: 'trading',
        totalExpBefore: 0,
        totalExpAfter: 55,
      },
    ])
  })

  it('adds one LevelUp after XPAwarded when a level is gained', () => {
    const result = completeQuest(input({ ledger: { totalExp: 80, lastSeq: 0 } }))
    expect(types(result)).toEqual(['QuestCompleted', 'XPAwarded', 'LevelUp'])
    expect(completed(result).events[2]).toEqual({
      type: 'LevelUp',
      previousLevel: 1,
      newLevel: 2,
      levelsCrossed: [2],
      expIntoLevel: 35,
      expToNext: 135,
    })
  })

  it('adds RankUp after LevelUp when the level gained crosses a rank boundary', () => {
    const result = completeQuest(
      input({ ledger: { totalExp: totalExpToReachLevel(10) - 1, lastSeq: 0 } }),
    )
    expect(types(result)).toEqual(['QuestCompleted', 'XPAwarded', 'LevelUp', 'RankUp'])
    expect(completed(result).events[3]).toEqual({
      type: 'RankUp',
      previousRank: 'E',
      newRank: 'D',
      atLevel: 10,
    })
  })

  it('reports multiple level gains as one LevelUp listing every level crossed', () => {
    // A snapshot worth 500 EXP (as the weekly bonus would be) from a fresh player.
    const big: QuestOccurrence = {
      ...tradingB,
      snapshot: { ...tradingB.snapshot, expReward: 500 },
    }
    const { events, progression } = completed(completeQuest(input({ occurrence: big })))
    expect(progression.after).toMatchObject({ level: 4, expIntoLevel: 82, expToNext: 238 })
    expect(events.filter((e) => e.type === 'LevelUp')).toEqual([
      {
        type: 'LevelUp',
        previousLevel: 1,
        newLevel: 4,
        levelsCrossed: [2, 3, 4],
        expIntoLevel: 82,
        expToNext: 238,
      },
    ])
  })

  it('reports every rank boundary of a huge gain, ascending, after the LevelUp', () => {
    const huge: QuestOccurrence = {
      ...tradingB,
      snapshot: { ...tradingB.snapshot, expReward: 485_351 },
    }
    const { events } = completed(completeQuest(input({ occurrence: huge })))
    expect(events.map((e) => e.type)).toEqual([
      'QuestCompleted',
      'XPAwarded',
      'LevelUp',
      'RankUp',
      'RankUp',
      'RankUp',
      'RankUp',
      'RankUp',
      'RankUp',
    ])
    const rankUps = events.flatMap((e) => (e.type === 'RankUp' ? [e] : []))
    expect(rankUps.map((e) => [e.atLevel, e.newRank])).toEqual([
      [10, 'D'],
      [20, 'C'],
      [35, 'B'],
      [50, 'A'],
      [75, 'S'],
      [100, 'special_100_plus'],
    ])
  })
})
