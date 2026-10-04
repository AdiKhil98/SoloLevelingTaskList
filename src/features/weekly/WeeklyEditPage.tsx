import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { LoadWeeklyEditorResult, WeeklyBoardFormValues } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { WeeklyBoardForm, type WeeklyFormOutcome } from './WeeklyBoardForm'
import { saveRejectionText, weeklyFailureText } from './weeklyMessages'

const BACK_LINK =
  'mt-2 inline-flex min-h-11 w-fit items-center rounded-[3px] border border-border px-4 system-focus'

function Unavailable({ heading, children }: { heading: string; children: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="font-display text-2xl font-semibold">{heading}</h1>
      <p className="text-muted">{children}</p>
      <Link to="/weekly" className={BACK_LINK}>
        Back to Weekly
      </Link>
    </section>
  )
}

/**
 * Create or edit the CURRENT week's board. The form is loaded from stored
 * state (the board's revision rides along so a stale save is detected); a week
 * that is already final shows a message instead of a form.
 */
export function WeeklyEditPage() {
  const { weekly, snapshot } = useAppRuntime()
  const navigate = useNavigate()
  const paused = snapshot.clock.status === 'behind'
  const [loaded, setLoaded] = useState<LoadWeeklyEditorResult | null>(null)

  useEffect(() => {
    let cancelled = false
    void weekly.loadEditor().then((result) => {
      if (!cancelled) setLoaded(result)
    })
    return () => {
      cancelled = true
    }
  }, [weekly])

  const handleSubmit = useCallback(
    async (values: WeeklyBoardFormValues): Promise<WeeklyFormOutcome> => {
      const result = await weekly.save(values)
      switch (result.status) {
        case 'created':
        case 'updated':
          await navigate('/weekly', { state: { notice: result.status } })
          return { status: 'saved' }
        case 'invalid':
          return { status: 'invalid', errors: result.errors }
        case 'rejected':
          return { status: 'error', message: saveRejectionText(result.reason) }
        case 'failed':
          console.error('Saving the weekly board failed', result.cause)
          return { status: 'error', message: weeklyFailureText(result.reason) }
      }
    },
    [weekly, navigate],
  )

  if (loaded === null) return <p className="text-muted">Loading your week…</p>
  if (paused) {
    return <Unavailable heading="Changes paused">This device’s clock is behind your last recorded day, so changes are paused. Nothing was changed.</Unavailable>
  }

  switch (loaded.status) {
    case 'finalized':
      return <Unavailable heading="Week finalized">This week is already final, so its board can no longer be changed.</Unavailable>
    case 'failed':
      return <Unavailable heading="Weekly goals unavailable">Your weekly board could not be loaded right now.</Unavailable>
    case 'ok':
      return (
        <WeeklyBoardForm
          key={`${loaded.weekKey}:${loaded.values.revision ?? 'new'}`}
          mode={loaded.mode}
          startDate={loaded.startDate}
          endDate={loaded.endDate}
          initial={loaded.values}
          quests={loaded.quests}
          onSubmit={handleSubmit}
          cancelTo="/weekly"
        />
      )
  }
}
