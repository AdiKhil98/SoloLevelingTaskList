import type { DayQuality } from '@/domain'
import { isStreakSecured } from '@/domain'
import type { StreakStats } from '@/application'
import { daysLabel } from '../displayLabels'

/**
 * The finalized Daily Streak. The number is the persisted one (it changes only
 * when a day is finalized); "STREAK SECURED" is a live hint that today already
 * meets the Completed threshold, so the streak will continue at midnight.
 * Restrained on purpose: the flame and glow treatments are a later phase.
 */
export function StreakCard({ streaks, quality }: { streaks: StreakStats; quality: DayQuality }) {
  const secured = isStreakSecured(quality)
  return (
    <section aria-labelledby="streak-heading" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex flex-col">
        <h2 id="streak-heading" className="text-xs tracking-[0.3em] text-muted">
          DAILY STREAK
        </h2>
        <p className="text-xl font-semibold tabular-nums">{daysLabel(streaks.currentStreak)}</p>
      </div>
      {secured && (
        <p className="text-xs font-semibold tracking-[0.2em] text-accent">STREAK SECURED</p>
      )}
    </section>
  )
}
