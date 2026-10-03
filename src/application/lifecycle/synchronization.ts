import {
  compareDateKeys,
  nextDate,
  previousDate,
  type ClockReading,
  type DailySummary,
  type DateKey,
} from '@/domain'
import { finalizeDayAtomically, readFinalizationCursor } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { ApplicationError } from '../errors'

/** What started a reconciliation. Only the in-app midnight timer counts as "on time". */
export type ReconcileTrigger = 'startup' | 'resume' | 'midnight_tick'

/**
 * Whether the device date is safe to work with (OD-22).
 *
 * `behind`: the device date is earlier than the last recorded day, so the clock
 * moved backwards (manual change, travel). Finalized history is never reopened,
 * re-finalized or rewritten, and nothing may be written until the device date
 * reaches `recordedDate` again. There is nothing to clear: the check is made
 * from the stored data on every load, so normal use returns by itself.
 */
export type ClockStatus =
  | { readonly status: 'ok' }
  | { readonly status: 'behind'; readonly localDate: DateKey; readonly recordedDate: DateKey }

export interface DayAssessment {
  readonly clock: ClockStatus
  /**
   * The first date that is not finalized (the active day once the app is
   * synchronized), or null when no day has ever been recorded.
   */
  readonly cursor: DateKey | null
}

/** Compares the device date with the stored lifecycle position (read-only). */
export async function assessDay(context: ApplicationContext, reading: ClockReading): Promise<DayAssessment> {
  const cursor = await readFinalizationCursor(context.database)
  if (cursor !== null && compareDateKeys(reading.dateKey, cursor) < 0) {
    return { clock: { status: 'behind', localDate: reading.dateKey, recordedDate: cursor }, cursor }
  }
  return { clock: { status: 'ok' }, cursor }
}

/**
 * The gate every mutating use case passes first (completion, create, edit,
 * archive, restore). It proves, from stored data, that
 *  - the device date is not behind the recorded history, and
 *  - every day before today is already finalized,
 * so a screen left open across midnight (a stale tab) can never change state
 * ahead of reconciliation. It throws instead of reconciling: the caller
 * synchronizes first (`synchronizeAndLoadHome`), and a use case that is reached
 * without that fails visibly rather than writing into a stale day.
 */
export async function requireSynchronizedDay(context: ApplicationContext, reading: ClockReading): Promise<void> {
  const { clock, cursor } = await assessDay(context, reading)
  if (clock.status === 'behind') {
    throw new ApplicationError(
      'clock_behind',
      `The device date ${clock.localDate} is before the last recorded day ${clock.recordedDate}`,
    )
  }
  if (cursor !== null && compareDateKeys(cursor, reading.dateKey) < 0) {
    throw new ApplicationError(
      'day_not_synchronized',
      `Days from ${cursor} are not finalized yet (today is ${reading.dateKey})`,
    )
  }
}

export interface ReconcileResult {
  readonly clock: ClockStatus
  /**
   * The summaries THIS call wrote, oldest first. Retained for history and
   * debugging only: finalization awards no EXP and emits no domain events, so
   * a long absence never replays old celebrations (OD-21).
   */
  readonly finalized: readonly DailySummary[]
}

/**
 * Reconciles the calendar up to (not including) today (MASTER_SPEC §4.4).
 *
 * Every missing date from the cursor to yesterday is finalized in
 * chronological order, one atomic transaction per date, so an interrupted
 * catch-up resumes where it stopped and each date's streak effect sees the
 * previous one. Idempotent: finalizing an already-final date does nothing, so
 * a repeat, a racing timer or a second tab cannot double anything.
 *
 * `finalizedLate` is false only for a date finalized by the in-app midnight
 * timer on the very next day; startup, resume and any older date are catch-up.
 * If the device date is behind the recorded history nothing is finalized.
 */
export async function reconcileDays(
  context: ApplicationContext,
  reading: ClockReading,
  trigger: ReconcileTrigger,
): Promise<ReconcileResult> {
  const { clock, cursor } = await assessDay(context, reading)
  if (clock.status === 'behind' || cursor === null) return { clock, finalized: [] }

  const today = reading.dateKey
  const yesterday = previousDate(today)
  const finalized: DailySummary[] = []
  for (let date = cursor; compareDateKeys(date, today) < 0; date = nextDate(date)) {
    const result = await finalizeDayAtomically(context.database, {
      dateKey: date,
      today,
      finalizedAt: reading.epochMs,
      finalizedLate: trigger !== 'midnight_tick' || date !== yesterday,
    })
    if (result.status === 'rejected') {
      throw new ApplicationError('inconsistent_data', `Could not finalize ${date} (${result.reason.code})`)
    }
    if (result.status === 'finalized') finalized.push(result.summary)
  }
  return { clock, finalized }
}

/** Reads the clock and reconciles (the lifecycle step shared by startup, resume and the midnight timer). */
export async function synchronizeDay(
  context: ApplicationContext,
  trigger: ReconcileTrigger,
): Promise<{ readonly reading: ClockReading } & ReconcileResult> {
  const reading = readClock(context.clock)
  return { reading, ...(await reconcileDays(context, reading, trigger)) }
}
