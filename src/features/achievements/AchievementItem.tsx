import { Check, Lock } from 'lucide-react'
import type { AchievementStatus } from '@/domain'
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
 * One trophy: locked or unlocked, its description, and (when locked and the
 * target is more than a single step) how far along it is. Unlocked ones show the
 * date of the record that earned them. Plain by design: unlock effects are a
 * later phase.
 */
export function AchievementItem({ status }: { status: AchievementStatus }) {
  const { definition, unlock, progress } = status
  const unlocked = unlock !== null
  const showProgress = !unlocked && progress.target > 1
  const fraction = progress.target > 0 ? progress.current / progress.target : 0

  return (
    <li className={`flex items-start gap-3 rounded-xl border p-3 ${unlocked ? 'border-accent/50 bg-surface' : 'border-border bg-surface/50'}`}>
      {unlocked ? (
        <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
      ) : (
        <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={`font-semibold break-words ${unlocked ? '' : 'text-muted'}`}>{definition.title}</p>
        <p className="text-sm break-words text-muted">{definition.description}</p>
        {unlocked ? (
          <p className="text-sm font-medium text-accent">Unlocked {formatDateKey(unlock.unlockedOn)}</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Locked{showProgress && <span className="tabular-nums"> · {progressText(status)}</span>}
            </p>
            {showProgress && (
              <div
                role="progressbar"
                aria-label={`${definition.title} progress`}
                aria-valuemin={0}
                aria-valuemax={progress.target}
                aria-valuenow={progress.current}
                aria-valuetext={progressText(status)}
                className="h-1.5 w-full overflow-hidden rounded-full bg-border"
              >
                <div className="h-full rounded-full bg-accent-strong" style={{ width: `${fraction * 100}%` }} />
              </div>
            )}
          </>
        )}
      </div>
    </li>
  )
}
