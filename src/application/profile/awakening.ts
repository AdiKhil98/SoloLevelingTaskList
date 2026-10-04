import { parsePlayerName, type PlayerNameErrorCode } from '@/domain'
import {
  completeAwakeningAtomically,
  countTemplates,
  getPlayerProfile,
  renamePlayerAtomically,
} from '@/persistence'
import type { ApplicationContext } from '../context'
import { classifyFailure, type FailureReason } from '../errors'

/**
 * Player identity and Player Awakening (Phase 11). Identity only: nothing here
 * reads or writes a quest, occurrence, completion, EXP row, streak or weekly
 * record, and nothing here synchronizes the day, so none of it can change progression.
 */

/** Who the player is, as the screens show it. */
export interface PlayerIdentity {
  /** The chosen name, or null when none was chosen: the screens then show the generic `PLAYER` label. */
  readonly name: string | null
}

/**
 * Whether the player must go through Awakening. THE GATE IS THE EXISTENCE OF THE
 * PROFILE ROW, nothing else: a row means Awakening is complete.
 */
export type AwakeningState =
  /** No row on a database with no quests: a new player. Nothing else has been created yet. */
  | { readonly status: 'required' }
  | {
      readonly status: 'complete'
      readonly identity: PlayerIdentity
      /**
       * Why the player counts as awakened:
       *  - `profile`: the row exists and is valid (a migrated legacy row, `awakenedAt: null`, is this case);
       *  - `damaged_profile`: the row exists but is invalid. Awakening still happened; the name falls back to
       *    none and a rename repairs the row;
       *  - `existing_data`: NO row, but quests exist. Quests are created only after Awakening (or before
       *    Phase 11), so this is a database that lost its row. It is never put through a "first launch";
       *    the name falls back to none and a rename recreates the row.
       */
      readonly basis: 'profile' | 'damaged_profile' | 'existing_data'
    }

/**
 * Decides, at startup and before anything is created, whether to play Awakening.
 * Read-only: it never writes, not even to repair a damaged profile. Throws a
 * storage error if the database cannot be read (the runtime shows its startup error).
 */
export async function loadAwakeningState(context: ApplicationContext): Promise<AwakeningState> {
  const reading = await getPlayerProfile(context.database)
  switch (reading.status) {
    case 'valid':
      return { status: 'complete', identity: { name: reading.profile.name }, basis: 'profile' }
    case 'invalid':
      return { status: 'complete', identity: { name: null }, basis: 'damaged_profile' }
    case 'absent':
      return (await countTemplates(context.database)) > 0
        ? { status: 'complete', identity: { name: null }, basis: 'existing_data' }
        : { status: 'required' }
  }
}

export type CompleteAwakeningResult =
  /** The profile was written: Awakening is complete. */
  | { readonly status: 'awakened'; readonly identity: PlayerIdentity }
  /** Another tab (or an earlier tap) already finished: nothing was written and the stored name stands. */
  | { readonly status: 'already_awakened'; readonly identity: PlayerIdentity }
  /** The typed name is not acceptable. Nothing was written. */
  | { readonly status: 'rejected'; readonly reason: PlayerNameErrorCode }
  /** Nothing was saved, so onboarding is NOT complete. `cause` is for logging only. */
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Completes Awakening: validates the name, then writes the profile row in one
 * atomic, at-most-once transaction. `name` is the typed text, or `null` for Skip
 * (stored as no name). It writes only the profile; the lifecycle (default quests,
 * today's occurrences) starts afterwards, in the startup use case.
 */
export async function completeAwakening(
  context: ApplicationContext,
  name: string | null,
): Promise<CompleteAwakeningResult> {
  const parsed = name === null ? { ok: true as const, value: null } : parsePlayerName(name)
  if (!parsed.ok) return { status: 'rejected', reason: parsed.error }
  try {
    const result = await completeAwakeningAtomically(context.database, {
      name: parsed.value,
      awakenedAt: context.clock.now(),
    })
    return {
      status: result.status,
      identity: { name: result.profile?.name ?? null },
    }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
}

export type RenamePlayerResult =
  | { readonly status: 'renamed'; readonly identity: PlayerIdentity }
  /** The stored name already equals the typed one: nothing was written. */
  | { readonly status: 'unchanged'; readonly identity: PlayerIdentity }
  | { readonly status: 'rejected'; readonly reason: PlayerNameErrorCode }
  /** Awakening has not happened yet, so there is no one to rename. Nothing was written (a rename can never stand in for Awakening). */
  | { readonly status: 'not_awakened' }
  /** Nothing was changed. `cause` is for logging only. */
  | { readonly status: 'failed'; readonly reason: FailureReason; readonly cause: unknown }

/**
 * Changes the player's name later (from Status). `name` is the typed text; blank
 * means no name (the screens show `PLAYER`). It never replays Awakening, never
 * touches progression and does not synchronize the day, so it also works while
 * the device clock is behind. It also repairs a missing or damaged profile row, but
 * only for a player who has awakened: on a database that has not, it writes nothing,
 * because creating the row would silently skip Awakening.
 */
export async function renamePlayer(context: ApplicationContext, name: string): Promise<RenamePlayerResult> {
  const parsed = parsePlayerName(name)
  if (!parsed.ok) return { status: 'rejected', reason: parsed.error }
  try {
    if ((await loadAwakeningState(context)).status === 'required') return { status: 'not_awakened' }
    const result = await renamePlayerAtomically(context.database, { name: parsed.value })
    return { status: result.status, identity: { name: result.profile.name } }
  } catch (cause) {
    return { status: 'failed', reason: classifyFailure(cause), cause }
  }
}
