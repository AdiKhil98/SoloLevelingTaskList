import { useAppRuntime } from '@/app/runtimeContext'
import { SystemSettingsPanel } from '../presentation/SystemSettingsPanel'
import { PlayerSections, StreaksSection } from './PlayerSections'
import { AchievementsSection, DaysSection, QuestsSection, WeeklySection } from './ProfileSections'
import { LoadFailure } from './StatBlocks'
import { useLoadedData } from './useLoadedData'
import { SectionLabel } from '@/components/ui/SectionLabel'

/**
 * The player's profile. The first sections (level, rank, lifetime EXP, the level
 * bar, the finalized streaks) come straight from the runtime snapshot, so they
 * are there at once. Everything else is derived from stored history when the
 * screen opens and whenever the snapshot changes (`useLoadedData`): quest and
 * category totals from the XP ledger, day totals from the Daily Summaries, week
 * totals from the finalized boards, achievements from all three. Reading
 * changes nothing.
 */
export function StatusPage() {
  const { snapshot, profile } = useAppRuntime()
  const { state, retry } = useLoadedData(profile.loadProfile, snapshot)

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel as="h1" className="text-sm tracking-[0.3em] text-accent">STATUS</SectionLabel>

      <PlayerSections player={snapshot.player} />
      <StreaksSection streaks={snapshot.streaks} />

      {state.status === 'loading' && <p className="text-muted">Loading statistics…</p>}
      {state.status === 'failed' && <LoadFailure what="Your statistics" onRetry={retry} />}
      {state.status === 'ok' && (
        <>
          <DaysSection days={state.value.days} />
          <QuestsSection profile={state.value} />
          <WeeklySection weekly={state.value.weekly} />
          <AchievementsSection achievements={state.value.achievements} />
        </>
      )}

      <SystemSettingsPanel />
    </div>
  )
}
