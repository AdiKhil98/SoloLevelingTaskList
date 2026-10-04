import {
  buildAchievementUnlockedEvents,
  buildPerfectDayReachedEvent,
  buildWeeklyGoalCompletedEvents,
  evaluateAchievements,
  evaluateWeeklyGoals,
  weekKeyOf,
  type AchievementEvidence,
  type DailySummary,
  type DomainEvent,
  type QuestCompletedEvent,
  type XPAwardedEvent,
} from '@/domain'
import { countCompletionsByTemplate, getWeeklyBoard } from '@/persistence'
import type { ApplicationContext } from '../context'
import type { HomeSnapshot } from '../home'
import type { FinalizedWeekReport } from '../lifecycle/finalizeWeeks'
import { readProgressionHistory } from '../player/readProgressionHistory'

/**
 * Presentation events (Phase 10): the domain events a screen may celebrate,
 * assembled from what ONE action or ONE reconciliation just wrote.
 *
 * Nothing here is stored and nothing here changes progression. An achievement
 * is reported only when the record that unlocked it is a record this call's
 * action wrote (its ledger transaction, its finalized day, its finalized
 * week), so unlocks that already existed can never replay, with no "seen" flag.
 *
 * Every function is best-effort: a failed read is returned in `errors` (for the
 * caller to log) and the events that could be built are still returned. A
 * celebration is never worth failing an action that already succeeded.
 */

/**
 * Catch-up rule (OD-21). A reconciliation is "strict overnight" when it
 * finalized at most this many days AND at most this many weekly boards; only
 * then may it be presented. Anything larger stays silent (the restrained notice).
 */
export const OVERNIGHT_MAX_FINALIZED_DAYS = 1
export const OVERNIGHT_MAX_FINALIZED_BOARDS = 1

export interface PresentationEvents {
  readonly events: readonly DomainEvent[]
  /** Reads that failed; the caller logs them. */
  readonly errors: readonly unknown[]
}

const isQuestCompleted = (event: DomainEvent): event is QuestCompletedEvent => event.type === 'QuestCompleted'
const isXpAwarded = (event: DomainEvent): event is XPAwardedEvent => event.type === 'XPAwarded'

async function attempt<T>(errors: unknown[], read: () => Promise<readonly T[]> | readonly T[]): Promise<readonly T[]> {
  try {
    return await read()
  } catch (error) {
    errors.push(error)
    return []
  }
}

/** Achievements whose unlocking record satisfies `wroteEvidence`, evaluated against the stored history. */
async function achievementEventsFor(
  context: ApplicationContext,
  wroteEvidence: (evidence: AchievementEvidence) => boolean,
): Promise<readonly DomainEvent[]> {
  const statuses = evaluateAchievements(await readProgressionHistory(context))
  return buildAchievementUnlockedEvents(statuses, wroteEvidence)
}

/**
 * Linked weekly goals reach their target through quest completions, which emit no
 * `WeeklyGoalCompleted` themselves. This derives them exactly: the week's
 * completion counts now versus the counts without the completion just made.
 */
async function linkedGoalEventsFor(context: ApplicationContext, completed: QuestCompletedEvent): Promise<readonly DomainEvent[]> {
  const weekKey = weekKeyOf(completed.dateKey)
  const board = await getWeeklyBoard(context.database, weekKey)
  if (board === null || board.status !== 'active') return []
  const after = await countCompletionsByTemplate(context.database, board.startDate, board.endDate)
  const before = new Map(after)
  before.set(completed.templateId, Math.max(0, (after.get(completed.templateId) ?? 0) - 1))
  return buildWeeklyGoalCompletedEvents(weekKey, evaluateWeeklyGoals(board.goals, before), evaluateWeeklyGoals(board.goals, after))
}

export interface CompletionPresentationInput {
  /** The events the saved completion returned, in domain order. */
  readonly events: readonly DomainEvent[]
  /** The Home state read after the completion, or null if re-reading failed. */
  readonly home: HomeSnapshot | null
}

/**
 * The events a saved quest completion may present: its own events, then (in
 * this order) a live Perfect Day, linked weekly goals it completed, and the
 * achievements its ledger row unlocked.
 */
export async function completionPresentationEvents(
  context: ApplicationContext,
  { events, home }: CompletionPresentationInput,
): Promise<PresentationEvents> {
  const errors: unknown[] = []
  const completed = events.find(isQuestCompleted)
  const awarded = events.find(isXpAwarded)

  const perfect: DomainEvent[] = []
  if (home !== null && completed !== undefined && completed.dateKey === home.today.dateKey) {
    const event = buildPerfectDayReachedEvent(home.today.progress)
    if (event !== null) perfect.push(event)
  }
  const goals = completed === undefined ? [] : await attempt(errors, () => linkedGoalEventsFor(context, completed))
  const achievements =
    awarded === undefined
      ? []
      : await attempt(errors, () =>
          achievementEventsFor(
            context,
            (evidence) => evidence.type === 'xp_transaction' && evidence.transactionId === awarded.transactionId,
          ),
        )

  return { events: [...events, ...perfect, ...goals, ...achievements], errors }
}

export interface ReconciliationPresentationInput {
  /** The days this reconciliation finalized. */
  readonly finalized: readonly DailySummary[]
  /** The weekly boards this reconciliation finalized, with their events. */
  readonly finalizedWeeks: readonly FinalizedWeekReport[]
}

/**
 * The events a reconciliation may present, or none. Only a strict overnight
 * reconciliation (at most one day and one board finalized) is presented; a
 * longer catch-up returns nothing, however much it finalized (OD-21). A
 * presentable one returns the finalized board's events (result, bonus EXP,
 * level and rank changes it caused) and the achievements unlocked by the
 * records it wrote.
 */
export async function reconciliationPresentationEvents(
  context: ApplicationContext,
  { finalized, finalizedWeeks }: ReconciliationPresentationInput,
): Promise<PresentationEvents> {
  const errors: unknown[] = []
  if (finalized.length === 0 && finalizedWeeks.length === 0) return { events: [], errors }
  if (finalized.length > OVERNIGHT_MAX_FINALIZED_DAYS || finalizedWeeks.length > OVERNIGHT_MAX_FINALIZED_BOARDS) {
    return { events: [], errors }
  }

  const weekEvents = finalizedWeeks.flatMap((week) => week.events)
  const dateKeys = new Set<string>(finalized.map((summary) => summary.dateKey))
  const weekKeys = new Set<string>(finalizedWeeks.map((week) => week.weekKey))
  const transactionIds = new Set<string>(weekEvents.filter(isXpAwarded).map((event) => event.transactionId))

  const achievements = await attempt(errors, () =>
    achievementEventsFor(context, (evidence) => {
      switch (evidence.type) {
        case 'daily_summary':
          return dateKeys.has(evidence.dateKey)
        case 'weekly_board':
          return weekKeys.has(evidence.weekKey)
        case 'xp_transaction':
          return transactionIds.has(evidence.transactionId)
      }
    }),
  )
  return { events: [...weekEvents, ...achievements], errors }
}
