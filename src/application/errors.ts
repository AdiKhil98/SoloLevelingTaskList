import { PersistenceError } from '@/persistence'

export type ApplicationErrorCode =
  /** The device clock or time zone could not be turned into a calendar date. */
  | 'clock_unavailable'
  /** Stored data contradicts itself in a way a use case cannot work around. */
  | 'inconsistent_data'
  /** The device date is before the last recorded day: nothing may be written (OD-22). */
  | 'clock_behind'
  /** Days before today are not finalized yet: lifecycle synchronization must run first. */
  | 'day_not_synchronized'

/** A failure raised by an application use case (as opposed to the storage layer). */
export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode

  constructor(code: ApplicationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ApplicationError'
    this.code = code
  }
}

/**
 * Player-safe categories for failures. The UI picks wording for each; raw
 * browser or storage error text is never shown to the player.
 */
export type FailureReason =
  | 'database_unavailable'
  | 'database_blocked'
  | 'newer_data'
  | 'storage_full'
  | 'data_invalid'
  | 'clock_unavailable'
  /** The device clock reads an earlier date than the last recorded day; changes are paused. */
  | 'clock_behind'
  /** The day changed under this screen; it must be synchronized before anything changes. */
  | 'day_not_synchronized'
  | 'unexpected'

export function classifyFailure(error: unknown): FailureReason {
  if (error instanceof PersistenceError) {
    switch (error.code) {
      case 'database_unavailable':
      case 'database_open_failed':
      case 'database_closed':
        return 'database_unavailable'
      case 'database_blocked':
        return 'database_blocked'
      case 'database_version_unsupported':
        return 'newer_data'
      case 'storage_quota_exceeded':
        return 'storage_full'
      case 'record_validation_failed':
      case 'ledger_integrity_failed':
        return 'data_invalid'
      default:
        return 'unexpected'
    }
  }
  if (error instanceof ApplicationError) {
    switch (error.code) {
      case 'clock_unavailable':
        return 'clock_unavailable'
      case 'clock_behind':
        return 'clock_behind'
      case 'day_not_synchronized':
        return 'day_not_synchronized'
      case 'inconsistent_data':
        return 'data_invalid'
    }
  }
  return 'unexpected'
}
