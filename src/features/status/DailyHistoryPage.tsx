import { useState } from 'react'
import { Link } from 'react-router'
import type { DailyHistoryEntry } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { dayQualityLabel, daysLabel, formatDateKey } from '../displayLabels'
import { LoadFailure } from './StatBlocks'
import { BUTTON } from './styles'
import { useLoadedData } from './useLoadedData'

/** How many days the list shows before "Show more". */
const PAGE_SIZE = 30

function DayItem({ day }: { day: DailyHistoryEntry }) {
  const empty = day.quality === 'no_active_quests'
  return (
    <li className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-semibold break-words">{formatDateKey(day.dateKey)}</p>
        <p className={`shrink-0 text-right text-sm font-medium ${day.quality === 'perfect' ? 'text-accent' : 'text-muted'}`}>{dayQualityLabel(day.quality)}</p>
      </div>
      {empty ? (
        <p className="text-sm text-muted">No quests were scheduled. The streak did not change.</p>
      ) : (
        <p className="flex flex-wrap justify-between gap-x-3 text-sm">
          <span className="tabular-nums">
            {day.completedCount} / {day.eligibleCount} quests · {day.displayPercent}%
          </span>
          <span className="text-muted tabular-nums">+{day.questExp} EXP</span>
        </p>
      )}
      {!empty && <p className="text-sm text-muted">Streak after: {daysLabel(day.streakAfter)}</p>}
    </li>
  )
}

/**
 * Every finalized day, newest first, from the immutable Daily Summaries. The day
 * in progress is not listed (it has no summary yet). A plain list: no charts.
 */
export function DailyHistoryPage() {
  const { snapshot, profile } = useAppRuntime()
  const { state, retry } = useLoadedData(profile.loadDailyHistory, snapshot)
  const [shown, setShown] = useState(PAGE_SIZE)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold tracking-[0.4em] text-accent">DAILY HISTORY</h1>
        <Link to="/status" className={BUTTON}>
          Back
        </Link>
      </div>

      {state.status === 'loading' && <p className="text-muted">Loading history…</p>}
      {state.status === 'failed' && <LoadFailure what="Your daily history" onRetry={retry} />}

      {state.status === 'ok' &&
        (state.value.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-muted">
            No finished days yet. A day is finalized at midnight.
          </p>
        ) : (
          <>
            <ul aria-label="Finalized days" className="flex flex-col gap-3">
              {state.value.slice(0, shown).map((day) => (
                <DayItem key={day.dateKey} day={day} />
              ))}
            </ul>
            {state.value.length > shown && (
              <button type="button" onClick={() => setShown((count) => count + PAGE_SIZE)} className={`${BUTTON} w-full`}>
                Show more ({state.value.length - shown} older)
              </button>
            )}
          </>
        ))}
    </div>
  )
}
