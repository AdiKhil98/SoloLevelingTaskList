import { clockReadingAt, type ClockReading } from '@/domain'
import { ApplicationError } from './errors'

/**
 * The application's view of "now" and "where". Production supplies the device
 * clock (`systemClock` in `@/platform`); tests supply a fixed one. This is the
 * single boundary through which time enters the application layer.
 */
export interface Clock {
  /** The current instant as UTC epoch milliseconds. */
  now(): number
  /** The current IANA time zone, e.g. `Europe/Berlin`. */
  timeZone(): string
}

/**
 * Takes one reading of the clock and resolves it to a local calendar date with
 * the Phase 02 domain function. Every use case derives "today" here, so the
 * loaders, the seeder and the completion command can never disagree about it.
 */
export function readClock(clock: Clock): ClockReading {
  const reading = clockReadingAt(clock.now(), clock.timeZone())
  if (!reading.ok) {
    throw new ApplicationError(
      'clock_unavailable',
      `The device clock could not be read (${reading.error.code})`,
    )
  }
  return reading.value
}
