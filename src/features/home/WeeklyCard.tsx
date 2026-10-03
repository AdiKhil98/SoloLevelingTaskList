import { Link } from 'react-router'
import type { WeeklyHomeSummary } from '@/application'
import { WEEKLY_BOARD_TOTAL_POINTS } from '@/domain'

/**
 * A small summary of the current week's Goal Crusher: tap to open the Weekly
 * screen. Without a board it is a one-line invitation, not a form (the editor
 * is on its own screen) and no goal is ever invented for the player.
 */
export function WeeklyCard({ weekly }: { weekly: WeeklyHomeSummary }) {
  return (
    <Link
      to="/weekly"
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15"
    >
      <div className="flex min-w-0 flex-col">
        <h2 className="text-xs tracking-[0.3em] text-muted">WEEKLY GOAL CRUSHER</h2>
        {weekly.state === 'board' ? (
          <p className="text-xl font-semibold tabular-nums">
            {weekly.score} / {WEEKLY_BOARD_TOTAL_POINTS}
            <span className="sr-only"> points</span>
          </p>
        ) : (
          <p className="text-sm">Set this week’s Goal Crushers</p>
        )}
      </div>
      {weekly.state === 'board' && (
        <p className="shrink-0 text-right text-sm text-muted">
          {weekly.goalsCompleted} / {weekly.goalCount} goals complete
        </p>
      )}
    </Link>
  )
}
