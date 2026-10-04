import {
  compareDateKeys,
  type DateKey,
  type EpochMs,
  type QuestTemplate,
} from '@/domain'
import type { QuestDefinition } from './questForm'

/**
 * Template construction for quest management. Pure: ids and timestamps are
 * supplied by the use case; nothing here reads a clock or a random source.
 */

/** A template that has no place in the manual order yet: persistence assigns the last one when it stores it. */
export type UnplacedQuestTemplate = Omit<QuestTemplate, 'sortOrder'>

/** A brand-new user-created template: standard role, no seed key, active, revision 1, not yet placed in the order. */
export function buildNewTemplate(definition: QuestDefinition, id: string, now: EpochMs): UnplacedQuestTemplate {
  return {
    id,
    title: definition.title,
    difficulty: definition.difficulty,
    category: definition.category,
    recurrence: definition.recurrence,
    role: 'standard',
    seedKey: null,
    activeFrom: definition.activeFrom,
    activeUntil: null,
    status: 'active',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * The edited version of a stored template. Only the editable fields change;
 * `id`, `createdAt`, `seedKey`, `role`, `status`, `activeUntil` and any
 * description are carried over from the stored record by construction, so an
 * edit can neither lose a seed's identity nor change what kind of quest it is.
 */
export function applyDefinition(current: QuestTemplate, definition: QuestDefinition, now: EpochMs): QuestTemplate {
  return {
    ...current,
    title: definition.title,
    difficulty: definition.difficulty,
    category: definition.category,
    recurrence: definition.recurrence,
    activeFrom: definition.activeFrom,
    revision: current.revision + 1,
    updatedAt: now,
  }
}

/** A One-Time quest whose date is already behind us: it can never produce another occurrence. */
export function isDatePassed(template: QuestTemplate, today: DateKey): boolean {
  return template.recurrence.kind === 'one_time' && compareDateKeys(template.recurrence.date, today) < 0
}

/**
 * The `activeUntil` stored when a template is archived.
 *
 * `status: 'archived'` is the authoritative archive state: the loader reads
 * only active templates, so an archived template never materializes anything.
 * `activeUntil` is bookkeeping that current template validation requires: it
 * may not precede `activeFrom` and must not cut off a One-Time quest's date. So
 * it is the latest of today, the template's `activeFrom` and a One-Time date.
 * Restoring clears it.
 */
export function archiveActiveUntil(template: QuestTemplate, today: DateKey): DateKey {
  let latest = compareDateKeys(today, template.activeFrom) >= 0 ? today : template.activeFrom
  if (template.recurrence.kind === 'one_time' && compareDateKeys(template.recurrence.date, latest) > 0) {
    latest = template.recurrence.date
  }
  return latest
}
