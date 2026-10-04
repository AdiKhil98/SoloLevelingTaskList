import { cn } from '@/lib/utils'

interface ExpProgressBarProps {
  /** EXP earned inside the current level. */
  value: number
  /** EXP the current level requires. */
  max: number
  label?: string
  className?: string
}

/**
 * Progress bar for current-level EXP. It only draws the numbers it is given
 * (`value` of `max`): which level the player is on and how much EXP that level
 * needs are decided by the domain engine. Static SYSTEM styling: a framed track
 * with a violet→cyan fill (the animated fill belongs to a later phase).
 */
export function ExpProgressBar({ value, max, label = 'EXP', className }: ExpProgressBarProps) {
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-xs font-semibold tracking-[0.16em] text-muted">{label}</span>
        <span className="font-display text-sm font-semibold tabular-nums">
          {value} / {max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} progress in current level`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} of ${max} ${label}`}
        className="h-3 w-full overflow-hidden rounded-[2px] border border-border-strong bg-background p-px"
      >
        <div
          className="h-full rounded-[1px] bg-linear-to-r from-accent-strong via-accent to-accent-2 shadow-glow-soft transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  )
}
