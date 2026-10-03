import { Plus } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { TodayQuest } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { DailyMessageCard } from './DailyMessageCard'
import { DailyProgressCard } from './DailyProgressCard'
import { noticeForCompletion, type Notice } from './completionNotice'
import { PlayerSummary } from './PlayerSummary'
import { QuestCard } from './QuestCard'

/**
 * Home: SYSTEM header, player, Daily Message, today's progress and today's
 * quests. It renders the stored state the runtime provides and forwards taps to
 * the application layer; it decides nothing about EXP, levels or eligibility.
 */
export function HomePage() {
  const { snapshot, completeQuest, reload } = useAppRuntime()
  const { today, player, dailyMessage } = snapshot

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
      } finally {
        inFlight.current.delete(id)
        setPendingIds(new Set(inFlight.current))
      }
    },
    [completeQuest],
  )

  const handleRefresh = useCallback(() => {
    setNotice(null)
    void reload()
  }, [reload])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold tracking-[0.4em] text-accent">SYSTEM</h1>
        <Link
          to="/quests/new"
          aria-label="Add Quest"
          className="inline-flex size-12 items-center justify-center rounded-full border border-accent/60 text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15"
        >
          <Plus aria-hidden="true" className="size-6" />
        </Link>
      </div>

      <PlayerSummary player={player} />
      <DailyMessageCard text={dailyMessage.text} />
      <DailyProgressCard progress={today.progress} />

      <section aria-labelledby="quests-heading" className="flex flex-col">
        <h2 id="quests-heading" className="mb-3 text-xs tracking-[0.3em] text-muted">
          DAILY QUESTS
        </h2>

        {/* Stays in the page (empty) so screen readers announce text added to it. */}
        <p role="status" className="mb-3 text-sm text-accent empty:mb-0">
          {notice?.tone === 'success' ? notice.text : ''}
        </p>
        {notice?.tone === 'error' && (
          <div role="alert" className="mb-3 flex flex-col items-start gap-2 rounded-xl border border-red-400/50 bg-red-500/10 p-3 text-sm">
            <p>{notice.text}</p>
            {notice.canRefresh && (
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15"
              >
                Refresh
              </button>
            )}
          </div>
        )}

        {today.quests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-muted">
            Nothing is scheduled for today.
          </p>
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
    </div>
  )
}
