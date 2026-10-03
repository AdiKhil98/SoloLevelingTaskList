import { Link } from 'react-router'
import { useAppRuntime } from '@/app/runtimeContext'
import { ACHIEVEMENT_GROUP_ORDER, achievementGroupLabel } from '../displayLabels'
import { BUTTON } from '../status/styles'
import { LoadFailure } from '../status/StatBlocks'
import { useLoadedData } from '../status/useLoadedData'
import { AchievementItem } from './AchievementItem'

/**
 * Every achievement, grouped, in catalog order, unlocked or locked. All of it is
 * derived from stored history each time the screen opens (nothing about an
 * unlock is stored): an achievement is unlocked exactly when history says it
 * qualified, and shows the date of the record that first qualified it.
 * Achievements award no EXP.
 */
export function AchievementsPage() {
  const { snapshot, profile } = useAppRuntime()
  const { state, retry } = useLoadedData(profile.loadAchievements, snapshot)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold tracking-[0.4em] text-accent">ACHIEVEMENTS</h1>
        <Link to="/status" className={BUTTON}>
          Back
        </Link>
      </div>

      {state.status === 'loading' && <p className="text-muted">Loading achievements…</p>}
      {state.status === 'failed' && <LoadFailure what="Your achievements" onRetry={retry} />}

      {state.status === 'ok' && (
        <>
          <p className="text-sm">
            <span className="text-2xl font-semibold tabular-nums">
              {state.value.unlockedCount} / {state.value.totalCount}
            </span>{' '}
            <span className="text-muted">unlocked</span>
          </p>
          <p className="text-sm text-muted">Trophies only: achievements award no EXP. Days and weeks count once they are finalized.</p>

          {ACHIEVEMENT_GROUP_ORDER.map((group) => {
            const items = state.value.achievements.filter((status) => status.definition.group === group)
            if (items.length === 0) return null
            return (
              <section key={group} aria-labelledby={`achievements-${group}`} className="flex flex-col gap-2">
                <h2 id={`achievements-${group}`} className="text-xs tracking-[0.3em] text-muted">
                  {achievementGroupLabel(group).toUpperCase()}
                </h2>
                <ul aria-label={`${achievementGroupLabel(group)} achievements`} className="flex flex-col gap-2">
                  {items.map((status) => (
                    <AchievementItem key={status.definition.id} status={status} />
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
