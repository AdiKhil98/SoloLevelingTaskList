import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { cn } from '@/lib/utils'
import { BUTTON } from './styles'

/** Shared building blocks of the Status, Achievements and History screens. Presentation only. */

/**
 * One label/value line of a stat sheet. The label may wrap; the value never does.
 * `big` makes the value the headline figure of a window (the player's level).
 * `wrap` lets a long free-text value (the player's name) break instead of pushing the row wider than its window.
 */
export function Row({ term, big = false, wrap = false, children }: { term: string; big?: boolean; wrap?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="min-w-0 text-muted">{term}</dt>
      <dd className={cn('text-right font-display font-semibold tabular-nums', wrap ? 'min-w-0 [overflow-wrap:anywhere]' : 'shrink-0', big && 'text-3xl font-bold')}>{children}</dd>
    </div>
  )
}

/** A titled card. `children` is usually a `<dl>` of rows or a list. */
export function StatCard({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="system-panel flex flex-col gap-1 px-4 pt-4 pb-1">
      <SectionLabel id={id}>{heading}</SectionLabel>
      {children}
    </section>
  )
}

/** A full-width, 44 px-high link at the foot of a card. */
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={`${BUTTON} mt-1 mb-3 w-full`}>
      {children}
    </Link>
  )
}

export function LoadFailure({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-[3px] border border-danger/50 bg-danger/10 p-3 text-sm">
      <p>{what} could not be loaded.</p>
      <button type="button" onClick={onRetry} className={BUTTON}>
        Retry
      </button>
    </div>
  )
}
