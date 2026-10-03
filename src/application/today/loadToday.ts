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
import { ensureOccurrence, listCompletionsByDate, listOccurrencesByDate, listTemplates } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { ApplicationError } from '../errors'
import { compareQuestOrder, type QuestOrderKey } from './questOrder'

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

/** Sort key of an occurrence: its template's, or (template missing) a stable one from the snapshot. */
function orderKeyOf(occurrence: QuestOccurrence, template: QuestTemplate | undefined): QuestOrderKey {
  return template === undefined
    ? { seedKey: null, templateCreatedAt: occurrence.materializedAt, templateId: occurrence.templateId }
    : { seedKey: template.seedKey, templateCreatedAt: template.createdAt, templateId: template.id }
}

interface Entry {
  readonly occurrence: QuestOccurrence
  readonly order: QuestOrderKey
}

/**
 * Loads today's quests.
 *
 * An occurrence that exists for today is FROZEN and authoritative (OD-16, see
 * QUEST_MANAGEMENT.md): it stays on the list, in the denominator and
 * completable whatever happened to its template afterwards (archived, edited so
 * it is no longer eligible today, even missing). Only templates that are still
 * active can add occurrences.
 *
 *  1. read today's persisted occurrences and keep every one of them;
 *  2. read the templates of any status (an occurrence's display order needs its
 *     template's seed key and creation time);
 *  3. for each ACTIVE template that the domain says is eligible today and has no
 *     occurrence yet, create it with the domain factory (any recurrence kind:
 *     this loader never assumes "everything is daily");
 *  4. join today's completions and let the daily engine count and classify the
 *     union of the existing and the newly created occurrences.
 *
 * `reading` lets a caller that already read the clock (initialization) reuse
 * the same instant; otherwise the clock is read here.
 *
 * `materialize: false` (the device clock is behind the recorded history) creates
 * nothing: the view holds only what is already stored for the date.
 */
export async function loadToday(
  context: ApplicationContext,
  reading: ClockReading = readClock(context.clock),
  { materialize = true }: { readonly materialize?: boolean } = {},
): Promise<TodayView> {
  const { database } = context
  const { dateKey } = reading

  const existing = await listOccurrencesByDate(database, dateKey)
  const templates = await listTemplates(database)
  const templateById = new Map<string, QuestTemplate>(templates.map((template) => [template.id, template]))

  const entries: Entry[] = existing.map((occurrence) => ({
    occurrence,
    order: orderKeyOf(occurrence, templateById.get(occurrence.templateId)),
  }))
  const hasOccurrence = new Set(existing.map((occurrence) => occurrence.templateId))

  for (const template of materialize ? templates : []) {
    if (template.status !== 'active') continue
    if (hasOccurrence.has(template.id)) continue
    if (!isQuestEligibleOnDate(template, dateKey)) continue
    const stored = await ensureOccurrence(database, template, dateKey, reading.epochMs)
    if (!stored.ok) {
      throw new ApplicationError(
        'inconsistent_data',
        `Could not materialize "${template.id}" for ${dateKey} (${stored.error.code})`,
      )
    }
    entries.push({ occurrence: stored.value.occurrence, order: orderKeyOf(stored.value.occurrence, template) })
  }
  entries.sort((a, b) => compareQuestOrder(a.order, b.order))

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
