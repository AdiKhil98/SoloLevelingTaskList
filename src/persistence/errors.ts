export type PersistenceErrorCode =
  /** This environment has no IndexedDB. */
  | 'database_unavailable'
  | 'database_open_failed'
  /** Another connection refused to close, so an upgrade cannot proceed. */
  | 'database_blocked'
  /** The stored database is newer than this build understands. */
  | 'database_version_unsupported'
  /** The connection was closed (explicitly, by a newer tab, or abnormally). */
  | 'database_closed'
  | 'transaction_failed'
  /** A primary-key or unique-index constraint rejected a write. */
  | 'constraint_violation'
  | 'storage_quota_exceeded'
  | 'not_found'
  /** A record failed validation, on its way in or on its way out. */
  | 'record_validation_failed'
  /** Stored or restored records contradict each other (ledger, references). */
  | 'ledger_integrity_failed'
  /** Web Crypto is unavailable, so a backup checksum cannot be computed. */
  | 'checksum_unavailable'
  | 'invalid_backup'
  | 'unsupported_backup_version'
  | 'backup_checksum_mismatch'
  /** The restore transaction failed and was rolled back. */
  | 'import_failed'

/** One concrete problem found while validating data. `path` is dotted. */
export interface ValidationIssue {
  readonly path: string
  readonly code: string
  readonly message: string
}

/**
 * Every failure surfaced by the persistence layer. `cause` keeps the original
 * browser error for debugging; `issues` lists validation problems when there
 * are any. Presentation (wording, dialogs) belongs to the UI layer.
 */
export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode
  readonly issues: readonly ValidationIssue[]

  constructor(
    code: PersistenceErrorCode,
    message: string,
    options: { cause?: unknown; issues?: readonly ValidationIssue[] } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'PersistenceError'
    this.code = code
    this.issues = options.issues ?? []
  }
}

function nameOf(cause: unknown): string | null {
  if (typeof cause === 'object' && cause !== null && 'name' in cause) {
    const { name } = cause as { name: unknown }
    return typeof name === 'string' ? name : null
  }
  return null
}

function messageOf(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    const { message } = cause as { message: unknown }
    if (typeof message === 'string' && message !== '') return message
  }
  return 'unknown error'
}

/**
 * Maps a browser error (or anything thrown during a transaction) onto a
 * typed `PersistenceError`. Existing `PersistenceError`s pass through.
 */
export function toPersistenceError(cause: unknown, context: string): PersistenceError {
  if (cause instanceof PersistenceError) return cause
  const detail = `${context}: ${messageOf(cause)}`
  switch (nameOf(cause)) {
    case 'ConstraintError':
      return new PersistenceError('constraint_violation', detail, { cause })
    case 'QuotaExceededError':
      return new PersistenceError('storage_quota_exceeded', detail, { cause })
    case 'InvalidStateError':
      return new PersistenceError('database_closed', detail, { cause })
    default:
      return new PersistenceError('transaction_failed', detail, { cause })
  }
}
