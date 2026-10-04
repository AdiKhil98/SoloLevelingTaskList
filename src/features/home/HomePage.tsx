import { Plus } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { TodayQuest } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { BUTTON, EMPTY_STATE, NOTICE_DANGER } from '@/components/ui/styles'
import { cn } from '@/lib/utils'
import { ClockBehindNotice } from './ClockBehindNotice'
import { DailyMessageCard } from './DailyMessageCard'
import { DailyProgressCard } from './DailyProgressCard'
import { noticeForCompletion, type Notice } from './completionNotice'
import { LifecycleNoticeBanner } from './LifecycleNoticeBanner'
import { PlayerSummary } from './PlayerSummary'
import { QuestCard } from './QuestCard'
import { StreakCard } from './StreakCard'
import { WeeklyCard } from './WeeklyCard'

/**
 * Home: SYSTEM header, player, Daily Message, today's progress and today's
 * quests. It renders the stored state the runtime provides and forwards taps to
 * the application layer; it decides nothing about EXP, levels or eligibility.
 *
 * Completing the Sleep quest opens the live Daily Report. That is only a view:
 * it does not finalize anything or move the day.
 */
export function HomePage() {
  const { snapshot, completeQuest, reload, lifecycleNotice, dismissLifecycleNotice } = useAppRuntime()
  const { today, player, streaks, clock, dailyMessage, weekly } = snapshot
  const navigate = useNavigate()

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [notice, setNotice] = useState<Notice | null>(null)
  // Synchronous guard against a double tap in the same tick. Persistence is the
  // real protection against duplicate EXP; this just avoids a pointless round trip.
  const inFlight = useRef(new Set<string>())

  const handleComplete = useCallback(
    async (quest: TodayQuest) => {
      const id = quest.occurrenceId
      if (inFlight.current.has(id)) return
      inFlight.current.add(id)
      setPendingIds(new Set(inFlight.current))
      setNotice(null)
      try {
        const result = await completeQuest(id)
        if (result.status === 'failed') console.error('Quest completion failed', result.cause)
        setNotice(noticeForCompletion(quest, result))
        if (result.status === 'completed' && quest.role === 'sleep') void navigate('/report')
      } finally {
        inFlight.current.delete(id)
        setPendingIds(new Set(inFlight.current))
      }
    },
    [completeQuest, navigate],
  )

  const handleRefresh = useCallback(() => {
    setNotice(null)
    void reload()
  }, [reload])

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel as="h1" className="text-sm tracking-[0.3em] text-accent">
          SYSTEM
        </SectionLabel>
        {clock.status === 'ok' && (
          <Link
            to="/quests/new"
            aria-label="Add Quest"
            className="system-focus inline-flex size-12 items-center justify-center rounded-[3px] border border-accent/60 bg-accent/10 text-accent active:bg-accent/20"
          >
            <Plus aria-hidden="true" className="size-6" />
          </Link>
        )}
      </div>

      {lifecycleNotice !== null && <LifecycleNoticeBanner notice={lifecycleNotice} onDismiss={dismissLifecycleNotice} />}

      <PlayerSummary player={player} />

      {clock.status === 'behind' ? (
        <ClockBehindNotice clock={clock} />
      ) : (
        <>
          <DailyMessageCard text={dailyMessage.text} />
          {/* Two tiles side by side from 360 px up; stacked on the narrowest phones. */}
          <div className="grid grid-cols-1 gap-3.5 min-[360px]:grid-cols-2">
            <DailyProgressCard progress={today.progress} />
            <StreakCard streaks={streaks} quality={today.progress.quality} />
          </div>
          <WeeklyCard weekly={weekly} />

          <section aria-labelledby="quests-heading" className="flex flex-col">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <SectionLabel id="quests-heading">DAILY QUESTS</SectionLabel>
              {today.progress.eligibleCount > 0 && (
                // Duplicates the TODAY tile for sighted players only (hence aria-hidden, and no spaces around the slash).
                <span aria-hidden="true" className="font-display text-xs font-semibold tabular-nums text-muted">
                  {today.progress.completedCount}/{today.progress.eligibleCount} DONE
                </span>
              )}
            </div>

            {/* Stays in the page (empty) so screen readers announce text added to it. */}
            <p role="status" className="mb-3 text-sm text-accent empty:mb-0">
              {notice?.tone === 'success' ? notice.text : ''}
            </p>
            {notice?.tone === 'error' && (
              <div role="alert" className={cn(NOTICE_DANGER, 'mb-3 flex flex-col items-start gap-2')}>
                <p>{notice.text}</p>
                {notice.canRefresh && (
                  <button type="button" onClick={handleRefresh} className={BUTTON}>
                    Refresh
                  </button>
                )}
              </div>
            )}

            {today.quests.length === 0 ? (
              <p className={EMPTY_STATE}>Nothing is scheduled for today.</p>
            ) : (
              <ul aria-label="Today’s quests" className="flex flex-col gap-2.5">
                {today.quests.map((quest) => (
                  <QuestCard
                    key={quest.occurrenceId}
                    quest={quest}
                    pending={pendingIds.has(quest.occurrenceId)}
                    onComplete={handleComplete}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
