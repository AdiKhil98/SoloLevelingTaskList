import type { DomainEvent } from '@/domain'
import { completeQuestAtomically, type AtomicCompletionRejection } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { loadHome, type HomeSnapshot } from '../home'

export type CompleteQuestRejection =
  /** The occurrence's day is over (the app was left open past midnight). */
  | 'day_ended'
  | 'not_yet_active'
  | 'not_found'
  | 'invalid_state'

/**
 * The refreshed screen state after a successful completion. `home` is null only
 * if the quest WAS saved but re-reading storage then failed (`refreshCause`);
 * the caller should reload instead of trusting stale state.
 */
type Refreshed =
  | { readonly home: HomeSnapshot }
  | { readonly home: null; readonly refreshCause: unknown }

export type CompleteTodayQuestResult =
  | ({
      readonly status: 'completed'
      /** Domain events in presentation order (Phase 10 consumes these). */
      readonly events: readonly DomainEvent[]
    } & Refreshed)
  /** A repeat of an already-saved completion: nothing was awarded. */
  | ({ readonly status: 'already_completed' } & Refreshed)
  /** The domain refused it; nothing was written. */
  | { readonly status: 'rejected'; readonly reason: CompleteQuestRejection }
  /** Storage or the clock failed; nothing was written. `cause` is for logging only. */
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

function rejectionOf(reason: AtomicCompletionRejection): CompleteQuestRejection {
  switch (reason.code) {
    case 'occurrence_day_ended':
      return 'day_ended'
    case 'occurrence_not_yet_active':
      return 'not_yet_active'
    case 'occurrence_not_found':
      return 'not_found'
    default:
      return 'invalid_state'
  }
}

async function refresh(context: ApplicationContext): Promise<Refreshed> {
  try {
    return { home: await loadHome(context) }
  } catch (refreshCause) {
    return { home: null, refreshCause }
  }
}

/**
 * Completes one quest occurrence through the Phase 03 atomic command, then
 * re-reads the visible state from storage. The clock is read once, here, and
 * its instant and zone are handed to the persistence command; the domain
 * decides whether the completion is valid and how much EXP it awards.
 *
 * Idempotent: repeating it returns `already_completed` and awards nothing.
 */
export async function completeTodayQuest(
  context: ApplicationContext,
  occurrenceId: string,
): Promise<CompleteTodayQuestResult> {
  let result
  try {
    const reading = readClock(context.clock)
    result = await completeQuestAtomically(context.database, {
      occurrenceId,
      completedAt: reading.epochMs,
      timeZone: reading.timeZone,
    })
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }

  switch (result.status) {
    case 'rejected':
      return { status: 'rejected', reason: rejectionOf(result.reason) }
    case 'already_completed':
      return { status: 'already_completed', ...(await refresh(context)) }
    case 'completed':
      return { status: 'completed', events: result.events, ...(await refresh(context)) }
  }
}
