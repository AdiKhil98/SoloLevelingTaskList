import { Link } from 'react-router'
import { Panel } from '@/components/ui/Panel'
import { SectionLabel } from '@/components/ui/SectionLabel'
import type { DailyProgress } from '@/domain'
import { dayQualityLabel } from '../displayLabels'

/**
 * Today's completion. The count, floored percentage and status all come from
 * the Phase 02 daily engine; nothing is recalculated or re-thresholded here.
 */
export function DailyProgressCard({ progress }: { progress: DailyProgress }) {
  const empty = progress.eligibleCount === 0

  return (
    <Panel aria-labelledby="today-heading" className="flex flex-col gap-2 p-3.5">
      <SectionLabel id="today-heading" className="text-[0.6875rem] tracking-[0.1em]">TODAY</SectionLabel>
      {empty ? (
        <p className="font-display text-lg font-semibold">{dayQualityLabel(progress.quality)}</p>
      ) : (
        <div className="flex flex-col">
          <p className="font-display text-3xl leading-tight font-bold tabular-nums">
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
      <Link
        to="/report"
        className="system-focus -mb-1 inline-flex min-h-11 items-center self-start text-sm font-medium text-accent"
      >
        Daily Report
      </Link>
    </Panel>
  )
}
