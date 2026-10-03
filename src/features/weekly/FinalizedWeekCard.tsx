import { useId } from 'react'
import type { FinalizedWeekView } from '@/application'
import { WEEKLY_BOARD_TOTAL_POINTS, WEEKLY_REWARD_TIER_SCORES } from '@/domain'
import { formatWeekRange, tierLabel } from './weeklyMessages'

const BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-accent/60 px-4 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15 disabled:opacity-60'

interface FinalizedWeekCardProps {
  week: FinalizedWeekView
  /** Heading level text, e.g. "LAST RESULT". */
  heading: string
  claiming: boolean
  onClaim: (week: FinalizedWeekView) => void
  /** Whether claiming is currently possible (false while the clock is paused). */
  canClaim: boolean
}

function progressText(progress: number, target: number, unit: string | null): string {
  return `${progress} / ${target}${unit === null ? '' : ` ${unit}`}`
}

/**
 * A finished week, drawn ONLY from its frozen snapshot (score, per-goal progress
 * as it was scored, bonus, the reward tier and text as they were at
 * finalization) and its claim. It is the same card on the Weekly screen and in
 * the history, and it has no way to edit anything.
 */
export function FinalizedWeekCard({ week, heading, claiming, onClaim, canClaim }: FinalizedWeekCardProps) {
  const headingId = useId()
  const { rewardTier } = week

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-xs tracking-[0.3em] text-muted">
          {heading}
        </h2>
        <p className="text-sm text-muted">{formatWeekRange(week.startDate, week.endDate)}</p>
      </div>

      {week.focus !== null && <p className="text-sm text-muted italic">“{week.focus}”</p>}

      <div className="flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold tabular-nums">
          {week.score} / {WEEKLY_BOARD_TOTAL_POINTS}
          <span className="sr-only"> points</span>
        </p>
        <p className="pb-1 text-right text-sm">
          {week.goalsCompleted} / {week.goalCount} goals complete
        </p>
      </div>

      <p className="text-sm">
        {week.bonusExp > 0 ? (
          <>
            Weekly bonus: <strong className="font-semibold text-accent">+{week.bonusExp} EXP</strong>
          </>
        ) : (
          `No weekly bonus (it starts at ${WEEKLY_REWARD_TIER_SCORES[0]} / ${WEEKLY_BOARD_TOTAL_POINTS}).`
        )}
      </p>

      <div className="flex flex-col gap-2 text-sm">
        {rewardTier === null ? (
          <p className="text-muted">No reward earned.</p>
        ) : (
          <>
            <p>
              <span className="text-muted">Reward ({tierLabel(rewardTier.minScore)}): </span>
              {rewardTier.text.trim() === '' ? <span className="text-muted">none written for this tier</span> : rewardTier.text}
            </p>
            {week.claimedAt !== null ? (
              <p className="font-semibold text-accent">Reward claimed</p>
            ) : week.claimable ? (
              <button type="button" disabled={claiming || !canClaim} onClick={() => onClaim(week)} className={`${BUTTON} w-fit`}>
                {claiming ? 'Claiming…' : 'CLAIM REWARD'}
              </button>
            ) : null}
          </>
        )}
      </div>

      <details className="rounded-lg border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Goals ({week.goalsCompleted} / {week.goalCount})
        </summary>
        <ul aria-label="Goal results" className="flex flex-col divide-y divide-border border-t border-border">
          {week.goals.map((goal) => (
            <li key={goal.goalId} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium break-words">{goal.title}</p>
                <p className="text-muted tabular-nums">{progressText(goal.progress, goal.target, goal.unit)}</p>
              </div>
              <p className={goal.completed ? 'shrink-0 font-semibold text-accent tabular-nums' : 'shrink-0 text-muted tabular-nums'}>
                {goal.completed ? 'Done' : 'Missed'} · {goal.earnedPoints} / {goal.maxPoints} pts
              </p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
