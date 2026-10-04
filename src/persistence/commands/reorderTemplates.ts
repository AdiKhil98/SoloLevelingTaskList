import { hasUniqueSortOrders, renumberInOrder, sortTemplatesByOrder, type QuestTemplate } from '@/domain'
import { STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { parseTemplate } from '../records/template'
import { parseStored } from '../repositories/stored'

export interface ReorderTemplatesInput {
  /**
   * The ids of the ACTIVE templates in the order the caller last saw them. The
   * write is applied only if this is exactly the stored order (see `stale_order`).
   */
  readonly expectedOrder: readonly string[]
  /** The same ids in the order the player chose. Must be a permutation of `expectedOrder`. */
  readonly newOrder: readonly string[]
}

export type ReorderTemplatesRejection =
  /**
   * The stored active order is not what the caller saw: a quest was added,
   * archived or restored, or another tab reordered. Nothing was written;
   * `currentOrder` is what to reload.
   */
  | { readonly code: 'stale_order'; readonly currentOrder: readonly string[] }
  /** `newOrder` repeats an id or is not a permutation of `expectedOrder`. Nothing was written. */
  | { readonly code: 'invalid_order'; readonly currentOrder: readonly string[] }

export type ReorderTemplatesResult =
  /** The order changed and was stored. `order` is the new active order. */
  | { readonly status: 'reordered'; readonly order: readonly string[] }
  /** `newOrder` equals the stored order: nothing was written. */
  | { readonly status: 'unchanged'; readonly order: readonly string[] }
  | { readonly status: 'rejected'; readonly reason: ReorderTemplatesRejection }

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function isPermutation(candidate: readonly string[], of: readonly string[]): boolean {
  if (candidate.length !== of.length) return false
  const wanted = new Set(of)
  const seen = new Set<string>()
  for (const id of candidate) {
    if (!wanted.has(id) || seen.has(id)) return false
    seen.add(id)
  }
  return true
}

/**
 * Stores the player's manual order of the ACTIVE quests, atomically.
 *
 * One read-write transaction on the template store:
 *  1. reads every template and the stored active order;
 *  2. refuses (`stale_order`) unless that order equals `expectedOrder`, so a
 *     stale tab can never silently overwrite a newer arrangement, and refuses
 *     (`invalid_order`) unless `newOrder` is a permutation of it;
 *  3. gives the active templates' existing `sortOrder` values to the quests in
 *     their new order and writes only the rows whose value changed.
 *
 * Because the values are only permuted among the active templates, the sequence
 * stays unique, archived templates are never touched (a restored quest returns
 * to the slot it held), and nothing overflows. `revision`, `updatedAt` and every
 * other field are left as they are: ordering is a presentation preference, not
 * an edit of the quest. If a damaged dataset ever repeats a value, the sequence
 * is first renumbered 0…n-1 in its current order inside the same transaction.
 *
 * A rejection or "unchanged" writes nothing. No occurrence, completion or EXP
 * row is read or written.
 */
export async function reorderTemplates(
  database: PersistenceDatabase,
  input: ReorderTemplatesInput,
): Promise<ReorderTemplatesResult> {
  return runTransaction(database, [STORE.templates], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(STORE.templates)
    const rows: QuestTemplate[] = (await requestToPromise(store.getAll())).map((value, index) =>
      parseStored(parseTemplate, value, `quest template [${index}]`),
    )
    const currentOrder = sortTemplatesByOrder(rows.filter((row) => row.status === 'active')).map((row) => row.id)

    if (!sameSequence(currentOrder, input.expectedOrder)) {
      return { status: 'rejected', reason: { code: 'stale_order', currentOrder } } as const
    }
    if (!isPermutation(input.newOrder, currentOrder)) {
      return { status: 'rejected', reason: { code: 'invalid_order', currentOrder } } as const
    }
    if (sameSequence(currentOrder, input.newOrder)) return { status: 'unchanged', order: currentOrder } as const

    // id → the value each row ends up with; starts as what is stored.
    const stored = new Map(rows.map((row) => [row.id, row.sortOrder]))
    const final = new Map(stored)
    if (!hasUniqueSortOrders(rows)) {
      for (const [id, value] of renumberInOrder(rows)) final.set(id, value)
    }
    const slots = currentOrder.map((id) => final.get(id)!).sort((a, b) => a - b)
    input.newOrder.forEach((id, index) => final.set(id, slots[index]!))

    for (const row of rows) {
      const sortOrder = final.get(row.id)!
      if (sortOrder !== stored.get(row.id)) await requestToPromise(store.put({ ...row, sortOrder }))
    }
    return { status: 'reordered', order: [...input.newOrder] } as const
  })
}
