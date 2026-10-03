import { expRewardForDifficulty } from '../config/difficulty'
import { isDateKey } from '../time/dateKey'
import { err, ok, type Result } from '../types/result'
import type { DateKey, EpochMs } from '../types/scalars'
import { checkQuestEligibility, type IneligibleReason } from './eligibility'
import { occurrenceIdOf } from './keys'
import { validateQuestTemplate, type TemplateValidationError } from './template'
import type { QuestOccurrence, QuestTemplate } from './types'

export type OccurrenceError =
  | { readonly code: 'invalid_date'; readonly dateKey: unknown }
  | { readonly code: 'invalid_materialized_at'; readonly value: unknown }
  | { readonly code: 'invalid_template'; readonly detail: TemplateValidationError }
  | { readonly code: 'not_eligible'; readonly reason: IneligibleReason }

/**
 * Creates the immutable snapshot of `template` for `dateKey`.
 *
 * The id is deterministic (`occ:{templateId}@{dateKey}`), so evaluating the
 * same template and date always yields the same identity. Every
 * history-relevant field is copied, so later edits to the template cannot
 * change this occurrence. `materializedAt` is supplied by the caller.
 */
export function createOccurrence(
  template: QuestTemplate,
  dateKey: DateKey,
  materializedAt: EpochMs,
): Result<QuestOccurrence, OccurrenceError> {
  if (!isDateKey(dateKey)) return err({ code: 'invalid_date', dateKey })
  if (!Number.isSafeInteger(materializedAt) || materializedAt < 0) {
    return err({ code: 'invalid_materialized_at', value: materializedAt })
  }

  const validated = validateQuestTemplate(template)
  if (!validated.ok) {
    return err({ code: 'invalid_template', detail: validated.error })
  }

  const eligibility = checkQuestEligibility(template, dateKey)
  if (!eligibility.eligible) {
    return err({ code: 'not_eligible', reason: eligibility.reason })
  }

  return ok({
    id: occurrenceIdOf(template.id, dateKey),
    templateId: template.id,
    dateKey,
    templateRevision: template.revision,
    snapshot: {
      title: template.title,
      difficulty: template.difficulty,
      category: template.category,
      expReward: expRewardForDifficulty(template.difficulty),
      role: template.role,
      recurrenceKind: template.recurrence.kind,
    },
    materializedAt,
  })
}
