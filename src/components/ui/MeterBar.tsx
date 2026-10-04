import { cn } from '@/lib/utils'

interface MeterBarProps {
  value: number
  max: number
  /** Accessible name of the progressbar. */
  label: string
  /** Spoken value, for example "2 of 5 days". */
  valueText: string
  /** `done` colours a finished meter (cyan end of the gradient only). */
  tone?: 'default' | 'done'
  className?: string
}

/**
 * A thin, framed progress meter for goals, scores and statistics. It draws the
 * numbers it is given (clamped to the track); what they mean is decided by the
 * domain. Static styling only.
 */
export function MeterBar({ value, max, label, valueText, tone = 'default', className }: MeterBarProps) {
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={valueText}
      className={cn('h-2 w-full overflow-hidden rounded-[2px] border border-border bg-background', className)}
    >
      <div
        className={cn(
          'h-full bg-linear-to-r',
          tone === 'done' ? 'from-accent to-accent-2' : 'from-accent-strong to-accent',
        )}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  )
}
