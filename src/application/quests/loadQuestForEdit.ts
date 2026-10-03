import { getTemplate } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { formValuesFromTemplate, type QuestFormValues } from './questForm'

export type LoadQuestForEditResult =
  /** The stored values the Edit form starts from. Internal fields (id, seed key, role) are not part of them. */
  | { readonly status: 'found'; readonly values: QuestFormValues }
  | { readonly status: 'not_found' }
  /** Archived quests are not editable; restore them first. */
  | { readonly status: 'archived'; readonly title: string }
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/** Loads one template for the Edit screen. An unknown id is a normal outcome, not an error. */
export async function loadQuestForEdit(
  context: ApplicationContext,
  templateId: string,
): Promise<LoadQuestForEditResult> {
  try {
    const { dateKey: today } = readClock(context.clock)
    const template = await getTemplate(context.database, templateId)
    if (template === null) return { status: 'not_found' }
    if (template.status === 'archived') return { status: 'archived', title: template.title }
    return { status: 'found', values: formValuesFromTemplate(template, today) }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
}
