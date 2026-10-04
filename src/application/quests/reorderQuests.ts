import { reorderTemplates } from '@/persistence'
import { readClock } from '../clock'
import { requireSynchronizedDay } from '../lifecycle/synchronization'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { refreshHome, type Refreshed } from './refresh'

export interface ReorderQuestsInput {
  /** The ids of the ACTIVE quests in the order the screen showed them. */
  readonly expectedOrder: readonly string[]
  /** The same ids in the order the player chose. */
  readonly newOrder: readonly string[]
}

export type ReorderQuestsResult =
  /** Stored. `order` is the new active order; Home was refreshed. */
  | ({ readonly status: 'reordered'; readonly order: readonly string[] } & Refreshed)
  /** The chosen order equals the stored one: nothing was written. */
  | { readonly status: 'unchanged'; readonly order: readonly string[] }
  /**
   * The stored order is not what the screen showed (a quest was added, archived
   * or restored, or another tab reordered). Nothing was written; reload
   * `currentOrder`.
   */
  | { readonly status: 'stale'; readonly currentOrder: readonly string[] }
  /** The requested order is not a permutation of the active quests. Nothing was written. */
  | { readonly status: 'invalid'; readonly currentOrder: readonly string[] }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Stores the player's manual order of the active daily quests.
 *
 * Like every mutating action it synchronizes the day first (refused while a day
 * is unfinalized or the device clock is behind). It then calls the atomic
 * persistence command, which refuses a stale view instead of overwriting a
 * newer order.
 *
 * Presentation only: no template field except the order is changed (`revision`
 * and `updatedAt` stay), and no occurrence, completion or EXP row is written, so
 * an occurrence snapshot that already exists for today is untouched and stays in
 * the denominator. Home is reloaded so it shows the new order.
 */
export async function reorderQuests(context: ApplicationContext, input: ReorderQuestsInput): Promise<ReorderQuestsResult> {
  try {
    await requireSynchronizedDay(context, readClock(context.clock))
    const result = await reorderTemplates(context.database, input)
    if (result.status === 'unchanged') return { status: 'unchanged', order: result.order }
    if (result.status === 'rejected') {
      return result.reason.code === 'stale_order'
        ? { status: 'stale', currentOrder: result.reason.currentOrder }
        : { status: 'invalid', currentOrder: result.reason.currentOrder }
    }
    return { status: 'reordered', order: result.order, ...(await refreshHome(context)) }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
}
