/**
 * Public API of the persistence layer (Phase 03). Consumers import from here,
 * not from internal modules. Native IndexedDB only; no React; the domain layer
 * knows nothing about this package.
 */

// Configuration
export { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, BACKUP_SCHEMA_VERSION, DATABASE_NAME, DATABASE_VERSION } from './config'

// Errors
export { PersistenceError, type PersistenceErrorCode, type ValidationIssue } from './errors'

// Connection
export { openDatabase, PersistenceDatabase, type OpenDatabaseOptions } from './database/connection'

// Repositories
export {
  archiveTemplate,
  createTemplate,
  getTemplate,
  getTemplateBySeedKey,
  listTemplates,
  updateTemplate,
  type ArchiveTemplateOptions,
} from './repositories/templates'
export {
  ensureOccurrence,
  getOccurrence,
  getOccurrenceFor,
  insertOccurrence,
  listOccurrencesByDate,
  listOccurrencesByTemplate,
  type StoredOccurrence,
} from './repositories/occurrences'
export { getCompletion, listCompletionsByDate, listCompletionsByTemplate } from './repositories/completions'
export {
  getXpTransaction,
  getXpTransactionByIdempotencyKey,
  listXpTransactions,
  listXpTransactionsByEffectiveDate,
} from './repositories/xpLedger'

// Commands
export {
  completeQuestAtomically,
  type AtomicCompletionRejection,
  type AtomicCompletionResult,
  type CompleteQuestAtomicallyInput,
} from './commands/completeQuest'

// Ledger and progression
export { validateLedger, type LedgerSummary } from './ledger/validateLedger'
export { readProgression, reconstructProgression, type PlayerProgression } from './ledger/ledgerTip'

// Record validation (untrusted value → typed record)
export { parseCompletion } from './records/completion'
export { parseOccurrence } from './records/occurrence'
export { parseTemplate } from './records/template'
export { parseXpTransaction } from './records/xpTransaction'

// Integrity
export { verifyDatabaseIntegrity, type IntegrityReport } from './integrity/verify'

// Backup
export type { BackupChecksum, BackupEnvelope } from './backup/envelope'
export { exportBackup, serializeBackup, type ExportBackupOptions } from './backup/export'
export {
  importBackup,
  parseBackup,
  type BackupRejection,
  type BackupRejectionCode,
  type ParsedBackup,
} from './backup/import'
