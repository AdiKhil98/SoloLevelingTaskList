import { err, ok, type Result } from '@/domain'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_CHARS,
  STORE,
} from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { allRequests, runTransaction } from '../database/transaction'
import { PersistenceError, type PersistenceErrorCode, type ValidationIssue } from '../errors'
import { validateDataset } from '../integrity/dataset'
import { summarizeRecords, type IntegrityReport } from '../integrity/verify'
import { progressionFromLedger, readLedgerState } from '../ledger/ledgerTip'
import { IssueCollector, isPlainObject, readObject, readSafeInteger, readString } from '../records/readers'
import { computeBackupChecksum, type BackupEnvelope } from './envelope'
import { BACKUP_DATA_MIGRATIONS, upgradeBackupData, type BackupDataMigrationMap } from './schemaMigrations'

export type BackupRejectionCode = Extract<
  PersistenceErrorCode,
  'invalid_backup' | 'unsupported_backup_version' | 'backup_checksum_mismatch'
>

/**
 * Why a backup was refused. Returned (not thrown): a bad file is an expected
 * outcome. Nothing was written when a backup is rejected.
 */
export interface BackupRejection {
  readonly code: BackupRejectionCode
  readonly message: string
  readonly issues: readonly ValidationIssue[]
}

export interface ParseBackupOptions {
  /** Test seam: backup data upgrades from older schema versions. */
  readonly migrations?: BackupDataMigrationMap
  /** Test seam: the schema version this build understands. */
  readonly currentSchemaVersion?: number
}

/** A backup that passed every check, ready to be restored. */
export interface ParsedBackup {
  readonly envelope: BackupEnvelope
  readonly report: IntegrityReport
}

const ENVELOPE_FIELDS = [
  'format',
  'formatVersion',
  'schemaVersion',
  'appVersion',
  'exportedAt',
  'exportedFromTimeZone',
  'checksum',
  'data',
] as const

const SHA256_HEX = /^[0-9a-f]{64}$/

function reject(
  code: BackupRejectionCode,
  message: string,
  issues: readonly ValidationIssue[] = [],
): Result<never, BackupRejection> {
  return err({ code, message, issues })
}

function singleIssue(path: string, code: string, message: string): readonly ValidationIssue[] {
  return [{ path, code, message }]
}

/**
 * Checks a backup file without touching the database. Order matters:
 * size → JSON → format → versions → exact envelope shape → checksum →
 * schema upgrade → full dataset validation. The first failure wins.
 */
export async function parseBackup(
  text: string,
  options: ParseBackupOptions = {},
): Promise<Result<ParsedBackup, BackupRejection>> {
  const currentSchemaVersion = options.currentSchemaVersion ?? BACKUP_SCHEMA_VERSION
  try {
    return await checkBackup(text, options.migrations ?? BACKUP_DATA_MIGRATIONS, currentSchemaVersion)
  } catch (error) {
    // Typed persistence errors (e.g. checksum_unavailable) are real failures, not bad files.
    if (error instanceof PersistenceError) throw error
    return reject('invalid_backup', 'The backup could not be read', singleIssue('', 'unreadable', String(error)))
  }
}

