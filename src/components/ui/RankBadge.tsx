import { cn } from '@/lib/utils'

/** The player's rank as a small framed tag. `label` is decided by the caller (domain → display text). */
export function RankBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-8 items-center rounded-[3px] border border-border-strong bg-accent/10 px-2.5 font-display text-base font-bold tracking-[0.12em] text-accent',
        className,
      )}
    >
      {label}
    </span>
  )
}
