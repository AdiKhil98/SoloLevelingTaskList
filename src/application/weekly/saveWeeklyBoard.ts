import { weekKeyOf } from '@/domain'
import { getWeeklyBoard, saveWeeklyBoardAtomically } from '@/persistence'
import { readClock } from '../clock'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'
import { newWeeklyGoalId } from '../ids'
import { requireSynchronizedDay } from '../lifecycle/synchronization'
import { refreshHome, type Refreshed } from '../quests/refresh'
import { parseWeeklyBoardForm, type WeeklyBoardFormErrors, type WeeklyBoardFormValues } from './weeklyBoardForm'

export type SaveWeeklyBoardRejectionReason =
  /** The week's board is final; finalized boards are never changed. */
  | 'board_finalized'
  /** The board changed since the form was loaded (another tab, or it was created meanwhile): reload it. */
  | 'stale'
  /** The week is over (the screen was left open past Sunday midnight): reload. */
  | 'week_not_current'

export type SaveWeeklyBoardUseCaseResult =
  /** Saved. The refreshed Home state (with the weekly card) is included. */
  | ({ readonly status: 'created' | 'updated' } & Refreshed)
  /** The form is invalid; nothing was written. */
  | { readonly status: 'invalid'; readonly errors: WeeklyBoardFormErrors }
  /** Refused without writing. */
  | { readonly status: 'rejected'; readonly reason: SaveWeeklyBoardRejectionReason }
  /** Storage, the clock or id generation failed; nothing was saved. `cause` is for logging only. */
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Creates or edits the CURRENT week's Goal Crusher board.
 *
 * The board is validated by the domain (the exactly-10 rule among them) before
 * anything is written. A finalized board is refused here, from the stored
 * state, and again by the persistence command inside its own transaction, so
 * history stays immutable even if a screen is stale. Manual progress of an
 * existing goal carries over by id; a goal added in the form gets a fresh id.
 * Management saves award no EXP and touch no quest, completion or ledger row.
 */
export async function saveWeeklyBoard(
  context: ApplicationContext,
  values: WeeklyBoardFormValues,
): Promise<SaveWeeklyBoardUseCaseResult> {
  let result
  try {
    const reading = readClock(context.clock)
    await requireSynchronizedDay(context, reading)
    const weekKey = weekKeyOf(reading.dateKey)

    const existing = await getWeeklyBoard(context.database, weekKey)
    if (existing !== null && existing.status !== 'active') return { status: 'rejected', reason: 'board_finalized' }

    const parsed = parseWeeklyBoardForm(values, {
      existingGoals: new Map((existing?.goals ?? []).map((goal) => [goal.id, goal])),
      newGoalId: () => newWeeklyGoalId(context.ids),
    })
    if (!parsed.ok) return { status: 'invalid', errors: parsed.error }

    result = await saveWeeklyBoardAtomically(context.database, {
      weekKey,
      definition: parsed.value,
      expectedRevision: values.revision,
      today: reading.dateKey,
      now: reading.epochMs,
    })
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }

  if (result.status !== 'rejected') return { status: result.status, ...(await refreshHome(context)) }

  const { reason } = result
  switch (reason.code) {
    case 'board_finalized':
      return { status: 'rejected', reason: 'board_finalized' }
    case 'board_exists':
    case 'board_not_found':
    case 'stale_revision':
      return { status: 'rejected', reason: 'stale' }
    case 'week_over':
    case 'week_not_started':
      return { status: 'rejected', reason: 'week_not_current' }
    case 'unknown_template': {
      const row = values.goals.find((goal) => goal.trackingMode === 'linked_quest' && goal.templateId.trim() === reason.templateId)
      return {
        status: 'invalid',
        errors: { board: [], goals: row === undefined ? {} : { [row.key]: { link: 'link_unknown' } }, rewards: {} },
      }
    }
    case 'invalid':
      // The parser already applied the same domain rules, so this is an internal inconsistency, not a user error.
      return {
        status: 'failed',
        reason: 'unexpected',
        cause: new Error(`The weekly board was refused after validation: ${JSON.stringify(reason.problems)}`),
      }
  }
}
