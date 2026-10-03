import type { PersistenceDatabase } from '@/persistence'
import type { Clock } from './clock'
import type { IdSource } from './ids'

/**
 * Everything a use case needs, passed explicitly. The owner of the runtime
 * (the React provider in production, a test in tests) opens the database
 * handle and chooses the clock and the id source; use cases never open
 * connections or read ambient time or randomness themselves.
 */
export interface ApplicationContext {
  readonly database: PersistenceDatabase
  readonly clock: Clock
  readonly ids: IdSource
}
