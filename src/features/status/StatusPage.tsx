import type { ReactNode } from 'react'
import { ExpProgressBar } from '@/components/ui/ExpProgressBar'
import { useAppRuntime } from '@/app/runtimeContext'
import { PLAYER_LABEL, rankLabel } from '../displayLabels'

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

/**
 * A small status sheet. Lifetime EXP is the ledger's running total; the
 * current-level figures are the engine's `expIntoLevel` / `expToNext`.
 * Completed-quest totals, categories, history and streaks belong to later phases.
 */
export function StatusPage() {
  const { player } = useAppRuntime().snapshot

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-sm font-semibold tracking-[0.4em] text-accent">STATUS</h1>

      <section aria-label="Player status" className="rounded-xl border border-border bg-surface px-4">
        <dl>
          <Row term="Player">{PLAYER_LABEL}</Row>
          <Row term="Level">{player.level}</Row>
          <Row term="Rank">{rankLabel(player.rank)}</Row>
          <Row term="Lifetime EXP">{player.totalExp}</Row>
        </dl>
      </section>

      <section aria-labelledby="level-progress-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <h2 id="level-progress-heading" className="text-xs tracking-[0.3em] text-muted">
          CURRENT LEVEL
        </h2>
        <ExpProgressBar value={player.expIntoLevel} max={player.expToNext} />
      </section>
    </div>
  )
}
