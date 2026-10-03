import { INDEX, STORE } from '../config'
import type { Migration } from './index'

/**
 * Schema v1: the four stores Phase 03 needs. Everything else DATA_MODEL §14
 * lists (player, dailySummaries, weekly*, achievementUnlocks,
 * dailyMessageAssignments) is added by the phase that first writes it, through
 * a later migration.
 *
 * Index keyPaths that resolve to `null` (a quest without a `seedKey`, weekly
 * ledger rows without a `category`) are not valid IndexedDB keys, so such
 * rows are simply left out of that index. The `seedKey` unique index is
 * therefore sparse by construction.
 */
export const migrateToV1: Migration = (database) => {
  const templates = database.createObjectStore(STORE.templates, { keyPath: 'id' })
  templates.createIndex(INDEX.templates.status, 'status')
  templates.createIndex(INDEX.templates.seedKey, 'seedKey', { unique: true })

  const occurrences = database.createObjectStore(STORE.occurrences, { keyPath: 'id' })
  occurrences.createIndex(INDEX.occurrences.dateKey, 'dateKey')
  occurrences.createIndex(INDEX.occurrences.templateId, 'templateId')
  occurrences.createIndex(INDEX.occurrences.templateDate, ['templateId', 'dateKey'], {
    unique: true,
  })

  const completions = database.createObjectStore(STORE.completions, {
    keyPath: 'occurrenceId',
  })
  completions.createIndex(INDEX.completions.dateKey, 'dateKey')
  completions.createIndex(INDEX.completions.templateId, 'templateId')
  completions.createIndex(INDEX.completions.completedAt, 'completedAt')

  const xpTransactions = database.createObjectStore(STORE.xpTransactions, {
    keyPath: 'id',
  })
  xpTransactions.createIndex(INDEX.xpTransactions.seq, 'seq', { unique: true })
  xpTransactions.createIndex(INDEX.xpTransactions.idempotencyKey, 'idempotencyKey', {
    unique: true,
  })
  xpTransactions.createIndex(INDEX.xpTransactions.effectiveDate, 'effectiveDate')
  xpTransactions.createIndex(INDEX.xpTransactions.sourceWeekKey, 'sourceWeekKey')
  xpTransactions.createIndex(INDEX.xpTransactions.category, 'category')
  xpTransactions.createIndex(INDEX.xpTransactions.sourceType, 'source.type')
}
