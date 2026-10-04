import type { EpochMs } from '../types/scalars'
import type { QuestTemplate } from './types'

/**
 * The player's manual quest order (Phase 09).
 *
 * Every template carries a `sortOrder`: a unique non-negative safe integer. The
 * values are one sequence over ALL templates, active and archived, and only
 * their relative order matters (gaps are fine). Archiving or restoring never
 * touches the value, so a restored quest comes back to the slot it held.
 *
 * Presentation only: nothing here affects eligibility, EXP, completion or the
 * daily denominator, and occurrence snapshots never store it.
 */

/** Whether `value` is a legal `sortOrder`. */
export function isSortOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** What the order depends on. `sortOrder` may be `Infinity` for a quest that has no template. */
export interface QuestOrderKey {
  readonly sortOrder: number
  readonly templateCreatedAt: EpochMs
  readonly templateId: string
}

/**
 * Total order over quests: `sortOrder`, then (only if a damaged dataset ever
 * repeats a value) template creation time, then template id. The tie-breakers
 * make the result deterministic whatever order the rows were read in.
 */
export function compareQuestOrder(a: QuestOrderKey, b: QuestOrderKey): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder < b.sortOrder ? -1 : 1
  if (a.templateCreatedAt !== b.templateCreatedAt) return a.templateCreatedAt < b.templateCreatedAt ? -1 : 1
  if (a.templateId < b.templateId) return -1
  if (a.templateId > b.templateId) return 1
  return 0
}

export function questOrderKeyOf(template: Pick<QuestTemplate, 'id' | 'sortOrder' | 'createdAt'>): QuestOrderKey {
  return { sortOrder: template.sortOrder, templateCreatedAt: template.createdAt, templateId: template.id }
}

/** The templates in manual order (a new array; the input is untouched). */
export function sortTemplatesByOrder<T extends Pick<QuestTemplate, 'id' | 'sortOrder' | 'createdAt'>>(
  templates: readonly T[],
): T[] {
  return [...templates].sort((a, b) => compareQuestOrder(questOrderKeyOf(a), questOrderKeyOf(b)))
}

/** Whether every template has its own `sortOrder`. */
export function hasUniqueSortOrders(templates: readonly Pick<QuestTemplate, 'sortOrder'>[]): boolean {
  return new Set(templates.map((template) => template.sortOrder)).size === templates.length
}

/**
 * Renumbers `templates` 0…n-1 in their current manual order, keeping that order
 * exactly. Returns template id → new value, only for the templates whose value
 * changes. Used to repair a sequence that is not unique and to make room when
 * the sequence has reached the largest safe integer.
 */
export function renumberInOrder(
  templates: readonly Pick<QuestTemplate, 'id' | 'sortOrder' | 'createdAt'>[],
): ReadonlyMap<string, number> {
  const changes = new Map<string, number>()
  sortTemplatesByOrder(templates).forEach((template, index) => {
    if (template.sortOrder !== index) changes.set(template.id, index)
  })
  return changes
}
