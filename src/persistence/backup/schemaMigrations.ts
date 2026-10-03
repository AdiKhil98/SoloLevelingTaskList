import { BACKUP_SCHEMA_VERSION } from '../config'

/** Upgrades the `data` of a backup from schema N-1 to N. Pure; may throw on malformed input. */
export type BackupDataMigration = (data: unknown) => unknown

/** Keyed by the schema version a migration produces. */
export type BackupDataMigrationMap = Readonly<Record<number, BackupDataMigration>>

/**
 * Backup data migrations, oldest first. Schema 1 is the first and only schema
 * so far, so the registry is empty: there is nothing older to upgrade from.
 * When the data model changes, bump `BACKUP_SCHEMA_VERSION` and register the
 * `N-1 → N` upgrade here; old backups then still import (DATA_MODEL §15).
 */
export const BACKUP_DATA_MIGRATIONS: BackupDataMigrationMap = {}

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
