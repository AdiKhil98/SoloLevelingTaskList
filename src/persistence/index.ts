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
  appendTemplate,
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
  getDailySummary,
  getLatestDailySummary,
  listDailySummaries,
  readDailyChainTip,
  readFinalizationCursor,
  type DailyChainTip,
} from './repositories/dailySummaries'
export {
  getXpTransaction,
  getXpTransactionByIdempotencyKey,
  listXpTransactions,
  listXpTransactionsByEffectiveDate,
} from './repositories/xpLedger'
export {
  countCompletionsByTemplate,
  getWeeklyBoard,
  getWeeklyRewardClaim,
  listDueWeeklyBoardKeys,
  listWeeklyBoards,
  listWeeklyRewardClaims,
} from './repositories/weeklyBoards'

// Commands
export {
  completeQuestAtomically,
  type AtomicCompletionRejection,
  type AtomicCompletionResult,
  type CompleteQuestAtomicallyInput,
} from './commands/completeQuest'

export {
  reorderTemplates,
  type ReorderTemplatesInput,
  type ReorderTemplatesRejection,
  type ReorderTemplatesResult,
} from './commands/reorderTemplates'

export {
  finalizeDayAtomically,
  type FinalizeDayInput,
  type FinalizeDayRejection,
  type FinalizeDayResult,
} from './commands/finalizeDay'

export {
  saveWeeklyBoardAtomically,
  type SaveWeeklyBoardInput,
  type SaveWeeklyBoardRejection,
  type SaveWeeklyBoardResult,
} from './commands/saveWeeklyBoard'
export {
  setWeeklyGoalProgressAtomically,
  type SetWeeklyGoalProgressInput,
  type SetWeeklyGoalProgressRejection,
  type SetWeeklyGoalProgressResult,
} from './commands/setWeeklyGoalProgress'
export {
  finalizeWeekAtomically,
  type FinalizeWeekInput,
  type FinalizeWeekRejection,
  type FinalizeWeekResult,
} from './commands/finalizeWeek'
export {
  claimWeeklyRewardAtomically,
  type ClaimWeeklyRewardInput,
  type ClaimWeeklyRewardRejection,
  type ClaimWeeklyRewardResult,
} from './commands/claimWeeklyReward'

// Ledger and progression
export { validateLedger, type LedgerSummary } from './ledger/validateLedger'
export { readProgression, reconstructProgression, type PlayerProgression } from './ledger/ledgerTip'

// Record validation (untrusted value → typed record)
export { parseCompletion } from './records/completion'
export { parseDailySummary } from './records/dailySummary'
export { parseOccurrence } from './records/occurrence'
export { parseTemplate } from './records/template'
export { parseWeeklyBoard, parseWeeklyRewardClaim } from './records/weeklyBoard'
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
