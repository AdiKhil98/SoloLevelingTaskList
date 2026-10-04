import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { FinalizedWeekView } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { FinalizedWeekCard } from './FinalizedWeekCard'
import { describeClaimResult } from './weeklyMessages'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { BUTTON } from '@/components/ui/styles'

type HistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly weeks: readonly FinalizedWeekView[] }
  | { readonly status: 'failed' }

/**
 * Basic Weekly History: every finalized week, newest first, from each board's
 * frozen snapshot. Weeks without a board are simply absent. No charts: broader
 * statistics and history belong to a later phase.
 */
export function WeeklyHistoryPage() {
  const { weekly, snapshot } = useAppRuntime()
  const [state, setState] = useState<HistoryState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [claimingWeek, setClaimingWeek] = useState<string | null>(null)
  const paused = snapshot.clock.status === 'behind'

  useEffect(() => {
    let cancelled = false
    void weekly.loadHistory().then((result) => {
      if (cancelled) return
      if (result.status === 'ok') {
        setState({ status: 'ok', weeks: result.weeks })
      } else {
        console.error('Loading the weekly history failed', result.cause)
        setState({ status: 'failed' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [weekly, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])

  const handleClaim = useCallback(
    async (week: FinalizedWeekView) => {
      if (claimingWeek !== null) return
      setClaimingWeek(week.weekKey)
      setNotice(null)
      setErrorText(null)
      try {
        const outcome = describeClaimResult(await weekly.claim(week.weekKey))
        if (outcome.tone === 'success') setNotice(outcome.text)
        else setErrorText(outcome.text)
        reload()
      } finally {
        setClaimingWeek(null)
      }
    },
    [claimingWeek, weekly, reload],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel as="h1" className="text-sm tracking-[0.3em] text-accent">WEEKLY HISTORY</SectionLabel>
        <Link
          to="/weekly"
          className={BUTTON}
        >
          Back
        </Link>
      </div>

      <p role="status" className="text-sm text-accent empty:hidden">
        {notice ?? ''}
      </p>
      {errorText !== null && (
        <p role="alert" className="rounded-[3px] border border-danger/50 bg-danger/10 p-3 text-sm">
          {errorText}
        </p>
      )}

      {state.status === 'loading' && <p className="text-muted">Loading history…</p>}

      {state.status === 'failed' && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-[3px] border border-danger/50 bg-danger/10 p-3 text-sm">
          <p>Your weekly history could not be loaded.</p>
          <button
            type="button"
            onClick={() => {
              setState({ status: 'loading' })
              reload()
            }}
            className={BUTTON}
          >
            Retry
          </button>
        </div>
      )}

      {state.status === 'ok' &&
        (state.weeks.length === 0 ? (
          <p className="rounded-[3px] border border-dashed border-border p-4 text-center text-muted">
            No finished weeks yet. A week is finalized after its Sunday.
          </p>
        ) : (
          <ul aria-label="Finished weeks" className="flex flex-col gap-3">
            {state.weeks.map((week) => (
              <li key={week.weekKey}>
                <FinalizedWeekCard
                  week={week}
                  heading="WEEK"
                  claiming={claimingWeek === week.weekKey}
                  onClaim={handleClaim}
                  canClaim={!paused}
                />
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
