import { describe, expect, it } from 'vitest'
import {
  asDateKey,
  completeQuest,
  computeDailyProgress,
  createOccurrence,
  levelStateOf,
  type QuestCompletion,
  type QuestTemplate,
} from './index'

describe('public domain API', () => {
  it('runs template → occurrence → completion → daily progress end to end', () => {
    const date = asDateKey('2026-10-03')
    const template: QuestTemplate = {
      id: 'tpl_fajr',
      title: 'Fajr',
      difficulty: 'E',
      category: 'discipline',
      recurrence: { kind: 'daily' },
      role: 'standard',
      seedKey: 'prayer.fajr',
      activeFrom: asDateKey('2026-10-01'),
      activeUntil: null,
      status: 'active',
      sortOrder: 0,
      revision: 1,
      createdAt: 0,
      updatedAt: 0,
    }

    const occurrence = createOccurrence(template, date, 0)
    if (!occurrence.ok) throw new Error('expected an eligible occurrence')

    const completedAt = Date.UTC(2026, 9, 3, 3, 30, 0)
    const result = completeQuest({
      occurrence: occurrence.value,
      existingCompletion: null,
      ledger: { totalExp: 0, lastSeq: 0 },
      completedAt,
      timeZone: 'Asia/Riyadh',
    })
    if (result.status !== 'completed') throw new Error('expected completion')
    expect(result.xpTransaction.amount).toBe(10)
    expect(levelStateOf(result.xpTransaction.totalExpAfter).level).toBe(1)

    const completions: QuestCompletion[] = [result.completion]
    const daily = computeDailyProgress({
      dateKey: date,
      occurrences: [occurrence.value],
      completedOccurrenceIds: new Set(completions.map((c) => c.occurrenceId)),
    })
    expect(daily.ok && daily.value.quality).toBe('perfect')

    const retry = completeQuest({
      occurrence: occurrence.value,
      existingCompletion: result.completion,
      ledger: { totalExp: 10, lastSeq: 1 },
      completedAt: completedAt + 1_000,
      timeZone: 'Asia/Riyadh',
    })
    expect(retry.status).toBe('already_completed')
  })
})
