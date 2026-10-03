import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { BUTTON } from './styles'

/** Shared building blocks of the Status, Achievements and History screens. Presentation only. */

/** One label/value line of a stat sheet. The label may wrap; the value never does. */
export function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="min-w-0 text-muted">{term}</dt>
      <dd className="shrink-0 text-right font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

/** A titled card. `children` is usually a `<dl>` of rows or a list. */
export function StatCard({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 pt-4 pb-1">
      <h2 id={id} className="text-xs tracking-[0.3em] text-muted">
        {heading}
      </h2>
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
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-red-400/50 bg-red-500/10 p-3 text-sm">
      <p>{what} could not be loaded.</p>
      <button type="button" onClick={onRetry} className={BUTTON}>
        Retry
      </button>
    </div>
  )
}
