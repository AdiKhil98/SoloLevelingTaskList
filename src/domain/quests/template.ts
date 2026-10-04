import { isCategory } from '../config/categories'
import { isDifficulty } from '../config/difficulty'
import { compareDateKeys, isDateKey } from '../time/dateKey'
import { err, ok, type Result } from '../types/result'
import { isSortOrder } from './order'
import { validateRecurrence, type RecurrenceError } from './recurrence'
import type { QuestTemplate } from './types'

export type TemplateValidationError =
  | { readonly code: 'empty_id' }
  | { readonly code: 'empty_title' }
  | { readonly code: 'invalid_difficulty'; readonly value: unknown }
  | { readonly code: 'invalid_category'; readonly value: unknown }
  | { readonly code: 'invalid_role'; readonly value: unknown }
  | { readonly code: 'invalid_revision'; readonly value: unknown }
  | { readonly code: 'invalid_sort_order'; readonly value: unknown }
  | { readonly code: 'invalid_active_from'; readonly value: unknown }
  | { readonly code: 'invalid_active_until'; readonly value: unknown }
  | { readonly code: 'active_period_inverted' }
  | { readonly code: 'one_time_outside_active_period' }
  | { readonly code: 'invalid_recurrence'; readonly detail: RecurrenceError }

/**
 * Checks a template against DATA_MODEL §4. Returns the first violation.
 * Only the fields the engine relies on are checked; persistence-only fields
 * (timestamps, seed key, status) are the repository's concern.
 */
export function validateQuestTemplate(
  template: QuestTemplate,
): Result<QuestTemplate, TemplateValidationError> {
  if (template.id.trim() === '') return err({ code: 'empty_id' })
  if (template.title.trim() === '') return err({ code: 'empty_title' })
  if (!isDifficulty(template.difficulty)) {
    return err({ code: 'invalid_difficulty', value: template.difficulty })
  }
  if (!isCategory(template.category)) {
    return err({ code: 'invalid_category', value: template.category })
  }
  if (template.role !== 'standard' && template.role !== 'sleep') {
    return err({ code: 'invalid_role', value: template.role })
  }
  if (!Number.isSafeInteger(template.revision) || template.revision < 0) {
    return err({ code: 'invalid_revision', value: template.revision })
  }
  if (!isSortOrder(template.sortOrder)) {
    return err({ code: 'invalid_sort_order', value: template.sortOrder })
  }
  if (!isDateKey(template.activeFrom)) {
    return err({ code: 'invalid_active_from', value: template.activeFrom })
  }
  if (template.activeUntil !== null) {
    if (!isDateKey(template.activeUntil)) {
      return err({ code: 'invalid_active_until', value: template.activeUntil })
    }
    if (compareDateKeys(template.activeUntil, template.activeFrom) < 0) {
      return err({ code: 'active_period_inverted' })
    }
  }

  const recurrence = validateRecurrence(template.recurrence)
  if (!recurrence.ok) {
    return err({ code: 'invalid_recurrence', detail: recurrence.error })
  }

  if (recurrence.value.kind === 'one_time') {
    const { date } = recurrence.value
    const beforeStart = compareDateKeys(date, template.activeFrom) < 0
    const afterEnd =
      template.activeUntil !== null &&
      compareDateKeys(date, template.activeUntil) > 0
    if (beforeStart || afterEnd) {
      return err({ code: 'one_time_outside_active_period' })
    }
  }

  return ok(template)
}
