import { renumberInOrder, type DateKey, type EpochMs, type QuestTemplate } from '@/domain'
import { INDEX, STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { PersistenceError } from '../errors'
import { parseTemplate } from '../records/template'
import { parseForWrite, parseStored } from './stored'

/**
 * Low-level template storage. Product behavior for editing and deleting
 * quests (including same-day semantics, OD-16) belongs to Phase 05; these are
 * safe primitives only. Templates are never hard-deleted: history refers to
 * them, so removal is `archiveTemplate`.
 */

/**
 * Stores a template exactly as given, including its `sortOrder`. Fails with
 * `constraint_violation` on a duplicate id or `seedKey`. It does NOT check that
 * the `sortOrder` is unused: new quests go through `appendTemplate`, which picks
 * a free one atomically. This is the explicit-placement primitive.
 */
export async function createTemplate(database: PersistenceDatabase, template: QuestTemplate): Promise<QuestTemplate> {
  const valid = parseForWrite(parseTemplate, template, 'quest template')
  await runTransaction(database, [STORE.templates], 'readwrite', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.templates).add(valid)),
  )
  return valid
}

/**
 * Stores a new template at the END of the manual order: its `sortOrder` is one
 * more than the largest stored value (0 for the first template), chosen in the
 * same transaction that inserts it, so two tabs can never pick the same one.
 *
 * If the largest stored value is already the largest safe integer (only possible
 * from foreign data), the whole sequence is first renumbered 0…n-1 in its
 * current order, in that same transaction, so the new value can never overflow.
 */
export async function appendTemplate(
  database: PersistenceDatabase,
  template: Omit<QuestTemplate, 'sortOrder'>,
): Promise<QuestTemplate> {
  parseForWrite(parseTemplate, { ...template, sortOrder: 0 }, 'quest template')
  return runTransaction(database, [STORE.templates], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(STORE.templates)
    const stored = (await requestToPromise(store.getAll())).map((value, index) =>
      parseStored(parseTemplate, value, `quest template [${index}]`),
    )
    let sortOrder = stored.reduce((next, row) => Math.max(next, row.sortOrder + 1), 0)
    if (sortOrder > Number.MAX_SAFE_INTEGER) {
      const renumbered = renumberInOrder(stored)
      for (const row of stored) {
        const value = renumbered.get(row.id)
        if (value !== undefined) await requestToPromise(store.put({ ...row, sortOrder: value }))
      }
      sortOrder = stored.length
    }
    const valid = parseForWrite(parseTemplate, { ...template, sortOrder }, 'quest template')
    await requestToPromise(store.add(valid))
    return valid
  })
}

/**
 * Replaces an existing template. Fails with `not_found` if it does not exist
 * and with `record_validation_failed` if `revision` would move backwards.
 * Occurrences, completions and the ledger are never touched.
 *
 * The stored `sortOrder` always wins: it is read in this same transaction and
 * written back whatever `template.sortOrder` says, so an edit made from a stale
 * form (or any other stale copy) can neither move a quest nor undo a reorder
 * another tab made in between. Only `reorderTemplates` changes the order.
 */
export async function updateTemplate(database: PersistenceDatabase, template: QuestTemplate): Promise<QuestTemplate> {
  const valid = parseForWrite(parseTemplate, template, 'quest template')
  let saved = valid
  await runTransaction(database, [STORE.templates], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(STORE.templates)
    const existing = await requestToPromise(store.get(valid.id))
    if (existing === undefined) {
      throw new PersistenceError('not_found', `Quest template "${valid.id}" does not exist`)
    }
    const current = parseStored(parseTemplate, existing, `quest template "${valid.id}"`)
    if (valid.revision < current.revision) {
      throw new PersistenceError(
        'record_validation_failed',
        `Template revision cannot move backwards (${current.revision} → ${valid.revision})`,
      )
    }
    saved = { ...valid, sortOrder: current.sortOrder }
    await requestToPromise(store.put(saved))
  })
  return saved
}

export interface ArchiveTemplateOptions {
  /** Last date (inclusive) the template may still be eligible. The caller decides it. */
  readonly activeUntil: DateKey
  readonly updatedAt: EpochMs
}

/**
 * Soft-removes a template: `status = 'archived'` and an explicit `activeUntil`.
 * The revision is left alone and history is untouched. Idempotent.
 */
export async function archiveTemplate(
  database: PersistenceDatabase,
  templateId: string,
  options: ArchiveTemplateOptions,
): Promise<QuestTemplate> {
  return runTransaction(database, [STORE.templates], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(STORE.templates)
    const existing = await requestToPromise(store.get(templateId))
    if (existing === undefined) {
      throw new PersistenceError('not_found', `Quest template "${templateId}" does not exist`)
    }
    const current = parseStored(parseTemplate, existing, `quest template "${templateId}"`)
    const archived = parseForWrite(
      parseTemplate,
      { ...current, status: 'archived', activeUntil: options.activeUntil, updatedAt: options.updatedAt },
      'archived quest template',
    )
    await requestToPromise(store.put(archived))
    return archived
  })
}

export async function getTemplate(database: PersistenceDatabase, templateId: string): Promise<QuestTemplate | null> {
  const raw = await runTransaction(database, [STORE.templates], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.templates).get(templateId)),
  )
  return raw === undefined ? null : parseStored(parseTemplate, raw, `quest template "${templateId}"`)
}

/** The template created from a given seed key (for idempotent seeding), or null. */
export async function getTemplateBySeedKey(database: PersistenceDatabase, seedKey: string): Promise<QuestTemplate | null> {
  const raw = await runTransaction(database, [STORE.templates], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.templates).index(INDEX.templates.seedKey).get(seedKey)),
  )
  return raw === undefined ? null : parseStored(parseTemplate, raw, `quest template with seed key "${seedKey}"`)
}

/** All templates ordered by id, optionally only one status. */
export async function listTemplates(
  database: PersistenceDatabase,
  filter: { readonly status?: QuestTemplate['status'] } = {},
): Promise<readonly QuestTemplate[]> {
  const raw = await runTransaction(database, [STORE.templates], 'readonly', (transaction) => {
    const store = transaction.objectStore(STORE.templates)
    return requestToPromise(
      filter.status === undefined
        ? store.getAll()
        : store.index(INDEX.templates.status).getAll(filter.status),
    )
  })
  return raw.map((value, index) => parseStored(parseTemplate, value, `quest template [${index}]`))
}
