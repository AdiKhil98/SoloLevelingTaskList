import type { DateKey, EpochMs, QuestTemplate } from '@/domain'
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

/** Stores a new template. Fails with `constraint_violation` on a duplicate id or `seedKey`. */
export async function createTemplate(database: PersistenceDatabase, template: QuestTemplate): Promise<QuestTemplate> {
  const valid = parseForWrite(parseTemplate, template, 'quest template')
  await runTransaction(database, [STORE.templates], 'readwrite', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.templates).add(valid)),
  )
  return valid
}

/**
 * Replaces an existing template. Fails with `not_found` if it does not exist
 * and with `record_validation_failed` if `revision` would move backwards.
 * Occurrences, completions and the ledger are never touched.
 */
export async function updateTemplate(database: PersistenceDatabase, template: QuestTemplate): Promise<QuestTemplate> {
  const valid = parseForWrite(parseTemplate, template, 'quest template')
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
    await requestToPromise(store.put(valid))
  })
  return valid
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
