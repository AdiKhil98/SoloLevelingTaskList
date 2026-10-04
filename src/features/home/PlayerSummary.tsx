import type { PlayerStatus } from '@/application'
import { ExpProgressBar } from '@/components/ui/ExpProgressBar'
import { Panel } from '@/components/ui/Panel'
import { RankBadge } from '@/components/ui/RankBadge'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { PLAYER_LABEL, rankLabel } from '../displayLabels'

/** Player name placeholder, level, rank and progress through the current level: the hero window of Home. */
export function PlayerSummary({ player }: { player: PlayerStatus }) {
  return (
    <Panel aria-labelledby="player-heading" tone="accent" framed className="flex flex-col gap-3.5 p-4">
      <SectionLabel id="player-heading">{PLAYER_LABEL}</SectionLabel>
      <div className="flex items-end justify-between gap-3">
        <p className="font-display text-4xl leading-none font-bold tabular-nums [text-shadow:0_0_14px_rgb(167_139_250/0.55)]">
          LV. {player.level}
        </p>
        <RankBadge label={rankLabel(player.rank)} />
      </div>
      <ExpProgressBar value={player.expIntoLevel} max={player.expToNext} />
    </Panel>
  )
}
