import type { EpochMs } from '@/domain'
import { canonicalStringify } from '../canonical'
import { BACKUP_FORMAT } from '../config'
import { PersistenceError } from '../errors'
import type { DatasetRecords } from '../integrity/dataset'

export interface BackupChecksum {
  readonly algorithm: 'SHA-256'
  /** Lowercase hex digest. */
  readonly value: string
}

/**
 * The portable backup file (DATA_MODEL §15). `data` holds every durable
 * collection; derived values (total EXP, level, rank) are deliberately absent
 * and are rebuilt from the ledger on import.
 */
export interface BackupEnvelope {
  readonly format: typeof BACKUP_FORMAT
  /** Version of this envelope structure. */
  readonly formatVersion: number
  /** Version of the data model in `data`. Independent of the IndexedDB version. */
  readonly schemaVersion: number
  readonly appVersion: string
  readonly exportedAt: EpochMs
  readonly exportedFromTimeZone: string
  readonly checksum: BackupChecksum
  readonly data: DatasetRecords
}

export type UnsignedBackupEnvelope = Omit<BackupEnvelope, 'checksum'>

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) {
    throw new PersistenceError('checksum_unavailable', 'Web Crypto (SHA-256) is not available in this environment')
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * The checksum covers the canonical JSON of the whole envelope EXCLUDING the
 * `checksum` field itself. It detects accidental corruption and truncation
 * only; it is not a signature and offers no protection against deliberate edits.
 */
export function computeBackupChecksum(envelope: object): Promise<string> {
  const { checksum: _excluded, ...rest } = envelope as { checksum?: unknown }
  void _excluded
  return sha256Hex(canonicalStringify(rest))
}
