import { Check, Lock } from 'lucide-react'
import { MeterBar } from '@/components/ui/MeterBar'
import type { AchievementStatus } from '@/domain'
import { cn } from '@/lib/utils'
import { formatDateKey } from '../displayLabels'

/** What the progress numbers count, for the one line under a locked achievement. */
function progressText({ definition, progress }: AchievementStatus): string {
  const { current, target } = progress
  switch (definition.condition.type) {
    case 'quest_completions':
      return `${current} / ${target} quests`
    case 'finalized_days':
    case 'daily_streak':
      return `${current} / ${target} days`
    case 'finalized_weeks':
      return `${current} / ${target} weeks`
    case 'rank_reached':
    case 'level_reached':
      return `Level ${current} / ${target}`
  }
}

/**
 * One trophy. Unlocked: a lit window with a filled badge and the date of the
 * record that earned it. Locked: a dim, dashed window with a lock and, when the
 * target is more than a single step, how far along it is. Static by design:
 * unlock effects belong to a later phase.
 */
export function AchievementItem({ status }: { status: AchievementStatus }) {
  const { definition, unlock, progress } = status
  const unlocked = unlock !== null
  const showProgress = !unlocked && progress.target > 1

  return (
    <li
      className={cn(
        'flex items-start gap-3 p-3',
        unlocked ? 'system-panel border-border-strong bg-accent/10' : 'rounded-[3px] border border-dashed border-border opacity-90',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[3px] border',
          unlocked ? 'border-accent bg-accent/20 text-accent shadow-glow-soft' : 'border-border text-muted',
        )}
      >
        {unlocked ? <Check className="size-5" /> : <Lock className="size-4" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn('font-semibold break-words', !unlocked && 'text-muted')}>{definition.title}</p>
        <p className="text-sm break-words text-muted">{definition.description}</p>
        {unlocked ? (
          <p className="text-sm font-medium text-accent-2">Unlocked {formatDateKey(unlock.unlockedOn)}</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Locked{showProgress && <span className="tabular-nums"> · {progressText(status)}</span>}
            </p>
            {showProgress && (
              <MeterBar
                value={progress.current}
                max={progress.target}
                label={`${definition.title} progress`}
                valueText={progressText(status)}
              />
            )}
          </>
        )}
      </div>
    </li>
  )
}
