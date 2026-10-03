import { err, ok, type Result } from '../types/result'
import type { DateKey, EpochMs } from '../types/scalars'
import { parseDateKey } from './dateKey'

/**
 * An instant resolved to a local calendar date in an explicitly named IANA
 * timezone. This is what a completion records so that its `DateKey` is
 * authoritative and immune to later timezone changes.
 */
export interface ClockReading {
  readonly epochMs: EpochMs
  /** Calendar date at `epochMs` in `timeZone`. */
  readonly dateKey: DateKey
  /** Offset of local time from UTC at `epochMs`, in minutes (east positive). */
  readonly utcOffsetMinutes: number
  /** The IANA zone the reading was taken in, exactly as supplied. */
  readonly timeZone: string
}

export type ClockError =
  | { readonly code: 'invalid_epoch'; readonly epochMs: number }
  | { readonly code: 'invalid_time_zone'; readonly timeZone: string }

const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60_000

/**
 * Resolves `epochMs` in the IANA zone `timeZone` (e.g. `Europe/Berlin`).
 * The zone is an explicit input: nothing is read from the environment, so the
 * result is the same on every machine. `Intl` is used only as the runtime's
 * standard timezone database.
 */
export function clockReadingAt(
  epochMs: EpochMs,
  timeZone: string,
): Result<ClockReading, ClockError> {
  if (!Number.isSafeInteger(epochMs) || epochMs < 0) {
    return err({ code: 'invalid_epoch', epochMs })
  }
  const instant = new Date(epochMs)
  if (Number.isNaN(instant.getTime())) {
    return err({ code: 'invalid_epoch', epochMs })
  }
  if (typeof timeZone !== 'string' || timeZone.trim() === '') {
    return err({ code: 'invalid_time_zone', timeZone })
  }

  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(instant)
  } catch {
    return err({ code: 'invalid_time_zone', timeZone })
  }

  const field = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value)
  const year = field('year')
  const month = field('month')
  const day = field('day')
  const hour = field('hour') % 24
  const minute = field('minute')
  const second = field('second')

  const dateKey = parseDateKey(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  )
  if (!dateKey.ok) return err({ code: 'invalid_epoch', epochMs })

  // Local wall-clock reading expressed as if it were UTC, minus the true
  // instant (truncated to whole seconds) gives the zone's UTC offset.
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const instantSeconds =
    Math.floor(epochMs / MS_PER_SECOND) * MS_PER_SECOND
  const utcOffsetMinutes = Math.round((wallAsUtc - instantSeconds) / MS_PER_MINUTE)

  return ok({ epochMs, dateKey: dateKey.value, utcOffsetMinutes, timeZone })
}
