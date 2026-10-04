import { CLASS_PRIORITY, isModalClass, type HudHold, type PresentationEntry } from './types'

/**
 * The ONE presentation queue (Phase 10), as a pure reducer: no timers, no DOM,
 * no clock. The host decides WHEN to call it (after a delay, on dismissal, on
 * expiry); the reducer decides WHAT happens, so every rule is testable alone.
 *
 * Rules:
 *  - Deduplication: an entry whose id was already enqueued this session is
 *    ignored (a double emission, a repeated callback, a StrictMode replay).
 *  - Minor entries are inline feedback. They run beside a calm screen but are
 *    dropped while a major / critical overlay is open.
 *  - Medium, major and critical entries wait in one first-in-first-out line and
 *    show one at a time. A modal (major / critical) one therefore pauses every
 *    lighter entry behind it, and nothing preempts what is already showing.
 *  - The line is bounded: past `MAX_PENDING` the oldest lightest entry is
 *    dropped. Major and critical entries are never dropped.
 */

export const MAX_PENDING = 8
/** Ids remembered for deduplication. */
export const MAX_SEEN = 256

export interface QueueState {
  /** Minor entries showing now. */
  readonly minor: readonly PresentationEntry[]
  /** Medium / major / critical entries waiting, oldest first. */
  readonly pending: readonly PresentationEntry[]
  /** The one medium / major / critical entry showing now. */
  readonly active: PresentationEntry | null
  /** Ids already enqueued (bounded, oldest first). */
  readonly seen: readonly string[]
  /** Ids of entries whose HUD hold was released early. */
  readonly releasedHolds: readonly string[]
}

export const EMPTY_QUEUE: QueueState = { minor: [], pending: [], active: null, seen: [], releasedHolds: [] }

export type QueueAction =
  | { readonly type: 'enqueue'; readonly entries: readonly PresentationEntry[] }
  /** The host's start delay elapsed: show the next waiting entry, if nothing is showing. */
  | { readonly type: 'start_next' }
  /** The showing entry was dismissed or timed out. */
  | { readonly type: 'finish'; readonly id: string }
  | { readonly type: 'expire_minor'; readonly id: string }
  /** Show the real level / rank again (the reveal is on screen, or the held HUD waited long enough). */
  | { readonly type: 'release_hold'; readonly id: string }
  | { readonly type: 'clear' }

/** Drops the oldest entry of the lowest class that may be dropped, until the line fits. */
function boundPending(pending: readonly PresentationEntry[]): readonly PresentationEntry[] {
  const kept = [...pending]
  while (kept.length > MAX_PENDING) {
    let victim = -1
    for (let index = 0; index < kept.length; index += 1) {
      const entry = kept[index]
      if (entry === undefined || isModalClass(entry.class)) continue
      const current = kept[victim]
      if (current === undefined || CLASS_PRIORITY[entry.class] < CLASS_PRIORITY[current.class]) victim = index
    }
    if (victim === -1) break // only modal entries remain: never dropped
    kept.splice(victim, 1)
  }
  return kept
}

function enqueue(state: QueueState, entries: readonly PresentationEntry[]): QueueState {
  const seen = new Set(state.seen)
  const accepted: PresentationEntry[] = []
  for (const entry of entries) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    accepted.push(entry)
  }
  if (accepted.length === 0) return state

  const modalShowing = state.active !== null && isModalClass(state.active.class)
  const minor = [...state.minor]
  const pending = [...state.pending]
  for (const entry of accepted) {
    if (entry.class === 'minor') {
      if (!modalShowing) minor.push(entry)
    } else {
      pending.push(entry)
    }
  }
  return {
    ...state,
    minor,
    pending: boundPending(pending),
    seen: [...seen].slice(-MAX_SEEN),
  }
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'enqueue':
      return enqueue(state, action.entries)
    case 'start_next': {
      if (state.active !== null) return state
      const [next, ...rest] = state.pending
      if (next === undefined) return state
      // A modal overlay covers the screen: the inline feedback behind it is over.
      return { ...state, active: next, pending: rest, minor: isModalClass(next.class) ? [] : state.minor }
    }
    case 'finish':
      return state.active?.id === action.id ? { ...state, active: null } : state
    case 'expire_minor': {
      if (!state.minor.some((entry) => entry.id === action.id)) return state
      return { ...state, minor: state.minor.filter((entry) => entry.id !== action.id) }
    }
    case 'release_hold': {
      // Only an entry that really holds the HUD can be released (anything else changes nothing).
      if (state.releasedHolds.includes(action.id) || !heldEntries(state).some((entry) => entry.id === action.id)) return state
      return { ...state, releasedHolds: [...state.releasedHolds, action.id].slice(-MAX_SEEN) }
    }
    case 'clear':
      return { ...EMPTY_QUEUE, seen: state.seen }
  }
}

/** The progression entries (showing or waiting, oldest first) that still hold the HUD. */
function heldEntries(state: QueueState): readonly (PresentationEntry & { readonly kind: 'progression' })[] {
  const candidates = state.active === null ? state.pending : [state.active, ...state.pending]
  return candidates.filter(
    (entry): entry is PresentationEntry & { readonly kind: 'progression' } =>
      entry.kind === 'progression' && entry.hold !== null && !state.releasedHolds.includes(entry.id),
  )
}

/**
 * The HUD hold to apply right now: the state before the first Level Up that has
 * not been revealed yet, so the bar can fill and the overlay open instead of the
 * bar jumping back (or the new level showing before its reveal). It holds from
 * the moment the award is saved, through the wait and the overlay's loading, and
 * ends when the overlay reports it is open (`release_hold`), the entry is
 * dropped or the queue cleared, or the host's cap releases it.
 */
export function selectHudHold(state: QueueState): HudHold | null {
  return heldEntries(state)[0]?.hold ?? null
}

/** The first progression entry that still holds the HUD, if any (the host times its release). */
export function firstHeldEntryId(state: QueueState): string | null {
  return heldEntries(state)[0]?.id ?? null
}
