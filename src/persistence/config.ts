/**
 * Persistence constants. The names below are a storage contract: changing a
 * store or index name requires a schema migration (see docs/PERSISTENCE.md).
 */

export const DATABASE_NAME = 'solo-leveling-task-list'

/** IndexedDB schema version. Raised only together with a new migration. */
export const DATABASE_VERSION = 5

export const STORE = {
  templates: 'questTemplates',
  occurrences: 'questOccurrences',
  completions: 'questCompletions',
  xpTransactions: 'xpTransactions',
  /** Added by schema v2 (Phase 06). */
  dailySummaries: 'dailySummaries',
  /** Added by schema v3 (Phase 07): one board per week; mutable only while active. */
  weeklyBoards: 'weeklyBoards',
  /** Added by schema v3 (Phase 07): one insert-only claim per finalized week. */
  weeklyRewardClaims: 'weeklyRewardClaims',
  /** Added by schema v5 (Phase 11): the one player profile row (name and Awakening state). */
  playerProfile: 'playerProfile',
} as const

/** The key of the single row in `playerProfile`. */
export const PLAYER_PROFILE_ID = 'player'

export type StoreName = (typeof STORE)[keyof typeof STORE]

/** Index names, grouped by store. Each is documented in docs/PERSISTENCE.md. */
export const INDEX = {
  templates: {
    status: 'status',
    seedKey: 'seedKey',
  },
  occurrences: {
    dateKey: 'dateKey',
    templateId: 'templateId',
    templateDate: 'templateDate',
  },
  completions: {
    dateKey: 'dateKey',
    templateId: 'templateId',
    completedAt: 'completedAt',
  },
  xpTransactions: {
    seq: 'seq',
    idempotencyKey: 'idempotencyKey',
    effectiveDate: 'effectiveDate',
    sourceWeekKey: 'sourceWeekKey',
    category: 'category',
    sourceType: 'sourceType',
  },
  dailySummaries: {
    quality: 'quality',
  },
  weeklyBoards: {
    status: 'status',
  },
} as const

export const BACKUP_FORMAT = 'solo-leveling-task-list-backup'

/** Version of the envelope structure itself. */
export const BACKUP_FORMAT_VERSION = 1

/**
 * Version of the data model carried in `data`. Independent of
 * `DATABASE_VERSION`: both start at 1 but need not stay equal.
 */
export const BACKUP_SCHEMA_VERSION = 5

/** Backups larger than this (in UTF-16 code units) are rejected unparsed. */
export const MAX_BACKUP_CHARS = 32 * 1024 * 1024
