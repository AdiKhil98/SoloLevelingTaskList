import type { PlayerStatus, StreakStats } from '@/application'
import { ExpProgressBar } from '@/components/ui/ExpProgressBar'
import { daysLabel, PLAYER_LABEL, rankLabel } from '../displayLabels'
import { Row } from './StatBlocks'

/**
 * Level, rank, lifetime EXP and the current-level bar. All values come from the
 * ledger-derived `PlayerStatus`; beyond Level 100 the level keeps rising and the
 * rank reads `???` (OD-01), shown only through `rankLabel`.
 */
export function PlayerSections({ player }: { player: PlayerStatus }) {
  return (
    <>
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
    </>
  )
}

/** The finalized streaks, as persisted: a day in progress is not in them. */
export function StreaksSection({ streaks }: { streaks: StreakStats }) {
  return (
    <section aria-label="Streaks" className="rounded-xl border border-border bg-surface px-4">
      <dl>
        <Row term="Daily Streak">{daysLabel(streaks.currentStreak)}</Row>
        <Row term="Best Streak">{daysLabel(streaks.bestStreak)}</Row>
        <Row term="Perfect Day Streak">{daysLabel(streaks.perfectStreak)}</Row>
        <Row term="Total Perfect Days">{streaks.totalPerfectDays}</Row>
      </dl>
    </section>
  )
}
