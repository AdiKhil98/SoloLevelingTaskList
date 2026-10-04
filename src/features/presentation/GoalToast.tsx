import type { EffectsMode } from '@/effects/settings'
import type { WeeklyGoalFeedbackEntry } from '@/effects/types'
import { weeklyGoalToastText } from './entryText'

/**
 * A small, non-interactive toast above the bottom navigation for a weekly goal
 * that reached its target while the week is still open (it can still change, so
 * it is a nudge, not a result). Visual only: the Weekly screen carries the same
 * fact as text. It lives for a moment and the host removes it.
 */
export function GoalToast({ entry, mode }: { entry: WeeklyGoalFeedbackEntry; mode: EffectsMode }) {
  return (
    <div
      aria-hidden="true"
      data-fx={mode}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-30 flex justify-center px-4"
    >
      <p className="system-fx-popup system-panel system-panel-accent px-4 py-2 font-display text-xs font-semibold tracking-[0.16em] text-accent-2 shadow-glow-soft">
        {weeklyGoalToastText(entry)}
      </p>
    </div>
  )
}
