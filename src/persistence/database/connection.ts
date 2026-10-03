import { DATABASE_NAME, DATABASE_VERSION, type StoreName } from '../config'
import { PersistenceError, toPersistenceError } from '../errors'
import { MIGRATIONS, runMigrations, type MigrationMap } from '../migrations'

/**
 * One open IndexedDB connection.
 *
 * Connection strategy: the application opens exactly one handle at startup
 * and passes it to every persistence function; there is no module-level
 * singleton. When another tab requests a schema upgrade (`versionchange`) the
 * handle closes its connection so the upgrade is never blocked by an old tab,
 * and every later call fails with a typed `database_closed` error so the
 * application can reopen or reload.
 */
export class PersistenceDatabase {
  readonly name: string
  readonly version: number
  #connection: IDBDatabase | null
  #closedReason: string | null = null

  constructor(connection: IDBDatabase) {
    this.name = connection.name
    this.version = connection.version
    this.#connection = connection
    connection.onversionchange = () => {
      this.#shutdown('closed because another tab or window is upgrading the database')
    }
    connection.onclose = () => {
      this.#shutdown('closed unexpectedly by the browser')
    }
  }

  get isOpen(): boolean {
    return this.#connection !== null
  }

  /** Closes the connection. Safe to call more than once. */
  close(): void {
    this.#shutdown('closed by the application')
  }

  /** @internal Opens a transaction; used by repositories and commands only. */
  openTransaction(stores: readonly StoreName[], mode: IDBTransactionMode): IDBTransaction {
    const connection = this.#connection
    if (connection === null) {
      throw new PersistenceError(
        'database_closed',
        `Database "${this.name}" is not open (${this.#closedReason ?? 'closed'})`,
      )
    }
    try {
      return connection.transaction([...stores], mode)
    } catch (error) {
      throw toPersistenceError(error, 'Could not start a transaction')
    }
  }

  #shutdown(reason: string): void {
    const connection = this.#connection
    if (connection === null) return
    this.#connection = null
    this.#closedReason = reason
    try {
      connection.close()
    } catch {
      // Closing an already-closed connection is harmless.
    }
  }
}

export interface OpenDatabaseOptions {
  /** Database name. Defaults to the production name. */
  readonly name?: string
  /** IndexedDB implementation. Defaults to the browser's `indexedDB`. */
  readonly factory?: IDBFactory
}

interface VersionedOpenOptions {
  readonly name: string
  readonly factory: IDBFactory | undefined
  readonly version: number
  readonly migrations: MigrationMap
}

/**
 * Opens (creating and upgrading as needed) the application database.
 *
 * Rejects with a typed `PersistenceError`:
 * `database_unavailable`, `database_blocked`, `database_version_unsupported`
 * (the stored database is newer than this build) or `database_open_failed`.
 */
export function openDatabase(options: OpenDatabaseOptions = {}): Promise<PersistenceDatabase> {
  return openVersionedDatabase({
    name: options.name ?? DATABASE_NAME,
    factory: options.factory ?? globalThis.indexedDB,
    version: DATABASE_VERSION,
    migrations: MIGRATIONS,
  })
}

/** @internal Exposed so tests can drive the upgrade machinery. */
export function openVersionedDatabase(options: VersionedOpenOptions): Promise<PersistenceDatabase> {
  const { name, factory, version, migrations } = options
  if (factory === undefined) {
    return Promise.reject(
      new PersistenceError('database_unavailable', 'IndexedDB is not available in this environment'),
    )
  }

  return new Promise<PersistenceDatabase>((resolve, reject) => {
    // Once settled (resolved, or rejected because the open is blocked) a late
    // upgrade is aborted and a late connection is closed, so an abandoned
    // open request can never change the database or leak a connection.
    let settled = false
    let upgradeFailure: unknown = null

    let request: IDBOpenDBRequest
    try {
      request = factory.open(name, version)
    } catch (error) {
      reject(new PersistenceError('database_open_failed', `Could not open "${name}"`, { cause: error }))
      return
    }

    request.onupgradeneeded = (event) => {
      const transaction = request.transaction
      if (transaction === null) return
      if (settled) {
        transaction.abort()
        return
      }
      try {
        runMigrations(request.result, transaction, event.oldVersion, event.newVersion ?? version, migrations)
      } catch (error) {
        upgradeFailure = error
        transaction.abort()
      }
    }

    request.onsuccess = () => {
      const connection = request.result
      if (settled) {
        connection.close()
        return
      }
      settled = true
      resolve(new PersistenceDatabase(connection))
    }

    request.onblocked = () => {
      if (settled) return
      settled = true
      reject(
        new PersistenceError(
          'database_blocked',
          `Upgrading "${name}" is blocked by another open connection; close other tabs and retry`,
        ),
      )
    }

    request.onerror = () => {
      if (settled) return
      settled = true
      const cause = upgradeFailure ?? request.error
      if (upgradeFailure === null && (request.error as { name?: unknown } | null)?.name === 'VersionError') {
        reject(
          new PersistenceError(
            'database_version_unsupported',
            `Database "${name}" was written by a newer version of the app`,
            { cause },
          ),
        )
        return
      }
      reject(new PersistenceError('database_open_failed', `Could not open "${name}"`, { cause }))
    }
  })
}
