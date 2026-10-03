import { PersistenceError } from '@/persistence'

export type ApplicationErrorCode =
  /** The device clock or time zone could not be turned into a calendar date. */
  | 'clock_unavailable'
  /** Stored data contradicts itself in a way a use case cannot work around. */
  | 'inconsistent_data'

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
    return error.code === 'clock_unavailable' ? 'clock_unavailable' : 'data_invalid'
  }
  return 'unexpected'
}
