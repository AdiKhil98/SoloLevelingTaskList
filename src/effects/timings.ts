import type { EffectsMode } from './settings'
import type { PresentationEntry, PresentationKind } from './types'

/**
 * Presentation timings (OD-08). These are the V1 starting values, chosen for the
 * feel the phase asks for (a normal quest response in about a second, a Level
 * Up that never traps the player) and expected to be tuned in Phase 14. They are
 * data, not code paths: tests pass their own.
 */
/**
 * The Player Awakening sequence (Phase 11). Times in milliseconds. Like every
 * timing here these are V1 starting values (tunable in Phase 14) and plain data;
 * tests pass their own. REDUCED shows every message at once.
 */
export interface AwakeningTimings {
  /** The dark beat before SYSTEM makes contact. */
  readonly bootMs: number
  /** Heading scramble (CONNECTION ESTABLISHED, AWAKENING COMPLETE). */
  readonly scrambleMs: number
  /** One SYSTEM line typed out. */
  readonly typeMs: number
  /** Delay before the 2nd and the 3rd NOTICE line start. */
  readonly secondLineMs: number
  readonly thirdLineMs: number
  /** When the NOTICE lines have all arrived and ACCEPT is shown. */
  readonly noticeDoneMs: number
  /** ACCEPT ignores taps this long after it appears, so a stray double-tap cannot accept. */
  readonly acceptGuardMs: number
  /** The least time the INITIALIZING beat stays (the save itself is usually faster). */
  readonly registerMinMs: number
  /** Delay before "WELCOME," starts typing under AWAKENING COMPLETE (the name is typed right after the label). */
  readonly welcomeDelayMs: number
  /** How long AWAKENING COMPLETE stays before it continues by itself (visible time only). */
  readonly completeAutoMs: number
  /** Taps are ignored this long after AWAKENING COMPLETE appears. */
  readonly completeGuardMs: number
  /** The exit fade into the app. */
  readonly exitMs: number
}

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
  /** Player Awakening (the first-launch onboarding screen). */
  readonly awakening: AwakeningTimings
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

const NORMAL_AWAKENING: AwakeningTimings = {
  bootMs: 600,
  scrambleMs: 750,
  typeMs: 600,
  secondLineMs: 800,
  thirdLineMs: 1_500,
  noticeDoneMs: 2_400,
  acceptGuardMs: 350,
  registerMinMs: 700,
  welcomeDelayMs: 600,
  completeAutoMs: 3_600,
  completeGuardMs: 500,
  exitMs: 250,
}

/** Reduced effects: no waiting for animation, only a read time before the screen moves on by itself. */
const REDUCED_AWAKENING: AwakeningTimings = {
  bootMs: 0,
  scrambleMs: 0,
  typeMs: 0,
  secondLineMs: 0,
  thirdLineMs: 0,
  noticeDoneMs: 0,
  acceptGuardMs: 350,
  registerMinMs: 0,
  welcomeDelayMs: 0,
  completeAutoMs: 2_600,
  completeGuardMs: 500,
  exitMs: 150,
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
  awakening: NORMAL_AWAKENING,
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
  awakening: REDUCED_AWAKENING,
}

export function timingsFor(mode: EffectsMode, overrides: Partial<PresentationTimings> = {}): PresentationTimings {
  return { ...(mode === 'reduced' ? REDUCED_TIMINGS : NORMAL_TIMINGS), ...overrides }
}

/** Paths whose screens are forms: a lifecycle-origin overlay waits until the player leaves them. */
export function isFormPath(pathname: string): boolean {
  return pathname === '/quests/new' || pathname === '/weekly/edit' || /^\/quests\/[^/]+\/edit$/.test(pathname)
}
