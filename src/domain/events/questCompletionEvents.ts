import type { ProgressionChange } from '../progression/award'
import type { XPTransaction } from '../progression/ledger'
import type { QuestCompletion, QuestOccurrence } from '../quests/types'
import type { DomainEvent } from './types'

/**
 * The events one quest completion produces, in presentation order:
 *
 *   1. QuestCompleted
 *   2. XPAwarded
 *   3. LevelUp   — only if at least one level was gained (one event,
 *                  `levelsCrossed` ascending)
 *   4. RankUp    — one per rank boundary crossed, ascending by `atLevel`
 *
 * (`DayStatusChanged` / `PerfectDayReached` will slot between 2 and 3 when a
 * later phase adds them.)
 */
export function buildQuestCompletionEvents(
  occurrence: QuestOccurrence,
  completion: QuestCompletion,
  transaction: XPTransaction,
  progression: ProgressionChange,
): readonly DomainEvent[] {
  const events: DomainEvent[] = [
    {
      type: 'QuestCompleted',
      occurrenceId: completion.occurrenceId,
      templateId: completion.templateId,
      dateKey: completion.dateKey,
      difficulty: occurrence.snapshot.difficulty,
      category: completion.category,
    },
    {
      type: 'XPAwarded',
      transactionId: transaction.id,
      amount: transaction.amount,
      sourceType: transaction.source.type,
      category: transaction.category,
      totalExpBefore: progression.totalExpBefore,
      totalExpAfter: progression.totalExpAfter,
    },
  ]

  if (progression.levelsCrossed.length > 0) {
    events.push({
      type: 'LevelUp',
      previousLevel: progression.before.level,
      newLevel: progression.after.level,
      levelsCrossed: progression.levelsCrossed,
      expIntoLevel: progression.after.expIntoLevel,
      expToNext: progression.after.expToNext,
    })
  }

  for (const transition of progression.rankTransitions) {
    events.push({ type: 'RankUp', ...transition })
  }

  return events
}
