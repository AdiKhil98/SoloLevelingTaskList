import { INDEX, STORE } from '../config'
import type { Migration } from './index'

/**
 * Schema v3 (Phase 07): the Weekly Goal Crusher stores.
 *
 *  - `weeklyBoards`, keyed by `weekKey` (the Monday), so there is at most one
 *    board per week. Rows are rewritten only while `status` is `active`; the
 *    commands in `commands/` are the only writers and refuse a finalized board.
 *    `status` is indexed so the weeks due for finalization are found without a scan.
 *  - `weeklyRewardClaims`, keyed by `weekKey`: one insert-only claim per week,
 *    kept apart so a finalized board never has to change.
 *
 * Existing stores and rows are untouched. Both stores start empty, so a v2
 * database upgrades with every quest, completion, ledger row and daily summary intact.
 */
export const migrateToV3: Migration = (database) => {
  const boards = database.createObjectStore(STORE.weeklyBoards, { keyPath: 'weekKey' })
  boards.createIndex(INDEX.weeklyBoards.status, 'status')
  database.createObjectStore(STORE.weeklyRewardClaims, { keyPath: 'weekKey' })
}
