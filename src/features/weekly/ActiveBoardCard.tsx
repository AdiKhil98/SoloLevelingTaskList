import { Link } from 'react-router'
import type { ActiveWeeklyBoardView, WeeklyGoalView } from '@/application'
import { WEEKLY_BOARD_TOTAL_POINTS } from '@/domain'
import { cn } from '@/lib/utils'
import { WeeklyGoalItem } from './WeeklyGoalItem'
import { tierLabel } from './weeklyMessages'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { MeterBar } from '@/components/ui/MeterBar'
import { BUTTON_PRIMARY } from '@/components/ui/styles'

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
  return (
    <div className="flex flex-col gap-4">
      {board.focus !== null && (
        <section aria-labelledby="focus-heading" className="system-panel flex flex-col gap-1 border-l-2 border-l-accent-2 px-4 py-3">
          <SectionLabel id="focus-heading">WEEKLY FOCUS</SectionLabel>
          <p className="break-words">{board.focus}</p>
        </section>
      )}

      <section aria-labelledby="score-heading" className="system-panel system-panel-accent system-frame flex flex-col gap-3 p-4">
        <SectionLabel id="score-heading">THIS WEEK’S SCORE</SectionLabel>
        <div className="flex items-end justify-between gap-3">
          <p className="font-display text-4xl leading-none font-bold tabular-nums">
            {board.score} / {WEEKLY_BOARD_TOTAL_POINTS}
            <span className="sr-only"> points</span>
          </p>
          <p className="pb-1 text-right text-sm">
            {board.goalsCompleted} / {board.goalCount} goals complete
          </p>
        </div>
        <MeterBar
          value={board.score}
          max={WEEKLY_BOARD_TOTAL_POINTS}
          label="Weekly score"
          valueText={`${board.score} of ${WEEKLY_BOARD_TOTAL_POINTS} points`}
        />
        <p className="text-sm text-muted">The bonus EXP is awarded once, when the week ends.</p>
      </section>

      <section aria-labelledby="goals-heading" className="flex flex-col gap-2.5">
        <SectionLabel id="goals-heading">GOALS</SectionLabel>
        <ul aria-label="Weekly goals" className="flex flex-col gap-2.5">
          {board.goals.map((goal) => (
            <WeeklyGoalItem key={goal.id} goal={goal} onSetProgress={onSetProgress} canEdit={canEdit} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="rewards-heading" className="flex flex-col gap-2.5">
        <SectionLabel id="rewards-heading">REWARDS</SectionLabel>
        <ol aria-label="Reward tiers" className="flex flex-col overflow-hidden system-panel">
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
              {tier.current && <span className="shrink-0 font-display text-xs font-semibold tracking-[0.14em] text-accent-2">CURRENT</span>}
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">Only the highest tier you reach applies.</p>
      </section>

      {canEdit && (
        <Link
          to="/weekly/edit"
          className={BUTTON_PRIMARY + ' min-h-12'}
        >
          Edit goals
        </Link>
      )}
    </div>
  )
}
