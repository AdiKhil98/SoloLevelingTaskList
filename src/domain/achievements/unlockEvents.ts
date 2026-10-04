import type { AchievementUnlockedEvent } from '../events/types'
import type { AchievementEvidence, AchievementStatus } from './types'

/**
 * The achievements whose unlocking record is one the caller says it just wrote.
 *
 * `statuses` is the whole catalog evaluated against history (catalog order);
 * `wroteEvidence` answers "did this action or reconciliation write that
 * record?". An unlock is reported only if its evidence is such a record, so an
 * achievement that was already unlocked earlier can never be reported again,
 * and nothing is stored to remember what was reported. The result keeps
 * catalog order, so several simultaneous unlocks come out in one fixed order.
 */
export function buildAchievementUnlockedEvents(
  statuses: readonly AchievementStatus[],
  wroteEvidence: (evidence: AchievementEvidence) => boolean,
): readonly AchievementUnlockedEvent[] {
  const events: AchievementUnlockedEvent[] = []
  for (const { definition, unlock } of statuses) {
    if (unlock === null || !wroteEvidence(unlock.evidence)) continue
    events.push({
      type: 'AchievementUnlocked',
      achievementId: definition.id,
      title: definition.title,
      description: definition.description,
      evidence: unlock.evidence,
      unlockedOn: unlock.unlockedOn,
    })
  }
  return events
}
