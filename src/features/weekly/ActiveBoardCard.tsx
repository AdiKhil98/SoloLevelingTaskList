import { Link } from 'react-router'
import type { ActiveWeeklyBoardView, WeeklyGoalView } from '@/application'
import { WEEKLY_BOARD_TOTAL_POINTS } from '@/domain'
import { cn } from '@/lib/utils'
import { WeeklyGoalItem } from './WeeklyGoalItem'
import { tierLabel } from './weeklyMessages'

interface ActiveBoardCardProps {
  board: ActiveWeeklyBoardView
  onSetProgress: (goal: WeeklyGoalView, progress: number) => Promise<string | null>
  /** False while the clock is paused: the board is shown but cannot be changed. */
  canEdit: boolean
}

/**
 * The current week's board as the application layer derived it: Weekly Focus,
 * the live score, each goal's progress, and the reward tiers with the one that
 * currently applies highlighted. The score is not paid out live; the bonus is
 * awarded once, when the week is finalized.
 */
export function ActiveBoardCard({ board, onSetProgress, canEdit }: ActiveBoardCardProps) {
  const fraction = board.score / WEEKLY_BOARD_TOTAL_POINTS

  return (
    <div className="flex flex-col gap-4">
      {board.focus !== null && (
        <section aria-labelledby="focus-heading" className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3">
          <h2 id="focus-heading" className="text-xs tracking-[0.3em] text-muted">
            WEEKLY FOCUS
          </h2>
          <p className="break-words">{board.focus}</p>
        </section>
      )}

      <section aria-labelledby="score-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <h2 id="score-heading" className="text-xs tracking-[0.3em] text-muted">
          THIS WEEK’S SCORE
        </h2>
        <div className="flex items-end justify-between gap-3">
          <p className="text-3xl font-semibold tabular-nums">
            {board.score} / {WEEKLY_BOARD_TOTAL_POINTS}
            <span className="sr-only"> points</span>
          </p>
          <p className="pb-1 text-right text-sm">
            {board.goalsCompleted} / {board.goalCount} goals complete
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Weekly score"
          aria-valuemin={0}
          aria-valuemax={WEEKLY_BOARD_TOTAL_POINTS}
          aria-valuenow={board.score}
          aria-valuetext={`${board.score} of ${WEEKLY_BOARD_TOTAL_POINTS} points`}
          className="h-2.5 w-full overflow-hidden rounded-full bg-border"
        >
          <div className="h-full rounded-full bg-accent-strong" style={{ width: `${fraction * 100}%` }} />
        </div>
        <p className="text-sm text-muted">The bonus EXP is awarded once, when the week ends.</p>
      </section>

      <section aria-labelledby="goals-heading" className="flex flex-col gap-2.5">
        <h2 id="goals-heading" className="text-xs tracking-[0.3em] text-muted">
          GOALS
        </h2>
        <ul aria-label="Weekly goals" className="flex flex-col gap-2.5">
          {board.goals.map((goal) => (
            <WeeklyGoalItem key={goal.id} goal={goal} onSetProgress={onSetProgress} canEdit={canEdit} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="rewards-heading" className="flex flex-col gap-2.5">
        <h2 id="rewards-heading" className="text-xs tracking-[0.3em] text-muted">
          REWARDS
        </h2>
        <ol aria-label="Reward tiers" className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
          {board.rewardTiers.map((tier) => (
            <li
              key={tier.minScore}
              aria-current={tier.current ? 'true' : undefined}
              className={cn(
                'flex items-start justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0',
                tier.current && 'bg-accent/15',
                !tier.reached && 'text-muted',
              )}
            >
              <span className="shrink-0 font-semibold tabular-nums">{tierLabel(tier.minScore)}</span>
              <span className="min-w-0 flex-1 break-words">{tier.text.trim() === '' ? 'No reward set' : tier.text}</span>
              {tier.current && <span className="shrink-0 text-xs font-semibold tracking-[0.2em] text-accent">CURRENT</span>}
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">Only the highest tier you reach applies.</p>
      </section>

      {canEdit && (
        <Link
          to="/weekly/edit"
          className="inline-flex min-h-12 items-center justify-center rounded-lg border border-accent/60 px-4 font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15"
        >
          Edit goals
        </Link>
      )}
    </div>
  )
}
