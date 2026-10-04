import { createOccurrence } from '../quests/occurrence'
import type { QuestOccurrence, QuestTemplate } from '../quests/types'
import { asDateKey } from '../time/dateKey'
import type { DateKey } from '../types/scalars'

/** Test-only helpers. Not part of the public domain API. */

export const d = (key: string): DateKey => asDateKey(key)

export function buildTemplate(
  overrides: Partial<QuestTemplate> = {},
): QuestTemplate {
  return {
    id: 'tpl_test',
    title: 'Test quest',
    difficulty: 'C',
    category: 'discipline',
    recurrence: { kind: 'daily' },
    role: 'standard',
    seedKey: null,
    activeFrom: d('2026-01-01'),
    activeUntil: null,
    status: 'active',
    sortOrder: 0,
    revision: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

export function buildOccurrence(
  overrides: Partial<QuestTemplate> = {},
  dateKey: DateKey = d('2026-10-03'),
): QuestOccurrence {
  const result = createOccurrence(buildTemplate(overrides), dateKey, 0)
  if (!result.ok) {
    throw new Error(`Test occurrence is not eligible: ${result.error.code}`)
  }
  return result.value
}
