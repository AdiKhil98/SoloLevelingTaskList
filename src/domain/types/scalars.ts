/** UTC milliseconds since the Unix epoch. Audit use only; never a day key. */
export type EpochMs = number

declare const dateKeyBrand: unique symbol

/**
 * A calendar date, `YYYY-MM-DD` (year 0001–9999, proleptic Gregorian).
 * It names a day, not an instant. Obtain one through `parseDateKey`,
 * `asDateKey`, `makeDateKey` or date arithmetic; never by casting.
 */
export type DateKey = string & { readonly [dateKeyBrand]: true }

/** The `DateKey` of a week's Monday. */
export type WeekKey = DateKey

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]
