import { validateQuestTemplate } from '@/domain'
import { getTemplate, updateTemplate } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { parseQuestForm, type QuestFormErrors, type QuestFormValues } from './questForm'
import { applyDefinition } from './questTemplate'
import { refreshHome, type Refreshed } from './refresh'

export type UpdateQuestResult =
  | ({ readonly status: 'updated' } & Refreshed)
  | { readonly status: 'invalid'; readonly errors: QuestFormErrors }
  | { readonly status: 'not_found' }
  /** The quest was archived (for example in another tab) after the form was opened; nothing was written. */
  | { readonly status: 'archived' }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Edits an active quest.
 *
 * Only the template changes, and only its editable fields (see
 * `applyDefinition`); it is re-read first, so a stale form can neither
 * resurrect an archived quest nor overwrite fields it did not show.
 *
 * Frozen-occurrence rule: this writes NO occurrence, completion or EXP
 * transaction. An occurrence that already exists for today keeps its snapshot
 * (title, difficulty, EXP, category, …) and stays on Home; the edit applies to
 * occurrences created afterwards. If no occurrence exists yet, the refreshed
 * Home loads today under the normal eligibility rules, so an edit that makes the
 * quest eligible today materializes it from the edited template.
 */
export async function updateQuest(
  context: ApplicationContext,
  templateId: string,
  values: QuestFormValues,
): Promise<UpdateQuestResult> {
  try {
    const reading = readClock(context.clock)

    const current = await getTemplate(context.database, templateId)
    if (current === null) return { status: 'not_found' }
    if (current.status === 'archived') return { status: 'archived' }

    const parsed = parseQuestForm(values, { today: reading.dateKey, current })
    if (!parsed.ok) return { status: 'invalid', errors: parsed.error }

    const edited = applyDefinition(current, parsed.value, reading.epochMs)
    if (!validateQuestTemplate(edited).ok) return { status: 'invalid', errors: { recurrence: 'recurrence_invalid' } }

    await updateTemplate(context.database, edited)
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
  return { status: 'updated', ...(await refreshHome(context)) }
}
