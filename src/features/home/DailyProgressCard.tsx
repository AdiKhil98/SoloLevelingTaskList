import type { DailyProgress } from '@/domain'
import { dayQualityLabel } from '../displayLabels'

/**
 * Today's completion. The count, floored percentage and status all come from
 * the Phase 02 daily engine; nothing is recalculated or re-thresholded here.
 */
export function DailyProgressCard({ progress }: { progress: DailyProgress }) {
  const empty = progress.eligibleCount === 0

  return (
    <section aria-labelledby="today-heading" className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <h2 id="today-heading" className="text-xs tracking-[0.3em] text-muted">
        TODAY
      </h2>
      {empty ? (
        <p className="text-lg font-semibold">{dayQualityLabel(progress.quality)}</p>
      ) : (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-semibold tabular-nums">
            {progress.completedCount} / {progress.eligibleCount}
          </p>
          <p className="text-sm text-muted tabular-nums">
            <span className="font-semibold text-foreground">{progress.displayPercent}%</span>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, status </span>
            <span className="font-semibold text-accent">{dayQualityLabel(progress.quality)}</span>
          </p>
        </div>
      )}
    </section>
  )
}
