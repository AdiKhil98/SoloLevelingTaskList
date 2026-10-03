import { INDEX, STORE } from '../config'
import type { Migration } from './index'

/**
 * Schema v2 (Phase 06): the `dailySummaries` store, one immutable row per
 * finalized calendar date, keyed by its `dateKey`.
 *
 * Only `quality` is indexed (it counts Perfect Days). DATA_MODEL listed an
 * `isPerfect` index too, but a boolean is not a valid IndexedDB key, so that
 * index could never hold a row; `quality = 'perfect'` is equivalent.
 *
 * Existing stores and rows are untouched. The store starts empty: the first
 * reconciliation after the upgrade finalizes the days that already have
 * occurrences.
 */
export const migrateToV2: Migration = (database) => {
  const summaries = database.createObjectStore(STORE.dailySummaries, { keyPath: 'dateKey' })
  summaries.createIndex(INDEX.dailySummaries.quality, 'quality')
}
