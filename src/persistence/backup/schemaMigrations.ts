import { BACKUP_SCHEMA_VERSION } from '../config'
import { assignPhase08SortOrder } from '../migrations/v4'

/** Upgrades the `data` of a backup from schema N-1 to N. Pure; may throw on malformed input. */
export type BackupDataMigration = (data: unknown) => unknown

/** Keyed by the schema version a migration produces. */
export type BackupDataMigrationMap = Readonly<Record<number, BackupDataMigration>>

/**
 * Backup data migrations, oldest first. When the data model changes, bump
 * `BACKUP_SCHEMA_VERSION` and register the `N-1 → N` upgrade here; old backups
 * then still import (DATA_MODEL §15).
 *
 *  - 2 (Phase 06): adds `dailySummaries`. A schema-1 backup predates day
 *    finalization, so it has none; the next reconciliation after restoring it
 *    finalizes its past days from its own occurrences and completions.
 *  - 3 (Phase 07): adds `weeklyBoards` and `weeklyRewardClaims`. Earlier backups
 *    predate the Weekly Goal Crusher, so they carry none; nothing is invented.
 *  - 4 (Phase 09): adds the required `sortOrder` to every quest template. Earlier
 *    backups have none, so it is assigned exactly as the database upgrade does
 *    (the version-frozen Phase 08 order: default quests first, then by creation).
 */
function asRecord(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Backup data must be an object')
  }
  return data as Record<string, unknown>
}

export const BACKUP_DATA_MIGRATIONS: BackupDataMigrationMap = {
  2: (data) => ({ ...asRecord(data), dailySummaries: [] }),
  3: (data) => ({ ...asRecord(data), weeklyBoards: [], weeklyRewardClaims: [] }),
  4: (data) => {
    const record = asRecord(data)
    // A malformed collection is left for the dataset validation to reject.
    return Array.isArray(record.questTemplates)
      ? { ...record, questTemplates: assignPhase08SortOrder(record.questTemplates) }
      : record
  },
}

export type BackupUpgrade =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly missingStep: number }

/**
 * Walks `data` from `from` up to `to`. Fails (without guessing) if a step is
 * missing. `from === to` returns the data untouched.
 */
export function upgradeBackupData(
  data: unknown,
  from: number,
  to: number = BACKUP_SCHEMA_VERSION,
  migrations: BackupDataMigrationMap = BACKUP_DATA_MIGRATIONS,
): BackupUpgrade {
  let current = data
  for (let version = from + 1; version <= to; version += 1) {
    const step = migrations[version]
    if (step === undefined) return { ok: false, missingStep: version }
    current = step(current)
  }
  return { ok: true, data: current }
}
