import { getTemplate, updateTemplate } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { isDatePassed } from './questTemplate'
import { refreshHome, type Refreshed } from './refresh'

export type RestoreQuestResult =
  | ({ readonly status: 'restored' } & Refreshed)
  /** Already active: nothing was written. */
  | ({ readonly status: 'already_active' } & Refreshed)
  /** A One-Time quest whose date has passed can never appear again; nothing was written. */
  | { readonly status: 'expired' }
  | { readonly status: 'not_found' }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Restores an archived quest: `status` becomes `active` and the archive
 * bookkeeping `activeUntil` is cleared. Identity, seed key, role, recurrence,
 * `activeFrom`, revision and creation time are untouched, and so is history.
 *
 * Nothing is generated retroactively. Future eligibility resumes from the stored
 * recurrence; the refreshed Home reuses today's occurrence if one exists, or
 * creates it if the quest is eligible today and has none.
 */
export async function restoreQuest(context: ApplicationContext, templateId: string): Promise<RestoreQuestResult> {
  let alreadyActive = false
  try {
    const reading = readClock(context.clock)
    const current = await getTemplate(context.database, templateId)
    if (current === null) return { status: 'not_found' }
    if (current.status === 'active') {
      alreadyActive = true
    } else {
      if (isDatePassed(current, reading.dateKey)) return { status: 'expired' }
      await updateTemplate(context.database, {
        ...current,
        status: 'active',
        activeUntil: null,
        updatedAt: reading.epochMs,
      })
    }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
  return { status: alreadyActive ? 'already_active' : 'restored', ...(await refreshHome(context)) }
}
