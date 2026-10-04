import { Circle, CircleCheck } from 'lucide-react'
import type { TodayQuest } from '@/application'
import { cn } from '@/lib/utils'
import { categoryLabel } from '../displayLabels'

interface QuestCardProps {
  quest: TodayQuest
  /** A completion for this quest is being saved. */
  pending: boolean
  onComplete: (quest: TodayQuest) => void
}

const ROW = 'system-panel flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left'

function QuestText({ quest }: { quest: TodayQuest }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium break-words">{quest.title}</span>{' '}
        <span className="text-xs text-muted">
          Difficulty {quest.difficulty} · {categoryLabel(quest.category)}
        </span>
      </span>{' '}
      <span
        className={cn(
          'shrink-0 font-display text-sm font-semibold tabular-nums',
          quest.completed ? 'text-muted' : 'text-accent-2',
        )}
      >
        +{quest.expReward} EXP
      </span>
    </>
  )
}

/**
 * One quest on today's list. An open quest is a real button; a completed quest
 * is a plain, non-interactive row, because completion is final in V1 and a
 * checkbox that looks reversible would be misleading. Completed rows differ
 * clearly (violet fill, left rail, check, muted EXP) without any animation.
 */
export function QuestCard({ quest, pending, onComplete }: QuestCardProps) {
  if (quest.completed) {
    return (
      <li>
        <div
          className={cn(
            ROW,
            'border-border-strong bg-accent/10 text-foreground/85 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent',
          )}
        >
          <CircleCheck role="img" aria-label="Completed" className="size-7 shrink-0 text-accent" />
          <QuestText quest={quest} />
        </div>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() => onComplete(quest)}
        className={cn(ROW, 'system-focus text-foreground transition-colors active:bg-accent/15 disabled:opacity-60')}
      >
        <Circle aria-hidden="true" className="size-7 shrink-0 text-muted" />
        <span className="sr-only">Complete</span>{' '}
        <QuestText quest={quest} />
      </button>
    </li>
  )
}
