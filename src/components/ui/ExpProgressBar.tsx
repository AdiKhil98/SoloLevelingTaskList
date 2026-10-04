import { useState } from 'react'
import { useCountUp } from '@/effects/useCountUp'
import { cn } from '@/lib/utils'

interface ExpProgressBarProps {
  /** EXP earned inside the current level. */
  value: number
  /** EXP the current level requires. */
  max: number
  label?: string
  className?: string
  /**
   * How the bar moves. Unset keeps the plain 300 ms fill. `normal` fills slower and counts the number up;
   * `reduced` changes at once. Motion is only ever a response to a change: a bar that is simply shown stays still.
   */
  fx?: 'normal' | 'reduced'
  /** Milliseconds the visible number takes to count up to a new value (0 = at once). */
  countMs?: number
  /** A short glow while the bar takes a gain. */
  gain?: boolean
}

/**
 * Progress bar for current-level EXP. It only draws the numbers it is given
 * (`value` of `max`): which level the player is on and how much EXP that level
 * needs are decided by the domain engine. A framed track with a violet→cyan
 * fill. The fill grows toward a higher value; when the value goes DOWN (a new
 * level has started) it snaps to the new position instead of draining, so a
 * level-up never shows the bar running backwards.
 */
export function ExpProgressBar({ value, max, label = 'EXP', className, fx, countMs = 0, gain = false }: ExpProgressBarProps) {
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  const shownValue = useCountUp(value, countMs)

  // Derived during render: a lower fraction snaps (no transition for that update); a higher one fills.
  const [last, setLast] = useState({ fraction, snap: false })
  if (last.fraction !== fraction) setLast({ fraction, snap: fraction < last.fraction })

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-xs font-semibold tracking-[0.16em] text-muted">{label}</span>
        <span className="font-display text-sm font-semibold tabular-nums">
          {shownValue} / {max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} progress in current level`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} of ${max} ${label}`}
        data-fx={fx}
        className={cn(
          'h-3 w-full overflow-hidden rounded-[2px] border border-border-strong bg-background p-px',
          gain && 'system-fx-bar-gain',
        )}
      >
        <div
          className={cn(
            'h-full rounded-[1px] bg-linear-to-r from-accent-strong via-accent to-accent-2 shadow-glow-soft transition-[width] ease-out motion-reduce:transition-none',
            fx === 'normal' ? 'duration-[600ms]' : 'duration-300',
            (last.snap || fx === 'reduced') && 'transition-none',
          )}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  )
}
