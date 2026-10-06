import { Check, Minus, Plus } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import type { WeeklyGoalView } from '@/application'
import { WEEKLY_LIMITS } from '@/domain'
import { cn } from '@/lib/utils'
import { MeterBar } from '@/components/ui/MeterBar'

const STEP =
  'inline-flex size-[min(2.75rem,56px)] shrink-0 items-center justify-center rounded-[3px] border border-border bg-surface-raised system-focus active:bg-accent/15 disabled:opacity-40'

interface WeeklyGoalItemProps {
  goal: WeeklyGoalView
  /** Sets the player's count. Resolves with an error text to show, or null when it was saved (or unchanged). */
  onSetProgress: (goal: WeeklyGoalView, progress: number) => Promise<string | null>
  /** False while the clock is paused: the numbers are shown but cannot be changed. */
  canEdit: boolean
}

/** The manual control: − / a typed number / +. The number is the player's own count. */
function ManualProgress({ goal, onSetProgress, canEdit }: WeeklyGoalItemProps) {
  // What the player has typed but not saved yet; null means the field shows the stored count. Deriving the
  // text this way (instead of copying the count into state) keeps the controls mounted, so keyboard focus stays
  // where it is after every update.
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Synchronous guard: a double tap must not send two updates (the stored value is absolute anyway).
  const inFlight = useRef(false)
  const text = draft ?? String(goal.progress)
  const errorId = `${goal.id}-progress-error`

  async function commit(next: number) {
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    try {
      setError(await onSetProgress(goal, next))
    } finally {
      inFlight.current = false
      setDraft(null)
    }
  }

  /** Saves the typed number (on Enter, or when the field loses focus with a changed value). */
  function submitText() {
    const trimmed = text.trim()
    if (trimmed === String(goal.progress)) return
    if (!/^\d+$/.test(trimmed) || Number(trimmed) > WEEKLY_LIMITS.progressMax) {
      setError('Enter a whole number, 0 or more.')
      return
    }
    void commit(Number(trimmed))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitText()
  }

  const disabled = !canEdit
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease progress for ${goal.title}`}
          disabled={disabled || goal.progress === 0}
          onClick={() => void commit(goal.progress - 1)}
          className={STEP}
        >
          <Minus aria-hidden="true" className="size-5" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`Progress for ${goal.title}`}
          aria-invalid={error === null ? undefined : true}
          aria-describedby={error === null ? undefined : errorId}
          value={text}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={submitText}
          className="min-h-11 w-20 min-w-0 rounded-[3px] border border-border bg-background px-2 text-center font-display text-base font-semibold tabular-nums system-focus aria-[invalid=true]:border-danger/70 disabled:opacity-60"
        />
        <button
          type="button"
          aria-label={`Increase progress for ${goal.title}`}
          disabled={disabled || goal.progress >= WEEKLY_LIMITS.progressMax}
          onClick={() => void commit(goal.progress + 1)}
          className={STEP}
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
      {error !== null && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  )
}

/**
 * One goal of the current week's board: its title and weight, how far along it
 * is (as the application layer derived it) and, for a manual goal, the control
 * to update the count. Progress above the target earns nothing extra, so the
 * bar stops at the target. A linked goal has no control: it counts completions.
 */
export function WeeklyGoalItem(props: WeeklyGoalItemProps) {
  const { goal } = props
  const unit = goal.unit === null ? '' : ` ${goal.unit}`

  return (
    <li className={cn('system-panel flex flex-col gap-2.5 p-3.5', goal.completed && 'border-border-strong bg-accent/10')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold break-words">{goal.title}</h3>
          {goal.trackingMode === 'linked_quest' && (
            <p className="text-sm text-muted break-words">
              Counts completions of {goal.templateTitle ?? 'a removed quest'}
              {goal.templateArchived ? ' (archived)' : ''} this week
            </p>
          )}
        </div>
        <p className="shrink-0 font-display text-sm font-semibold tabular-nums text-accent-2">
          {goal.maxPoints} {goal.maxPoints === 1 ? 'pt' : 'pts'}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="tabular-nums">
          {goal.progress} / {goal.target}
          {unit}
        </p>
        {goal.completed && (
          <p className="inline-flex items-center gap-1 font-semibold text-accent">
            <Check aria-hidden="true" className="size-4" />
            Complete · {goal.earnedPoints} pts
          </p>
        )}
      </div>

      <MeterBar
        value={goal.progress}
        max={goal.target}
        label={`${goal.title} progress`}
        valueText={`${goal.progress} of ${goal.target}${unit}`}
        tone={goal.completed ? 'done' : 'default'}
      />

      {goal.trackingMode === 'manual' && <ManualProgress {...props} />}

      {goal.notes !== null && <p className="text-sm text-muted break-words">{goal.notes}</p>}
    </li>
  )
}
