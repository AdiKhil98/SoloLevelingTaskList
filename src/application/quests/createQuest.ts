import { validateQuestTemplate } from '@/domain'
import { appendTemplate } from '@/persistence'
import { readClock } from '../clock'
import { requireSynchronizedDay } from '../lifecycle/synchronization'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { newTemplateId } from '../ids'
import { parseQuestForm, type QuestFormErrors, type QuestFormValues } from './questForm'
import { buildNewTemplate } from './questTemplate'
import { refreshHome, type Refreshed } from './refresh'

export type CreateQuestResult =
  /** Saved. If it is eligible today, today's occurrence now exists (the refreshed Home includes it). */
  | ({ readonly status: 'created'; readonly templateId: string } & Refreshed)
  /** The form is invalid; nothing was written. */
  | { readonly status: 'invalid'; readonly errors: QuestFormErrors }
  /** Storage, the clock or id generation failed; nothing was created. `cause` is for logging only. */
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Creates a normal quest.
 *
 * The template is a plain user quest: standard role, no seed key, a fresh
 * `tpl_<uuid>` id, revision 1, and the single clock reading as `createdAt` and
 * `updatedAt`. Its EXP is not stored anywhere: it derives from difficulty. No
 * EXP is awarded and nothing is completed. It is placed at the BOTTOM of the
 * player's manual quest order.
 *
 * Create-today: after the template is saved, Home is reloaded through the
 * authoritative loader, which materializes today's occurrence if (and only if)
 * the new template is eligible today. Nothing is ever generated for earlier
 * dates. If that second step fails the template still exists, and the next
 * Home load creates the occurrence.
 */
export async function createQuest(context: ApplicationContext, values: QuestFormValues): Promise<CreateQuestResult> {
  let templateId: string
  try {
    const reading = readClock(context.clock)
    await requireSynchronizedDay(context, reading)

    const parsed = parseQuestForm(values, { today: reading.dateKey })
    if (!parsed.ok) return { status: 'invalid', errors: parsed.error }

    const template = buildNewTemplate(parsed.value, newTemplateId(context.ids), reading.epochMs)
    // The domain has the final word on the assembled template (the placeholder order is replaced on store).
    if (!validateQuestTemplate({ ...template, sortOrder: 0 }).ok) {
      return { status: 'invalid', errors: { recurrence: 'recurrence_invalid' } }
    }

    // Goes to the bottom of the manual order; the position is chosen atomically with the insert.
    await appendTemplate(context.database, template)
    templateId = template.id
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
  return { status: 'created', templateId, ...(await refreshHome(context)) }
}
