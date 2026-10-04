import type { AwakeningTimings, PresentationTimings } from '@/effects/timings'
import { NORMAL_TIMINGS } from '@/effects/timings'
import type { PresentationKind } from '@/effects/types'

/**
 * Presentation timings for UI tests: every delay, animation and count-up is 0, so
 * a test sees an entry the moment it is next in the queue and the displayed
 * numbers are final at once. How long an entry stays up (`visibleMs`) is the
 * real value, so an overlay is dismissed by the test (or its own timer), never
 * by an artificial instant close.
 */
const NO_DELAY: Readonly<Record<PresentationKind, number>> = {
  quest_feedback: 0,
  weekly_goal: 0,
  weekly_all_goals: 0,
  perfect_day: 0,
  achievements: 0,
  progression: 0,
  weekly_result: 0,
}

/** Awakening in tests: nothing waits, except that the screen's own auto-continue keeps its real value (a test taps through it). */
export const TEST_AWAKENING_TIMINGS: AwakeningTimings = {
  bootMs: 0,
  scrambleMs: 0,
  typeMs: 0,
  secondLineMs: 0,
  thirdLineMs: 0,
  noticeDoneMs: 0,
  acceptGuardMs: 0,
  registerMinMs: 0,
  welcomeDelayMs: 0,
  completeAutoMs: NORMAL_TIMINGS.awakening.completeAutoMs,
  completeGuardMs: 0,
  exitMs: 0,
}

export const TEST_TIMINGS: Partial<PresentationTimings> = {
  startDelayMs: NO_DELAY,
  inputGuardMs: 0,
  closeMs: 0,
  countMs: 0,
  scrambleMs: 0,
  typeMs: 0,
  visibleMs: NORMAL_TIMINGS.visibleMs,
  awakening: TEST_AWAKENING_TIMINGS,
}