async function checkBackup(
  text: string,
  migrations: BackupDataMigrationMap,
  currentSchemaVersion: number,
): Promise<Result<ParsedBackup, BackupRejection>> {
  if (typeof text !== 'string' || text.length === 0) {
    return reject('invalid_backup', 'The backup is empty', singleIssue('', 'empty', 'No content'))
  }
  if (text.length > MAX_BACKUP_CHARS) {
    return reject('invalid_backup', 'The backup is too large', singleIssue('', 'too_large', `More than ${MAX_BACKUP_CHARS} characters`))
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return reject('invalid_backup', 'The backup is not valid JSON', singleIssue('', 'not_json', String(error)))
  }
  if (!isPlainObject(parsed)) {
    return reject('invalid_backup', 'The backup is not a JSON object', singleIssue('', 'not_an_object', 'Expected an object'))
  }

  if (parsed.format !== BACKUP_FORMAT) {
    return reject('invalid_backup', 'This is not a SoloLevelingTaskList backup', singleIssue('format', 'unknown_format', `Expected "${BACKUP_FORMAT}"`))
  }

  // Versions first: a newer file may legitimately have a different shape.
  const versions = new IssueCollector()
  const formatVersion = readSafeInteger(versions, parsed, 'formatVersion', '', { min: 1 })
  const schemaVersion = readSafeInteger(versions, parsed, 'schemaVersion', '', { min: 1 })
  if (formatVersion === undefined || schemaVersion === undefined) {
    return reject('invalid_backup', 'The backup has no valid version numbers', versions.issues)
  }
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    return reject(
      'unsupported_backup_version',
      `This backup uses file format ${formatVersion}; this version of the app understands up to ${BACKUP_FORMAT_VERSION}`,
      singleIssue('formatVersion', 'newer_format', `Found ${formatVersion}`),
    )
  }
  if (schemaVersion > currentSchemaVersion) {
    return reject(
      'unsupported_backup_version',
      `This backup was made by a newer version of the app (data version ${schemaVersion}; this app understands up to ${currentSchemaVersion})`,
      singleIssue('schemaVersion', 'newer_schema', `Found ${schemaVersion}`),
    )
  }

  const shape = new IssueCollector()
  const source = readObject(shape, parsed, '', ENVELOPE_FIELDS)
  if (source === undefined) return reject('invalid_backup', 'The backup is malformed', shape.issues)
  const appVersion = readString(shape, source, 'appVersion', '')
  const exportedAt = readSafeInteger(shape, source, 'exportedAt', '')
  const exportedFromTimeZone = readString(shape, source, 'exportedFromTimeZone', '')
  const checksumSource = readObject(shape, source.checksum, 'checksum', ['algorithm', 'value'])
  let checksumValue: string | undefined
  if (checksumSource !== undefined) {
    if (checksumSource.algorithm !== 'SHA-256') {
      shape.add('checksum.algorithm', 'invalid_value', 'Expected "SHA-256"')
    }
    checksumValue = readString(shape, checksumSource, 'value', 'checksum')
    if (checksumValue !== undefined && !SHA256_HEX.test(checksumValue)) {
      shape.add('checksum.value', 'invalid_value', 'Expected 64 lowercase hex characters')
    }
  }
  if (!shape.isClean || appVersion === undefined || exportedAt === undefined || exportedFromTimeZone === undefined || checksumValue === undefined) {
    return reject('invalid_backup', 'The backup is malformed', shape.issues)
  }

  const expectedChecksum = await computeBackupChecksum(parsed)
  if (expectedChecksum !== checksumValue) {
    return reject(
      'backup_checksum_mismatch',
      'The backup file is damaged or incomplete (checksum mismatch)',
      singleIssue('checksum.value', 'checksum_mismatch', 'The contents do not match the stored checksum'),
    )
  }

  const upgraded = upgradeBackupData(source.data, schemaVersion, currentSchemaVersion, migrations)
  if (!upgraded.ok) {
    return reject(
      'unsupported_backup_version',
      `No upgrade path exists from backup data version ${schemaVersion} (step ${upgraded.missingStep} is missing)`,
      singleIssue('schemaVersion', 'no_upgrade_path', `Missing step ${upgraded.missingStep}`),
    )
  }

  const dataset = validateDataset(upgraded.data, 'data')
  if (!dataset.ok) {
    return reject('invalid_backup', 'The backup contains invalid or inconsistent records', dataset.error)
  }

  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion,
    schemaVersion: currentSchemaVersion,
    appVersion,
    exportedAt,
    exportedFromTimeZone,
    checksum: { algorithm: 'SHA-256', value: checksumValue },
    data: dataset.value.records,
  }
  return ok({
    envelope,
    report: {
      counts: summarizeRecords(dataset.value.records),
      progression: progressionFromLedger(dataset.value.ledger),
    },
  })
}

