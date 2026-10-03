import type { PlayerStatus } from '@/application'
import { ExpProgressBar } from '@/components/ui/ExpProgressBar'
import { PLAYER_LABEL, rankLabel } from '../displayLabels'

/** Player name placeholder, level, rank and progress through the current level. */
export function PlayerSummary({ player }: { player: PlayerStatus }) {
  return (
    <section aria-labelledby="player-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 id="player-heading" className="text-xs tracking-[0.3em] text-muted">
        {PLAYER_LABEL}
      </h2>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-3xl font-semibold tabular-nums">LV. {player.level}</p>
        <p className="text-lg font-semibold text-accent">{rankLabel(player.rank)}</p>
      </div>
      <ExpProgressBar value={player.expIntoLevel} max={player.expToNext} />
    </section>
  )
}
