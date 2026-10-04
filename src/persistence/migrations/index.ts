import { migrateToV1 } from './v1'
import { migrateToV2 } from './v2'
import { migrateToV3 } from './v3'
import { migrateToV4 } from './v4'
import { migrateToV5 } from './v5'

/**
 * What a migration may know about the upgrade it is part of. `originalFrom` is the
 * version the database had BEFORE the whole upgrade started, not the step before this
 * migration: a new database runs every migration in one upgrade, so its migration to
 * version 5 still sees `originalFrom === 0`, while an installed v4 database sees 4.
 */
export interface MigrationContext {
  readonly originalFrom: number
}

/** Receives the open database, the live version-change transaction and the upgrade's context. */
export type Migration = (database: IDBDatabase, transaction: IDBTransaction, context: MigrationContext) => void

/** Migration to schema version N, keyed by N. */
export type MigrationMap = Readonly<Record<number, Migration>>

/**
 * Production migrations. To change the schema: add `vN.ts`, register it here,
 * and raise `DATABASE_VERSION`. Migrations never delete progression data and
 * the database is never recreated.
 */
export const MIGRATIONS: MigrationMap = {
  1: migrateToV1,
  2: migrateToV2,
  3: migrateToV3,
  4: migrateToV4,
  5: migrateToV5,
}

/** Applies every migration in `(from, to]` in order; each one is told `originalFrom = from`. */
export function runMigrations(
  database: IDBDatabase,
  transaction: IDBTransaction,
  from: number,
  to: number,
  migrations: MigrationMap,
): void {
  const context: MigrationContext = { originalFrom: from }
  for (let version = from + 1; version <= to; version += 1) {
    const migration = migrations[version]
    if (migration === undefined) {
      throw new Error(`No migration registered for database version ${version}`)
    }
    migration(database, transaction, context)
  }
}
