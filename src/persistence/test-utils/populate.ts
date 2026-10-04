import type { PersistenceDatabase } from '../database/connection'
import { completeQuestAtomically } from '../commands/completeQuest'
import { ensureOccurrence } from '../repositories/occurrences'
import { archiveTemplate, createTemplate } from '../repositories/templates'
import { buildTemplate, d, noonOn, ZONE } from './helpers'

export const POPULATED_TOTAL_EXP = 55 + 55 + 120 + 55

/**
 * Builds a small but complete history through the public API only:
 * 4 templates (one archived), 7 occurrences over three days, 4 completions.
 */
export async function populate(database: PersistenceDatabase): Promise<void> {
  const gym = buildTemplate({ id: 'tpl_gym', title: 'Gym', difficulty: 'B', category: 'fitness', sortOrder: 0 })
  const read = buildTemplate({ id: 'tpl_read', title: 'Read', difficulty: 'E', category: 'knowledge', sortOrder: 1 })
  const once = buildTemplate({
    id: 'tpl_once',
    title: 'Ship the thing',
    difficulty: 'S',
    category: 'business',
    recurrence: { kind: 'one_time', date: d('2026-10-02') },
    sortOrder: 2,
  })
  const fajr = buildTemplate({ id: 'tpl_fajr', title: 'Fajr', difficulty: 'E', seedKey: 'prayer.fajr', sortOrder: 3 })
  for (const template of [gym, read, once, fajr]) await createTemplate(database, template)
  await archiveTemplate(database, 'tpl_fajr', { activeUntil: d('2026-10-03'), updatedAt: 3_000 })

  const plan: Array<[typeof gym, string]> = [
    [gym, '2026-10-01'],
    [read, '2026-10-01'],
    [gym, '2026-10-02'],
    [read, '2026-10-02'],
    [once, '2026-10-02'],
    [gym, '2026-10-03'],
    [read, '2026-10-03'],
  ]
  for (const [template, date] of plan) {
    const result = await ensureOccurrence(database, template, d(date), 2_000)
    if (!result.ok) throw new Error(`populate: ${result.error.code}`)
  }

  const completions: Array<[string, string]> = [
    ['occ:tpl_gym@2026-10-01', '2026-10-01'],
    ['occ:tpl_gym@2026-10-02', '2026-10-02'],
    ['occ:tpl_once@2026-10-02', '2026-10-02'],
    ['occ:tpl_gym@2026-10-03', '2026-10-03'],
  ]
  for (const [occurrenceId, date] of completions) {
    const result = await completeQuestAtomically(database, {
      occurrenceId,
      completedAt: noonOn(date),
      timeZone: ZONE,
    })
    if (result.status !== 'completed') throw new Error(`populate: ${result.status}`)
  }
}
