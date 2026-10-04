import type { EffectsMode } from './settings'
import type { PresentationEntry, PresentationKind } from './types'

/**
 * Presentation timings (OD-08). These are the V1 starting values, chosen for the
 * feel the phase asks for (a normal quest response in about a second, a Level
 * Up that never traps the player) and expected to be tuned in Phase 14. They are
 * data, not code paths: tests pass their own.
 */
export interface PresentationTimings {
  /** Wait before a waiting entry of this kind starts, so the quest row and the EXP bar can play first. */
  readonly startDelayMs: Readonly<Record<PresentationKind, number>>
  /** Taps and Esc are ignored this long after an overlay opens (the completion tap must not dismiss it). */
  readonly inputGuardMs: number
  /** The exit animation of a popup or overlay. */
  readonly closeMs: number
  /** The longest the HUD keeps showing the old level before a waiting Level Up reveals the new one. */
  readonly holdMaxMs: number
  /** EXP count-up. */
  readonly countMs: number
  /** Heading scramble. */
  readonly scrambleMs: number
  /** SYSTEM line typing. */
  readonly typeMs: number
  /** How long the entry stays before it closes itself. */
  readonly visibleMs: (entry: PresentationEntry) => number
}

const NORMAL_START_DELAY: Readonly<Record<PresentationKind, number>> = {
  quest_feedback: 0,
  weekly_goal: 0,
  weekly_all_goals: 600,
  perfect_day: 600,
  achievements: 500,
  progression: 700,
  weekly_result: 600,
}

/** A level or rank reveal is longer when it has a rank phase; a weekly result by how strong it was. */
function normalVisibleMs(entry: PresentationEntry): number {
  switch (entry.kind) {
    case 'quest_feedback':
      return 900
    case 'weekly_goal':
      return 1_600
    case 'weekly_all_goals':
    case 'perfect_day':
    case 'achievements':
      return 3_200
    case 'progression':
      return entry.rank === null ? 4_500 : 7_500
    case 'weekly_result':
      return entry.tier === 'perfect' ? 8_000 : entry.tier === 'restrained' ? 3_600 : 5_500
  }
}

/** Reduced effects keep every message but shorten how long it waits to be read. */
function reducedVisibleMs(entry: PresentationEntry): number {
  switch (entry.kind) {
    case 'quest_feedback':
      return 900
    case 'weekly_goal':
      return 1_600
    case 'weekly_all_goals':
    case 'perfect_day':
    case 'achievements':
      return 2_600
    case 'progression':
      return entry.rank === null ? 3_400 : 5_000
    case 'weekly_result':
      return entry.tier === 'restrained' ? 3_000 : 4_200
  }
}

export const NORMAL_TIMINGS: PresentationTimings = {
  startDelayMs: NORMAL_START_DELAY,
  inputGuardMs: 500,
  closeMs: 200,
  holdMaxMs: 1_500,
  countMs: 600,
  scrambleMs: 750,
  typeMs: 900,
  visibleMs: normalVisibleMs,
}

export const REDUCED_TIMINGS: PresentationTimings = {
  startDelayMs: NORMAL_START_DELAY,
  inputGuardMs: 500,
  closeMs: 150,
  holdMaxMs: 1_500,
  countMs: 0,
  scrambleMs: 0,
  typeMs: 0,
  visibleMs: reducedVisibleMs,
}

export function timingsFor(mode: EffectsMode, overrides: Partial<PresentationTimings> = {}): PresentationTimings {
  return { ...(mode === 'reduced' ? REDUCED_TIMINGS : NORMAL_TIMINGS), ...overrides }
}

/** Paths whose screens are forms: a lifecycle-origin overlay waits until the player leaves them. */
export function isFormPath(pathname: string): boolean {
  return pathname === '/quests/new' || pathname === '/weekly/edit' || /^\/quests\/[^/]+\/edit$/.test(pathname)
}
