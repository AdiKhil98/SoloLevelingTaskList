/**
 * The device clock and time zone: the only place in the application that reads
 * them from the environment. The application layer receives these as an
 * explicit `Clock` (see `@/application`), and the domain only ever sees the
 * resulting values, so game rules never read ambient time.
 *
 * This module imports no other layer; its shape simply satisfies the
 * application layer's `Clock` interface structurally.
 */
export const systemClock = {
  /** The current instant as UTC epoch milliseconds. */
  now: (): number => Date.now(),
  /** The device's current IANA time zone (e.g. `Europe/Berlin`). */
  timeZone: (): string => Intl.DateTimeFormat().resolvedOptions().timeZone,
}
