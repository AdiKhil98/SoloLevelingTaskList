import { compareDateKeys } from '../time/dateKey'
import { DomainError } from '../types/errors'
import type { DateKey } from '../types/scalars'
import { recurrenceMatchesDate, validateRecurrence } from './recurrence'
import type { QuestTemplate } from './types'

export type IneligibleReason =
  | 'before_active_from'
  | 'after_active_until'
  | 'recurrence_mismatch'

export type EligibilityResult =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: IneligibleReason }

/**
 * Answers "should this quest have an occurrence on this date?" from the
 * template alone (DATA_MODEL §4). It does not know about completion, the
 * clock, the UI or storage.
 *
 * Throws `DomainError('invalid_recurrence')` if the template's recurrence is
 * malformed, rather than guessing. Use `validateQuestTemplate` first when the
 * template comes from untrusted data.
 */
export function checkQuestEligibility(
  template: QuestTemplate,
  date: DateKey,
): EligibilityResult {
  const recurrence = validateRecurrence(template.recurrence)
  if (!recurrence.ok) {
    throw new DomainError(
      'invalid_recurrence',
      `Template ${template.id} has an invalid recurrence: ${recurrence.error.code}`,
    )
  }

  if (compareDateKeys(date, template.activeFrom) < 0) {
    return { eligible: false, reason: 'before_active_from' }
  }
  if (
    template.activeUntil !== null &&
    compareDateKeys(date, template.activeUntil) > 0
  ) {
    return { eligible: false, reason: 'after_active_until' }
  }
  if (!recurrenceMatchesDate(recurrence.value, date)) {
    return { eligible: false, reason: 'recurrence_mismatch' }
  }
  return { eligible: true }
}

export function isQuestEligibleOnDate(
  template: QuestTemplate,
  date: DateKey,
): boolean {
  return checkQuestEligibility(template, date).eligible
}
