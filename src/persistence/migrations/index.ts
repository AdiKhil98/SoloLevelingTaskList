import { migrateToV1 } from './v1'

/** Receives the open database and the live version-change transaction. */
export type Migration = (database: IDBDatabase, transaction: IDBTransaction) => void

/** Migration to schema version N, keyed by N. */
export type MigrationMap = Readonly<Record<number, Migration>>

/**
 * Production migrations. To change the schema: add `vN.ts`, register it here,
 * and raise `DATABASE_VERSION`. Migrations never delete progression data and
 * the database is never recreated.
 */
export const MIGRATIONS: MigrationMap = {
  1: migrateToV1,
}

/** Applies every migration in `(from, to]` in order. */
export function runMigrations(
  database: IDBDatabase,
  transaction: IDBTransaction,
  from: number,
  to: number,
  migrations: MigrationMap,
): void {
  for (let version = from + 1; version <= to; version += 1) {
    const migration = migrations[version]
    if (migration === undefined) {
      throw new Error(`No migration registered for database version ${version}`)
    }
    migration(database, transaction)
  }
}
