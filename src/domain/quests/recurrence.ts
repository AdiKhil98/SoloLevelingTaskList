import { err, ok, type Result } from '../types/result'
import { ISO_WEEKDAYS, type DateKey } from '../types/scalars'
import { daysBetween, isDateKey, isoWeekday } from '../time/dateKey'
import type { QuestRecurrence } from './types'

/** Smallest legal interval: every 1 day is just `daily` (MASTER_SPEC §5.1). */
export const MIN_INTERVAL_DAYS = 2

export type RecurrenceError =
  | { readonly code: 'not_an_object' }
  | { readonly code: 'unknown_kind'; readonly kind: unknown }
  | { readonly code: 'weekdays_not_array' }
  | { readonly code: 'weekdays_empty' }
  | { readonly code: 'weekday_out_of_range'; readonly weekday: unknown }
  | { readonly code: 'weekday_duplicate'; readonly weekday: number }
  | { readonly code: 'interval_not_integer'; readonly everyNDays: unknown }
  | { readonly code: 'interval_too_small'; readonly everyNDays: number }
  | { readonly code: 'invalid_anchor'; readonly anchor: unknown }
  | { readonly code: 'invalid_one_time_date'; readonly date: unknown }

/**
 * Validates untrusted recurrence data. Malformed recurrences are rejected
 * with a typed error; nothing is silently corrected.
 */
export function validateRecurrence(
  input: unknown,
): Result<QuestRecurrence, RecurrenceError> {
  if (typeof input !== 'object' || input === null) {
    return err({ code: 'not_an_object' })
  }
  const candidate = input as Record<string, unknown>

  switch (candidate.kind) {
    case 'daily':
      return ok({ kind: 'daily' })

    case 'weekdays': {
      const weekdays = candidate.weekdays
      if (!Array.isArray(weekdays)) return err({ code: 'weekdays_not_array' })
      if (weekdays.length === 0) return err({ code: 'weekdays_empty' })
      const seen = new Set<number>()
      for (const weekday of weekdays as unknown[]) {
        if (!(ISO_WEEKDAYS as readonly unknown[]).includes(weekday)) {
          return err({ code: 'weekday_out_of_range', weekday })
        }
        if (seen.has(weekday as number)) {
          return err({ code: 'weekday_duplicate', weekday: weekday as number })
        }
        seen.add(weekday as number)
      }
      return ok({ kind: 'weekdays', weekdays: [...(weekdays as QuestWeekdays)] })
    }

    case 'interval': {
      const { everyNDays, anchor } = candidate
      if (typeof everyNDays !== 'number' || !Number.isSafeInteger(everyNDays)) {
        return err({ code: 'interval_not_integer', everyNDays })
      }
      if (everyNDays < MIN_INTERVAL_DAYS) {
        return err({ code: 'interval_too_small', everyNDays })
      }
      if (!isDateKey(anchor)) return err({ code: 'invalid_anchor', anchor })
      return ok({ kind: 'interval', everyNDays, anchor })
    }

    case 'one_time': {
      if (!isDateKey(candidate.date)) {
        return err({ code: 'invalid_one_time_date', date: candidate.date })
      }
      return ok({ kind: 'one_time', date: candidate.date })
    }

    default:
      return err({ code: 'unknown_kind', kind: candidate.kind })
  }
}

type QuestWeekdays = Extract<QuestRecurrence, { kind: 'weekdays' }>['weekdays']

/**
 * Whether an already-validated recurrence selects `date`. Pure calendar
 * logic: it knows nothing about the active period, completion or the clock.
 */
export function recurrenceMatchesDate(
  recurrence: QuestRecurrence,
  date: DateKey,
): boolean {
  switch (recurrence.kind) {
    case 'daily':
      return true
    case 'weekdays':
      return recurrence.weekdays.includes(isoWeekday(date))
    case 'interval': {
      const elapsed = daysBetween(recurrence.anchor, date)
      return elapsed >= 0 && elapsed % recurrence.everyNDays === 0
    }
    case 'one_time':
      return recurrence.date === date
  }
}
