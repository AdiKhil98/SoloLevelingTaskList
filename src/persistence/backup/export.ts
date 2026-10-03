import type { EpochMs } from '@/domain'
import { canonicalStringifyPretty } from '../canonical'
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, BACKUP_SCHEMA_VERSION } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { PersistenceError } from '../errors'
import { datasetFailure } from '../integrity/dataset'
import { readValidatedDataset } from '../integrity/verify'
import { computeBackupChecksum, type BackupEnvelope, type UnsignedBackupEnvelope } from './envelope'

export interface ExportBackupOptions {
  /** Supplied by the caller so exports are deterministic and testable. */
  readonly exportedAt: EpochMs
  /** IANA zone of the exporting device (audit only). */
  readonly exportedFromTimeZone: string
  readonly appVersion: string
}

/**
 * Builds a complete backup from one consistent read-only snapshot of the
 * database. The data is validated first: a database that fails integrity
 * checks is reported (`record_validation_failed` / `ledger_integrity_failed`
 * with issues) instead of producing a backup that could not be restored.
 */
export async function exportBackup(
  database: PersistenceDatabase,
  options: ExportBackupOptions,
): Promise<BackupEnvelope> {
  if (!Number.isSafeInteger(options.exportedAt) || options.exportedAt < 0) {
    throw new PersistenceError('record_validation_failed', 'exportedAt must be a non-negative safe integer')
  }
  if (options.exportedFromTimeZone.trim() === '' || options.appVersion.trim() === '') {
    throw new PersistenceError('record_validation_failed', 'exportedFromTimeZone and appVersion must not be empty')
  }

  const validated = await readValidatedDataset(database)
  if (!validated.ok) {
    throw datasetFailure(validated.error, 'The database failed integrity checks, so it cannot be exported')
  }

  const unsigned: UnsignedBackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: options.appVersion,
    exportedAt: options.exportedAt,
    exportedFromTimeZone: options.exportedFromTimeZone,
    data: validated.value.records,
  }
  return {
    ...unsigned,
    checksum: { algorithm: 'SHA-256', value: await computeBackupChecksum(unsigned) },
  }
}

/**
 * The backup file text: canonical key order, indented, so identical data always
 * serializes identically. (Import re-canonicalizes, so formatting never matters.)
 */
export function serializeBackup(envelope: BackupEnvelope): string {
  return canonicalStringifyPretty(envelope)
}
