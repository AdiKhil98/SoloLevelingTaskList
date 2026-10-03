import type { CompleteQuestRejection, CompleteTodayQuestResult, FailureReason, TodayQuest } from '@/application'
import type { LevelUpEvent, RankUpEvent, XPAwardedEvent } from '@/domain'
import { rankLabel } from '../displayLabels'

export interface Notice {
  readonly tone: 'success' | 'error'
  readonly text: string
  /** Offer a Refresh action (the stored day may have moved on). */
  readonly canRefresh: boolean
}

/** Shown when a completion could not be saved (nothing was written). */
function failureMessage(reason: FailureReason): string {
  switch (reason) {
    case 'storage_full':
      return 'Your device is out of storage space, so that quest was not saved.'
    case 'database_unavailable':
    case 'database_blocked':
      return 'Saving is unavailable right now. That quest was not saved.'
    default:
      return 'That quest could not be saved. Nothing was changed. Please try again.'
  }
}

/** Shown when the domain refused a completion (nothing was written). */
function rejectionMessage(reason: CompleteQuestRejection): string {
  switch (reason) {
    case 'day_ended':
      return 'This day has ended. Refresh to load today’s quests.'
    case 'not_yet_active':
      return 'That quest is not active yet.'
    case 'not_found':
    case 'invalid_state':
      return 'That quest could not be found. Refresh and try again.'
  }
}

/**
 * A small, non-cinematic message describing what a completion did. It only
 * reads what the domain reported (events, results) and never shows raw error
 * text; cinematic Level Up / Rank Up presentation is Phase 10.
 */
export function noticeForCompletion(quest: TodayQuest, result: CompleteTodayQuestResult): Notice {
  switch (result.status) {
    case 'completed': {
      const awarded = result.events.find((event): event is XPAwardedEvent => event.type === 'XPAwarded')
      const levelUp = result.events.find((event): event is LevelUpEvent => event.type === 'LevelUp')
      const rankUps = result.events.filter((event): event is RankUpEvent => event.type === 'RankUp')

      const parts = [`${quest.title} completed.`]
      if (awarded !== undefined) parts.push(`+${awarded.amount} EXP.`)
      if (levelUp !== undefined) parts.push(`LEVEL UP — LV. ${levelUp.newLevel}.`)
      const lastRankUp = rankUps[rankUps.length - 1]
      if (lastRankUp !== undefined) parts.push(`RANK UP — ${rankLabel(lastRankUp.newRank)}.`)
      return { tone: 'success', text: parts.join(' '), canRefresh: false }
    }
    case 'already_completed':
      return { tone: 'success', text: `${quest.title} was already completed.`, canRefresh: false }
    case 'rejected':
      return {
        tone: 'error',
        text: rejectionMessage(result.reason),
        canRefresh: result.reason !== 'not_yet_active',
      }
    case 'failed':
      return { tone: 'error', text: failureMessage(result.reason), canRefresh: false }
  }
}
