import {
  computeDailyProgress,
  isQuestEligibleOnDate,
  type Category,
  type ClockReading,
  type DailyProgress,
  type DateKey,
  type Difficulty,
  type EpochMs,
  type QuestOccurrence,
  type QuestRole,
  type QuestTemplate,
} from '@/domain'
import { ensureOccurrence, listCompletionsByDate, listTemplates } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { ApplicationError } from '../errors'
import { compareQuestOrder } from './questOrder'

/** One quest on today's list, as stored: the occurrence snapshot plus its completion state. */
export interface TodayQuest {
  readonly occurrenceId: string
  readonly templateId: string
  readonly title: string
  readonly difficulty: Difficulty
  readonly category: Category
  readonly expReward: number
  readonly role: QuestRole
  readonly completed: boolean
  /** When it was completed, or null while still open. */
  readonly completedAt: EpochMs | null
}

export interface TodayView {
  readonly dateKey: DateKey
  /** Display order (see `questOrder`). */
  readonly quests: readonly TodayQuest[]
  /** Counted and classified by the Phase 02 daily engine over all of today's occurrences. */
  readonly progress: DailyProgress
}

interface Entry {
  readonly template: QuestTemplate
  readonly occurrence: QuestOccurrence
}

/**
 * Loads today's quests.
 *
 *  1. read the active templates;
 *  2. ask the domain whether each is eligible on today's date (any recurrence
 *     kind: this loader never assumes "everything is daily");
 *  3. for each eligible template take the persisted occurrence, creating it
 *     with the domain factory only if none exists (a stored snapshot always wins);
 *  4. join today's completions and let the daily engine count and classify.
 *
 * `reading` lets a caller that already read the clock (initialization) reuse
 * the same instant; otherwise the clock is read here.
 */
export async function loadToday(
  context: ApplicationContext,
  reading: ClockReading = readClock(context.clock),
): Promise<TodayView> {
  const { database } = context
  const { dateKey } = reading

  const templates = await listTemplates(database, { status: 'active' })
  const entries: Entry[] = []
  for (const template of templates) {
    if (!isQuestEligibleOnDate(template, dateKey)) continue
    const stored = await ensureOccurrence(database, template, dateKey, reading.epochMs)
    if (!stored.ok) {
      throw new ApplicationError(
        'inconsistent_data',
        `Could not materialize "${template.id}" for ${dateKey} (${stored.error.code})`,
      )
    }
    entries.push({ template, occurrence: stored.value.occurrence })
  }
  entries.sort((a, b) =>
    compareQuestOrder(
      { seedKey: a.template.seedKey, templateCreatedAt: a.template.createdAt, templateId: a.template.id },
      { seedKey: b.template.seedKey, templateCreatedAt: b.template.createdAt, templateId: b.template.id },
    ),
  )

  const completions = await listCompletionsByDate(database, dateKey)
  const completedAt = new Map<string, EpochMs>(
    completions.map((completion) => [completion.occurrenceId, completion.completedAt]),
  )

  const progress = computeDailyProgress({
    dateKey,
    occurrences: entries.map((entry) => entry.occurrence),
    completedOccurrenceIds: new Set(completedAt.keys()),
  })
  if (!progress.ok) {
    throw new ApplicationError(
      'inconsistent_data',
      `Today's occurrences are inconsistent (${progress.error.code})`,
    )
  }

  return {
    dateKey,
    progress: progress.value,
    quests: entries.map(({ occurrence }) => {
      const doneAt = completedAt.get(occurrence.id) ?? null
      return {
        occurrenceId: occurrence.id,
        templateId: occurrence.templateId,
        title: occurrence.snapshot.title,
        difficulty: occurrence.snapshot.difficulty,
        category: occurrence.snapshot.category,
        expReward: occurrence.snapshot.expReward,
        role: occurrence.snapshot.role,
        completed: doneAt !== null,
        completedAt: doneAt,
      }
    }),
  }
}
