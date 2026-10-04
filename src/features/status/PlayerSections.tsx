import type { PlayerStatus, StreakStats } from '@/application'
import { ExpProgressBar } from '@/components/ui/ExpProgressBar'
import { Panel } from '@/components/ui/Panel'
import { RankBadge } from '@/components/ui/RankBadge'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { daysLabel, PLAYER_LABEL, rankLabel } from '../displayLabels'
import { Row } from './StatBlocks'

/**
 * Level, rank, lifetime EXP and the current-level bar: the PLAYER STATUS window.
 * All values come from the ledger-derived `PlayerStatus`; beyond Level 100 the
 * level keeps rising and the rank reads `???` (OD-01), shown only through
 * `rankLabel`.
 */
export function PlayerSections({ player }: { player: PlayerStatus }) {
  return (
    <>
      <Panel aria-label="Player status" tone="accent" framed className="px-4 pt-4">
        {/* The region already has its accessible name; this is the visible title only. */}
        <div aria-hidden="true">
          <SectionLabel as="p">PLAYER STATUS</SectionLabel>
        </div>
        <dl>
          <Row term="Player">{PLAYER_LABEL}</Row>
          <Row term="Level" big>
            <span className="[text-shadow:0_0_14px_rgb(167_139_250/0.55)]">{player.level}</span>
          </Row>
          <Row term="Rank">
            <RankBadge label={rankLabel(player.rank)} />
          </Row>
          <Row term="Lifetime EXP">{player.totalExp}</Row>
        </dl>
      </Panel>

      <Panel aria-labelledby="level-progress-heading" className="flex flex-col gap-3 p-4">
        <SectionLabel id="level-progress-heading">CURRENT LEVEL</SectionLabel>
        <ExpProgressBar value={player.expIntoLevel} max={player.expToNext} />
      </Panel>
    </>
  )
}

/** The finalized streaks, as persisted: a day in progress is not in them. */
export function StreaksSection({ streaks }: { streaks: StreakStats }) {
  return (
    <Panel aria-label="Streaks" className="px-4">
      <dl>
        <Row term="Daily Streak">{daysLabel(streaks.currentStreak)}</Row>
        <Row term="Best Streak">{daysLabel(streaks.bestStreak)}</Row>
        <Row term="Perfect Day Streak">{daysLabel(streaks.perfectStreak)}</Row>
        <Row term="Total Perfect Days">{streaks.totalPerfectDays}</Row>
      </dl>
    </Panel>
  )
}
