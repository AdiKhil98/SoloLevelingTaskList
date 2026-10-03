import { describe, expect, it } from 'vitest'
import type { CompleteTodayQuestResult, TodayQuest } from '@/application'
import type { DomainEvent } from '@/domain'
import { noticeForCompletion } from './completionNotice'

const quest: TodayQuest = {
  occurrenceId: 'occ:tpl_a@2026-10-05',
  templateId: 'tpl_a',
  title: 'Fajr',
  difficulty: 'E',
  category: 'discipline',
  expReward: 10,
  role: 'standard',
  completed: false,
  completedAt: null,
}

const completed = (events: DomainEvent[]) =>
  ({ status: 'completed', events, home: null, refreshCause: null }) as CompleteTodayQuestResult

const xp = (amount: number): DomainEvent => ({
  type: 'XPAwarded',
  transactionId: 'xp:1',
  amount,
  sourceType: 'quest_completion',
  category: 'discipline',
  totalExpBefore: 0,
  totalExpAfter: amount,
})

describe('noticeForCompletion', () => {
  it('describes a plain completion with the EXP the domain awarded', () => {
    expect(noticeForCompletion(quest, completed([xp(10)]))).toEqual({
      tone: 'success',
      text: 'Fajr completed. +10 EXP.',
      canRefresh: false,
    })
  })

  it('adds level-up and rank-up text from the domain events', () => {
    const events: DomainEvent[] = [
      xp(500),
      { type: 'LevelUp', previousLevel: 1, newLevel: 4, levelsCrossed: [2, 3, 4], expIntoLevel: 82, expToNext: 238 },
      { type: 'RankUp', previousRank: 'S', newRank: 'special_100_plus', atLevel: 100 },
    ]

    expect(noticeForCompletion(quest, completed(events)).text).toBe(
      'Fajr completed. +500 EXP. LEVEL UP — LV. 4. RANK UP — ???.',
    )
  })

  it('reports a repeat as already completed, without claiming EXP', () => {
    const notice = noticeForCompletion(quest, {
      status: 'already_completed',
      home: null,
      refreshCause: null,
    })

    expect(notice).toEqual({ tone: 'success', text: 'Fajr was already completed.', canRefresh: false })
  })

  it('turns a domain rejection into a safe message and offers Refresh when the day moved on', () => {
    expect(noticeForCompletion(quest, { status: 'rejected', reason: 'day_ended' })).toMatchObject({
      tone: 'error',
      canRefresh: true,
      text: expect.stringContaining('This day has ended'),
    })
    expect(noticeForCompletion(quest, { status: 'rejected', reason: 'not_yet_active' }).canRefresh).toBe(false)
  })

  it('never exposes raw error text for a failed save', () => {
    const notice = noticeForCompletion(quest, {
      status: 'failed',
      reason: 'unexpected',
      cause: new DOMException('QuotaExceededError: raw detail', 'QuotaExceededError'),
    })

    expect(notice.tone).toBe('error')
    expect(notice.text).toBe('That quest could not be saved. Nothing was changed. Please try again.')
    expect(notice.text).not.toContain('QuotaExceededError')
  })

  it('names a full device clearly', () => {
    expect(noticeForCompletion(quest, { status: 'failed', reason: 'storage_full', cause: null }).text).toContain(
      'out of storage space',
    )
  })
})
