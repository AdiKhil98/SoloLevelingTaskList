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

const ROW =
  'flex min-h-16 w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left'

function QuestText({ quest }: { quest: TodayQuest }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium break-words">{quest.title}</span>{' '}
        <span className="text-sm text-muted">
          Difficulty {quest.difficulty} · {categoryLabel(quest.category)}
        </span>
      </span>{' '}
      <span className="shrink-0 text-sm font-semibold tabular-nums">+{quest.expReward} EXP</span>
    </>
  )
}

/**
 * One quest on today's list. An open quest is a real button; a completed quest
 * is a plain, non-interactive row, because completion is final in V1 and a
 * checkbox that looks reversible would be misleading.
 */
export function QuestCard({ quest, pending, onComplete }: QuestCardProps) {
  if (quest.completed) {
    return (
      <li>
        <div className={cn(ROW, 'border-accent/40 bg-accent/10 text-foreground')}>
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
        className={cn(
          ROW,
          'border-border bg-surface text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15 disabled:opacity-60',
        )}
      >
        <Circle aria-hidden="true" className="size-7 shrink-0 text-muted" />
        <span className="sr-only">Complete</span>{' '}
        <QuestText quest={quest} />
      </button>
    </li>
  )
}
