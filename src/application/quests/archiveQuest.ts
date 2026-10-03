import { archiveTemplate, getTemplate } from '@/persistence'
import { readClock } from '../clock'
import { requireSynchronizedDay } from '../lifecycle/synchronization'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { archiveActiveUntil } from './questTemplate'
import { refreshHome, type Refreshed } from './refresh'

export type ArchiveQuestResult =
  | ({ readonly status: 'archived' } & Refreshed)
  /** Already archived: nothing was written. */
  | ({ readonly status: 'already_archived' } & Refreshed)
  | { readonly status: 'not_found' }
  /** Nothing was changed: the quest is still active. `cause` is for logging only. */
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Archives a quest: the safe form of "delete". The template is kept
 * (`status: 'archived'` is the authoritative state); it is never hard-deleted.
 *
 *  - Future occurrences stop: the loader only creates occurrences from ACTIVE
 *    templates.
 *  - Nothing historical is touched: occurrences, completions, EXP transactions
 *    and summaries are not read or written here.
 *  - An occurrence that already exists for today is not removed. It stays on
 *    Home, stays completable until the day ends and stays in today's
 *    denominator, so a hard quest cannot be archived away to improve today.
 *
 * `activeUntil` is only compatibility bookkeeping required by template
 * validation (see `archiveActiveUntil`).
 */
export async function archiveQuest(context: ApplicationContext, templateId: string): Promise<ArchiveQuestResult> {
  let alreadyArchived = false
  try {
    const reading = readClock(context.clock)
    await requireSynchronizedDay(context, reading)
    const current = await getTemplate(context.database, templateId)
    if (current === null) return { status: 'not_found' }
    if (current.status === 'archived') {
      alreadyArchived = true
    } else {
      await archiveTemplate(context.database, templateId, {
        activeUntil: archiveActiveUntil(current, reading.dateKey),
        updatedAt: reading.epochMs,
      })
    }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
  return { status: alreadyArchived ? 'already_archived' : 'archived', ...(await refreshHome(context)) }
}