/**
 * Restores a backup, REPLACING all current data (never merging).
 *
 * The file is fully parsed and validated first; only then does one read-write
 * transaction over every store clear and refill them, and read the result back
 * (counts and ledger tip) before committing. If anything fails the transaction
 * aborts and the previous data is exactly as it was.
 *
 * Returns the rejection for a bad file (nothing written), throws a
 * `PersistenceError` (`import_failed`, `storage_quota_exceeded`,
 * `database_closed`, …) if the restore itself fails (also nothing changed).
 *
 * The application should export a safety backup of the current data before
 * calling this, and ask the user to confirm the replacement (DATA_MODEL §15).
 */
export async function importBackup(
  database: PersistenceDatabase,
  text: string,
  options: ParseBackupOptions = {},
): Promise<Result<IntegrityReport, BackupRejection>> {
  const parsed = await parseBackup(text, options)
  if (!parsed.ok) return parsed

  const { data } = parsed.value.envelope
  const expected = parsed.value.report

  try {
    await runTransaction(
      database,
      [
        STORE.templates,
        STORE.occurrences,
        STORE.completions,
        STORE.xpTransactions,
        STORE.dailySummaries,
        STORE.weeklyBoards,
        STORE.weeklyRewardClaims,
      ],
      'readwrite',
      async (transaction) => {
        const templates = transaction.objectStore(STORE.templates)
        const occurrences = transaction.objectStore(STORE.occurrences)
        const completions = transaction.objectStore(STORE.completions)
        const ledger = transaction.objectStore(STORE.xpTransactions)
        const summaries = transaction.objectStore(STORE.dailySummaries)
        const boards = transaction.objectStore(STORE.weeklyBoards)
        const claims = transaction.objectStore(STORE.weeklyRewardClaims)

        const stores = [templates, occurrences, completions, ledger, summaries, boards, claims]
        await allRequests(stores.map((store) => () => store.clear()))
        await allRequests([
          ...data.questTemplates.map((record) => () => templates.add(record)),
          ...data.questOccurrences.map((record) => () => occurrences.add(record)),
          ...data.questCompletions.map((record) => () => completions.add(record)),
          ...data.xpTransactions.map((record) => () => ledger.add(record)),
          ...data.dailySummaries.map((record) => () => summaries.add(record)),
          ...data.weeklyBoards.map((record) => () => boards.add(record)),
          ...data.weeklyRewardClaims.map((record) => () => claims.add(record)),
        ])

        // Read back before commit: a mismatch aborts and rolls everything back.
        const counts = await allRequests(stores.map((store) => () => store.count()))
        const wanted = [
          expected.counts.questTemplates,
          expected.counts.questOccurrences,
          expected.counts.questCompletions,
          expected.counts.xpTransactions,
          expected.counts.dailySummaries,
          expected.counts.weeklyBoards,
          expected.counts.weeklyRewardClaims,
        ]
        if (counts.some((count, index) => count !== wanted[index])) {
          throw new PersistenceError('ledger_integrity_failed', 'Restored record counts do not match the backup')
        }
        const tip = await readLedgerState(transaction)
        if (tip.lastSeq !== expected.progression.lastSeq || tip.totalExp !== expected.progression.totalExp) {
          throw new PersistenceError('ledger_integrity_failed', 'The restored ledger does not match the backup')
        }
      },
    )
  } catch (error) {
    if (error instanceof PersistenceError && (error.code === 'storage_quota_exceeded' || error.code === 'database_closed')) {
      throw error
    }
    throw new PersistenceError('import_failed', 'Restoring the backup failed; your existing data was not changed', { cause: error })
  }
  return ok(expected)
}
