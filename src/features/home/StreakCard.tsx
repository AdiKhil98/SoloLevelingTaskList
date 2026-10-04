import type { StreakStats } from '@/application'
import { Panel } from '@/components/ui/Panel'
import { SectionLabel } from '@/components/ui/SectionLabel'
import type { DayQuality } from '@/domain'
import { isStreakSecured } from '@/domain'
import { daysLabel } from '../displayLabels'

/**
 * The finalized Daily Streak. The number is the persisted one (it changes only
 * when a day is finalized); "STREAK SECURED" is a live hint that today already
 * meets the Completed threshold, so the streak will continue at midnight.
 * Restrained on purpose: the flame and glow treatments are a later phase.
 */
export function StreakCard({ streaks, quality }: { streaks: StreakStats; quality: DayQuality }) {
  const secured = isStreakSecured(quality)
  return (
    <Panel aria-labelledby="streak-heading" className="flex flex-col gap-2 p-3.5">
      <SectionLabel id="streak-heading" className="text-[0.6875rem] tracking-[0.1em]">DAILY STREAK</SectionLabel>
      <p className="font-display text-2xl leading-tight font-bold tabular-nums">{daysLabel(streaks.currentStreak)}</p>
      {secured && <p className="font-display text-xs font-semibold tracking-[0.14em] text-accent-2">STREAK SECURED</p>}
    </Panel>
  )
}
