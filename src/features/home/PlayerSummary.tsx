import type { PlayerStatus } from '@/application'
import { ExpProgressBar } from '@/components/ui/ExpProgressBar'
import { Panel } from '@/components/ui/Panel'
import { RankBadge } from '@/components/ui/RankBadge'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useBarGain, useFx, useHeldPlayer } from '../presentation/usePresentation'
import { playerDisplayName, rankLabel } from '../displayLabels'

/**
 * Player name (the generic PLAYER when none was chosen), level, rank and progress through the current level: the hero window of Home.
 *
 * While a Level Up is waiting to be revealed it shows the level and rank the
 * player had, with the bar full (`useHeldPlayer`), so the bar fills and the
 * overlay opens instead of the bar running backwards; the new level appears
 * when the overlay opens. It never decides anything: both states are the
 * domain's, and the hold is capped and released by the presentation queue.
 */
export function PlayerSummary({ player: stored, name = null }: { player: PlayerStatus; name?: string | null }) {
  const player = useHeldPlayer(stored)
  const { mode, countMs } = useFx()
  const gain = useBarGain()

  return (
    <Panel aria-labelledby="player-heading" tone="accent" framed className="flex flex-col gap-3.5 p-4">
      <SectionLabel id="player-heading">
        <bdi>{playerDisplayName(name)}</bdi>
      </SectionLabel>
      <div className="flex items-end justify-between gap-3">
        <p className="font-display text-4xl leading-none font-bold tabular-nums [text-shadow:0_0_14px_rgb(167_139_250/0.55)]">
          LV. {player.level}
        </p>
        <RankBadge label={rankLabel(player.rank)} />
      </div>
      <ExpProgressBar value={player.expIntoLevel} max={player.expToNext} fx={mode} countMs={countMs} gain={gain} />
    </Panel>
  )
}
