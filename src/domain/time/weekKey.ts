import { DomainError } from '../types/errors'
import type { DateKey, WeekKey } from '../types/scalars'
import { addDays, compareDateKeys, isDateKey, isoWeekday, parseDateKey } from './dateKey'

/**
 * Monday → Sunday weeks on local calendar dates (MASTER_SPEC §4.2). A week is
 * named by the `DateKey` of its Monday, so the year boundary never matters
 * (no ISO week numbers). Everything is whole-day calendar arithmetic on
 * `DateKey`s, so DST changes, leap days and year ends cannot affect it.
 */

/** True for a valid `DateKey` that is a Monday. */
export function isWeekKey(input: unknown): input is WeekKey {
  return isDateKey(input) && isoWeekday(input) === 1
}

/** Like `isWeekKey` but throws `DomainError` on anything else. */
export function asWeekKey(input: string): WeekKey {
  const parsed = parseDateKey(input)
  if (!parsed.ok) {
    throw new DomainError('invalid_date_key', `Invalid week key (${parsed.error.code}): ${JSON.stringify(input)}`)
  }
  if (isoWeekday(parsed.value) !== 1) {
    throw new DomainError('invalid_date_key', `A week key must be a Monday, got ${input}`)
  }
  return parsed.value
}

/** The Monday of the week that contains `date`. */
export function weekKeyOf(date: DateKey): WeekKey {
  return addDays(date, -(isoWeekday(date) - 1)) as WeekKey
}

/** The Sunday that ends the week starting at `weekKey`. */
export function weekEndOf(weekKey: WeekKey): DateKey {
  return addDays(weekKey, 6)
}

/** The Monday of the following week. */
export function nextWeekKey(weekKey: WeekKey): WeekKey {
  return addDays(weekKey, 7) as WeekKey
}

/** The Monday of the preceding week. */
export function previousWeekKey(weekKey: WeekKey): WeekKey {
  return addDays(weekKey, -7) as WeekKey
}

/** True when `date` falls on a day of the week starting at `weekKey` (both ends included). */
export function isDateInWeek(date: DateKey, weekKey: WeekKey): boolean {
  return compareDateKeys(date, weekKey) >= 0 && compareDateKeys(date, weekEndOf(weekKey)) <= 0
}
