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
 * Simple progress bar for current-level EXP. It only draws the numbers it is
 * given (`value` of `max`): which level the player is on and how much EXP that
 * level needs are decided by the domain engine. Presentation is deliberately
 * plain; Phase 09 owns the final look.
 */
export function ExpProgressBar({ value, max, label = 'EXP', className }: ExpProgressBarProps) {
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="tracking-widest text-muted">{label}</span>
        <span className="font-medium tabular-nums">
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
        className="h-2.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-accent-strong transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  )
}
