import { History } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { FinalizedWeekView, WeeklyGoalView, WeeklyScreen } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { ActiveBoardCard } from './ActiveBoardCard'
import { FinalizedWeekCard } from './FinalizedWeekCard'
import { useWeeklyFlash, WEEKLY_FLASH_TEXT } from './useWeeklyFlash'
import { describeClaimResult, formatWeekRange, progressRejectionText, weeklyFailureText } from './weeklyMessages'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { BUTTON, BUTTON_PRIMARY } from '@/components/ui/styles'

type ScreenState =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly screen: WeeklyScreen }
  | { readonly status: 'failed' }

const PRIMARY_LINK = BUTTON_PRIMARY + ' min-h-12'

/**
 * The Weekly Goal Crusher: this week's board (or the invitation to set one),
 * the player's progress on it, and the most recent finished week with its reward
 * claim. It displays what the application layer derived and forwards the
 * player's intent (update a count, claim a reward); it decides no score, no
 * completion and no bonus.
 */
export function WeeklyPage() {
  const { weekly, snapshot } = useAppRuntime()
  const flash = useWeeklyFlash()

  const [state, setState] = useState<ScreenState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState<string | null>(flash === null ? null : WEEKLY_FLASH_TEXT[flash])
  const [errorText, setErrorText] = useState<string | null>(null)
  const [claimingWeek, setClaimingWeek] = useState<string | null>(null)

  // Reload whenever stored state may have changed: after an action here, and when the
  // runtime's snapshot is replaced (a day change, a quest completion, a saved board).
  useEffect(() => {
    let cancelled = false
    void weekly.loadScreen().then((result) => {
      if (cancelled) return
      if (result.status === 'ok') {
        setState({ status: 'ok', screen: result.screen })
      } else {
        console.error('Loading the weekly screen failed', result.cause)
        setState({ status: 'failed' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [weekly, snapshot, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])

  const handleSetProgress = useCallback(
    async (goal: WeeklyGoalView, progress: number): Promise<string | null> => {
      setNotice(null)
      setErrorText(null)
      const result = await weekly.setProgress(goal.id, progress)
      switch (result.status) {
        case 'updated':
          if (result.events.some((event) => event.type === 'WeeklyGoalCompleted' && event.goalId === goal.id)) {
            setNotice(`Goal complete: ${goal.title}.`)
          }
          return null
        case 'unchanged':
          return null
        case 'rejected':
          reload()
          return progressRejectionText(result.reason)
        case 'failed':
          console.error('Updating weekly progress failed', result.cause)
          return weeklyFailureText(result.reason)
      }
    },
    [weekly, reload],
  )

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

  const screen = state.status === 'ok' ? state.screen : null
  const paused = screen !== null && screen.clock.status === 'behind'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel as="h1" className="text-sm tracking-[0.3em] text-accent">WEEKLY</SectionLabel>
        <Link
          to="/weekly/history"
          className={BUTTON + ' gap-1.5'}
        >
          <History aria-hidden="true" className="size-5" />
          History
        </Link>
      </div>

      {screen !== null && <p className="text-sm text-muted">{formatWeekRange(screen.startDate, screen.endDate)}</p>}

      {/* Stays in the page (empty) so screen readers announce text added to it. */}
      <p role="status" className="text-sm text-accent empty:hidden">
        {notice ?? ''}
      </p>
      {errorText !== null && (
        <p role="alert" className="rounded-[3px] border border-danger/50 bg-danger/10 p-3 text-sm">
          {errorText}
        </p>
      )}

      {state.status === 'loading' && <p className="text-muted">Loading your week…</p>}

      {state.status === 'failed' && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-[3px] border border-danger/50 bg-danger/10 p-3 text-sm">
          <p>Your week could not be loaded.</p>
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

      {screen !== null && paused && (
        <p role="alert" className="rounded-[3px] border border-warning/50 bg-warning/10 p-3 text-sm">
          This device’s clock is behind your last recorded day, so changes are paused. Your weekly board is safe and nothing was changed.
        </p>
      )}

      {screen !== null && screen.current.kind === 'none' && (
        <section aria-labelledby="setup-heading" className="flex flex-col gap-3 rounded-[3px] border border-dashed border-accent/60 p-4">
          <SectionLabel id="setup-heading" className="text-accent">SET THIS WEEK’S GOAL CRUSHERS</SectionLabel>
          <p className="text-sm text-muted">
            Choose a few goals for this week and split 10 points between them. Earn 6 or more points for bonus EXP and a reward.
          </p>
          {!paused && (
            <Link to="/weekly/edit" className={PRIMARY_LINK}>
              Set up goals
            </Link>
          )}
        </section>
      )}

      {screen !== null && screen.current.kind === 'active' && (
        <ActiveBoardCard board={screen.current.board} onSetProgress={handleSetProgress} canEdit={!paused} />
      )}

      {screen !== null && screen.current.kind === 'finalized' && (
        <FinalizedWeekCard
          week={screen.current.week}
          heading="THIS WEEK (FINAL)"
          claiming={claimingWeek === screen.current.week.weekKey}
          onClaim={handleClaim}
          canClaim={!paused}
        />
      )}

      {screen !== null && screen.latestFinalized !== null && (
        <FinalizedWeekCard
          week={screen.latestFinalized}
          heading="LAST RESULT"
          claiming={claimingWeek === screen.latestFinalized.weekKey}
          onClaim={handleClaim}
          canClaim={!paused}
        />
      )}
    </div>
  )
}
