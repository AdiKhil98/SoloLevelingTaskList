import { describe, expect, it } from 'vitest'
import { asDateKey } from '@/domain'
import { buildPerfectDayReachedEvent } from '../daily/perfectDay'
import { ACHIEVEMENT_CATALOG } from './catalog'
import { buildAchievementUnlockedEvents } from './unlockEvents'
import type { AchievementStatus } from './types'

const date = asDateKey('2026-10-05')

function status(id: string, unlock: AchievementStatus['unlock']): AchievementStatus {
  const definition = ACHIEVEMENT_CATALOG.find((candidate) => candidate.id === id)
  if (definition === undefined) throw new Error(`no achievement ${id}`)
  return { definition, unlock, progress: { current: unlock === null ? 0 : 1, target: 1 } }
}
const byTransaction = (transactionId: string): NonNullable<AchievementStatus['unlock']> => ({
  unlockedAt: 1,
  unlockedOn: date,
  evidence: { type: 'xp_transaction', transactionId, seq: 1 },
})
const byDay = (dateKey: string): NonNullable<AchievementStatus['unlock']> => ({ unlockedAt: 1, unlockedOn: date, evidence: { type: 'daily_summary', dateKey: asDateKey(dateKey) } })

describe('buildAchievementUnlockedEvents', () => {
  const statuses = [
    status('first_quest', byTransaction('tx-1')),
    status('quests_10', null),
    status('first_completed_day', byDay('2026-10-04')),
    status('first_strong_day', byDay('2026-10-05')),
  ]

  it('reports only unlocks whose evidence is a record the caller just wrote', () => {
    const events = buildAchievementUnlockedEvents(statuses, (evidence) => evidence.type === 'xp_transaction' && evidence.transactionId === 'tx-1')
    expect(events.map((event) => event.achievementId)).toEqual(['first_quest'])
  })

  it('never reports a locked achievement', () => {
    expect(buildAchievementUnlockedEvents(statuses, () => true).map((event) => event.achievementId)).not.toContain('quests_10')
  })

  it('reports nothing when the caller wrote nothing (an ordinary reload)', () => {
    expect(buildAchievementUnlockedEvents(statuses, () => false)).toEqual([])
  })

  it('keeps catalog order for several simultaneous unlocks, however the predicate matches them', () => {
    const events = buildAchievementUnlockedEvents(statuses, (evidence) => evidence.type === 'daily_summary')
    expect(events.map((event) => event.achievementId)).toEqual(['first_completed_day', 'first_strong_day'])
  })

  it('carries the catalog title, description, evidence and date, and no EXP', () => {
    const [event] = buildAchievementUnlockedEvents(statuses, (evidence) => evidence.type === 'xp_transaction')
    expect(event).toEqual({
      type: 'AchievementUnlocked',
      achievementId: 'first_quest',
      title: 'First Quest',
      description: 'Complete your first quest.',
      evidence: { type: 'xp_transaction', transactionId: 'tx-1', seq: 1 },
      unlockedOn: date,
    })
    expect(Object.keys(event ?? {})).not.toContain('amount')
  })
})

describe('buildPerfectDayReachedEvent', () => {
  const progress = (quality: 'perfect' | 'strong' | 'incomplete' | 'no_active_quests', completed: number, eligible: number) => ({
    dateKey: date,
    eligibleCount: eligible,
    completedCount: completed,
    quality,
    displayPercent: eligible === 0 ? null : Math.floor((completed / eligible) * 100),
  })

  it('reports a day standing at 100 %', () => {
    expect(buildPerfectDayReachedEvent(progress('perfect', 6, 6))).toEqual({ type: 'PerfectDayReached', dateKey: date, completedCount: 6, eligibleCount: 6 })
  })

  it('reports nothing for any other day, including a day with no quests', () => {
    expect(buildPerfectDayReachedEvent(progress('strong', 5, 6))).toBeNull()
    expect(buildPerfectDayReachedEvent(progress('incomplete', 1, 6))).toBeNull()
    expect(buildPerfectDayReachedEvent(progress('no_active_quests', 0, 0))).toBeNull()
  })
})
