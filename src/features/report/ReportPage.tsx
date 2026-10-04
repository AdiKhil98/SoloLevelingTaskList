import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { buildDailyReport } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { ClockBehindNotice } from '../home/ClockBehindNotice'
import { dayQualityLabel, daysLabel } from '../displayLabels'
import { SectionLabel } from '@/components/ui/SectionLabel'

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right font-display font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

/**
 * The Daily Report: a LIVE, PROVISIONAL view of the day in progress. It reads
 * stored state through the application layer and never implies that the day is
 * final: the day closes at local midnight, when its Daily Summary is written
 * and the persisted streak changes. It awards nothing and changes nothing.
 */
export function ReportPage() {
  const { snapshot } = useAppRuntime()
  const report = buildDailyReport(snapshot)
  const empty = report.eligibleCount === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel as="h1" className="text-sm tracking-[0.3em] text-accent">DAILY REPORT</SectionLabel>
        <p className="rounded-[3px] border border-accent-2/60 px-3 py-1 font-display text-xs font-semibold tracking-[0.2em] text-accent-2">LIVE</p>
      </div>

      {snapshot.clock.status === 'behind' ? (
        <ClockBehindNotice clock={snapshot.clock} />
      ) : (
        <>
          <p className="text-sm text-muted">
            Provisional: {report.dateKey} is still in progress. It becomes final at midnight, and your streak changes only then.
          </p>

          <section aria-label="Today so far" className="system-panel px-4">
            <dl>
              <Row term="Quests completed">{empty ? '—' : `${report.completedCount} / ${report.eligibleCount}`}</Row>
              <Row term="Completion">{report.displayPercent === null ? '—' : `${report.displayPercent}%`}</Row>
              <Row term="Day status">{dayQualityLabel(report.quality)}</Row>
              <Row term="EXP earned today">{report.expEarned}</Row>
              <Row term="Perfect Day">{report.isPerfect ? 'Yes, if it stays 100%' : 'Not yet'}</Row>
            </dl>
          </section>

          <section aria-label="Streak" className="system-panel px-4">
            <dl>
              <Row term="Daily Streak">{daysLabel(report.currentStreak)}</Row>
              <Row term="If the day closed now">{daysLabel(report.projectedStreak)}</Row>
            </dl>
            {report.streakSecured && <p className="pb-3 text-sm font-semibold text-accent">STREAK SECURED</p>}
          </section>
        </>
      )}

      <Link
        to="/"
        className="inline-flex min-h-12 items-center justify-center rounded-[3px] border border-border px-4 font-medium system-focus active:bg-accent/15"
      >
        Back to quests
      </Link>
    </div>
  )
}
