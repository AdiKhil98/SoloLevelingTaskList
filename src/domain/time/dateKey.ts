import { DomainError } from '../types/errors'
import { err, ok, type Result } from '../types/result'
import type { DateKey, IsoWeekday } from '../types/scalars'

/**
 * Date-only calendar arithmetic on `DateKey` values.
 *
 * Everything here works on year/month/day fields through an integer
 * day-serial (days since 1970-01-01 in the proleptic Gregorian calendar).
 * No `Date` object and no millisecond arithmetic is involved, so DST
 * transitions (23/25-hour days), leap days and year boundaries cannot
 * affect results. This does NOT make the application timezone UTC: the
 * mapping from an instant to a calendar date lives in `./clock`.
 */

export const MIN_YEAR = 1
export const MAX_YEAR = 9999

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface DateParts {
  readonly year: number
  readonly month: number
  readonly day: number
}

export type DateKeyParseError =
  | { readonly code: 'malformed'; readonly input: string }
  | { readonly code: 'year_out_of_range'; readonly input: string }
  | { readonly code: 'impossible_date'; readonly input: string }

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

function isValidParts(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= MIN_YEAR &&
    year <= MAX_YEAR &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  )
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

function formatDateKey(year: number, month: number, day: number): DateKey {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as DateKey
}

/** Days since 1970-01-01 for a valid civil date (Hinnant's algorithm). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yearOfEra = y - era * 400
  const shiftedMonth = month > 2 ? month - 3 : month + 9
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear
  return era * 146097 + dayOfEra - 719468
}

function civilFromDays(serial: number): DateParts {
  const z = serial + 719468
  const era = Math.floor(z / 146097)
  const dayOfEra = z - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  )
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0)
  return { year, month, day }
}

export function parseDateKey(input: string): Result<DateKey, DateKeyParseError> {
  const match = DATE_KEY_PATTERN.exec(input)
  if (match === null) return err({ code: 'malformed', input })

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return err({ code: 'year_out_of_range', input })
  }
  if (!isValidParts(year, month, day)) {
    return err({ code: 'impossible_date', input })
  }
  return ok(input as DateKey)
}

/** Runtime guard for untrusted values (persisted or imported data). */
export function isDateKey(input: unknown): input is DateKey {
  return typeof input === 'string' && parseDateKey(input).ok
}

/** Like `parseDateKey` but throws `DomainError` on invalid input. */
export function asDateKey(input: string): DateKey {
  const parsed = parseDateKey(input)
  if (!parsed.ok) {
    throw new DomainError(
      'invalid_date_key',
      `Invalid date key (${parsed.error.code}): ${JSON.stringify(input)}`,
    )
  }
  return parsed.value
}

/** Builds a key from calendar fields; throws if they are not a real date. */
export function makeDateKey(year: number, month: number, day: number): DateKey {
  if (!isValidParts(year, month, day)) {
    throw new DomainError(
      'invalid_date_parts',
      `Not a valid calendar date: ${year}-${month}-${day}`,
    )
  }
  return formatDateKey(year, month, day)
}

export function dateKeyParts(key: DateKey): DateParts {
  return {
    year: Number(key.slice(0, 4)),
    month: Number(key.slice(5, 7)),
    day: Number(key.slice(8, 10)),
  }
}

/**
 * The calendar date shown by `date`'s LOCAL fields (the runtime's own
 * timezone). The domain's rules never call this: they take an explicit
 * IANA zone and use `clockReadingAt`. This exists for the platform layer.
 */
export function dateKeyFromLocalDate(date: Date): DateKey {
  if (Number.isNaN(date.getTime())) {
    throw new DomainError('invalid_date_parts', 'Cannot read an invalid Date')
  }
  return makeDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** -1, 0 or 1. Valid keys sort chronologically as plain strings. */
export function compareDateKeys(a: DateKey, b: DateKey): -1 | 0 | 1 {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function serialOf(key: DateKey): number {
  const { year, month, day } = dateKeyParts(key)
  return daysFromCivil(year, month, day)
}

/** Adds (or, if negative, subtracts) whole calendar days. */
export function addDays(key: DateKey, days: number): DateKey {
  if (!Number.isSafeInteger(days)) {
    throw new DomainError(
      'invalid_count',
      `Day offset must be a safe integer, got ${days}`,
    )
  }
  const { year, month, day } = civilFromDays(serialOf(key) + days)
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new DomainError(
      'date_out_of_range',
      `${key} ${days >= 0 ? '+' : ''}${days} days leaves years ${MIN_YEAR}–${MAX_YEAR}`,
    )
  }
  return formatDateKey(year, month, day)
}

export function nextDate(key: DateKey): DateKey {
  return addDays(key, 1)
}

export function previousDate(key: DateKey): DateKey {
  return addDays(key, -1)
}

/** Signed whole calendar days from `from` to `to` (`to − from`). */
export function daysBetween(from: DateKey, to: DateKey): number {
  return serialOf(to) - serialOf(from)
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: DateKey): IsoWeekday {
  // 1970-01-01 (serial 0) was a Thursday, ISO weekday 4.
  const index = (((serialOf(key) + 3) % 7) + 7) % 7
  return (index + 1) as IsoWeekday
}
