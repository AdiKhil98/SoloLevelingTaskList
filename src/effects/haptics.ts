import type { Cue } from './types'

/**
 * Vibration patterns (OD-07), in milliseconds: vibrate, pause, vibrate, …
 * Light for ordinary progress, stronger for rarer moments. Playing one is
 * always best-effort (`src/platform/haptics.ts`); an unsupported device simply
 * does nothing.
 */
export const HAPTIC_PATTERNS: Readonly<Record<Cue, readonly number[]>> = {
  quest: [15],
  quest_strong: [25],
  achievement: [25, 50, 25],
  perfect_day: [25, 50, 25],
  level_up: [40, 60, 40],
  weekly_result: [30, 50, 30],
  rank_up: [60, 80, 60, 80, 120],
  perfect_week: [60, 70, 60, 70, 60, 70, 160],
}

export function hapticPatternFor(cue: Cue): readonly number[] {
  return HAPTIC_PATTERNS[cue]
}
