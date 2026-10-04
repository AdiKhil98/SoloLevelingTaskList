import { useState } from 'react'
import type { Difficulty, DomainEvent } from '@/domain'
import { planPresentation } from '@/effects/plan'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { BUTTON, NOTICE_WARNING } from '@/components/ui/styles'
import { QuestCard } from '../../home/QuestCard'
import { usePresentationRuntime, useEffectsSnapshot } from '../usePresentation'
import { achievements, levelUp, perfectDay, questCompletion, weeklyGoal, weeklyResult } from './syntheticEvents'

/**
 * DEVELOPMENT ONLY (`/dev/effects`). A bench for the earned-event effects: each
 * button builds synthetic domain events and hands them to the presentation
 * queue, exactly as a real action would. It never calls the application or
 * persistence layers and never touches game state, the database or the clock,
 * so nothing here can change progression. It is not in the route table of a
 * production build.
 */

interface Preset {
  readonly label: string
  readonly events: () => DomainEvent[]
}

const PRESETS: readonly { readonly group: string; readonly presets: readonly Preset[] }[] = [
  {
    group: 'Quest and day',
    presets: [
      { label: 'Perfect Day (live)', events: perfectDay },
      { label: 'Weekly goal reached (3/10)', events: () => weeklyGoal(3) },
      { label: 'All weekly goals (10/10, live)', events: () => weeklyGoal(10) },
    ],
  },
  {
    group: 'Achievements',
    presets: [
      { label: 'Achievement ×1', events: () => achievements(1) },
      { label: 'Achievements ×3', events: () => achievements(3) },
    ],
  },
  {
    group: 'Level and rank',
    presets: [
      { label: 'Level Up (LV. 4 → 5)', events: () => levelUp(4, 1) },
      { label: 'Multi-level (LV. 6 → 9)', events: () => levelUp(6, 3) },
      { label: 'Level + Rank (LV. 9 → 12, D)', events: () => levelUp(9, 3) },
      { label: 'Rank (LV. 34 → 35, B)', events: () => levelUp(34, 1) },
      { label: 'Level 100 (S → ???)', events: () => levelUp(99, 1) },
      { label: 'Level 101 (rank stays ???)', events: () => levelUp(100, 1) },
    ],
  },
  {
    group: 'Weekly result (finalized)',
    presets: [
      { label: 'Score 3 — restrained', events: () => weeklyResult(3, 0) },
      { label: 'Score 6 — success', events: () => weeklyResult(6, 100) },
      { label: 'Score 8 — strong', events: () => weeklyResult(8, 225) },
      { label: 'Score 10 — PERFECT WEEK', events: () => weeklyResult(10, 500) },
    ],
  },
]

const FAKE_QUEST = (occurrenceId: string, difficulty: Difficulty, expReward: number) => ({
  occurrenceId,
  templateId: 'lab-template',
  title: `Lab quest (${difficulty})`,
  difficulty,
  category: 'discipline' as const,
  expReward,
  role: 'standard' as const,
  completed: true,
  completedAt: null,
})

export default function EffectsLab() {
  const runtime = usePresentationRuntime()
  const [row, setRow] = useState<{ id: string; difficulty: Difficulty; exp: number } | null>(null)
  const [presses, setPresses] = useState(0)

  if (runtime === null) return null
  const { controller } = runtime

  function play(events: DomainEvent[]) {
    controller.enqueue(planPresentation(events, { origin: 'action' }))
    setPresses((count) => count + 1)
  }

  function playQuest(difficulty: Difficulty, exp: number) {
    const id = `lab-occ-${presses + 1}`
    setRow({ id, difficulty, exp })
    play(questCompletion(id, difficulty, exp))
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel as="h1" className="text-sm tracking-[0.3em] text-accent">EFFECTS LAB</SectionLabel>
      <p className={NOTICE_WARNING}>
        Development only. These buttons send synthetic events to the presentation queue. Nothing here changes your progress, storage or clock.
      </p>
      <Mode runtime={runtime} />

      <section aria-labelledby="lab-quest" className="flex flex-col gap-2">
        <SectionLabel id="lab-quest">QUEST FEEDBACK</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} onClick={() => playQuest('D', 20)}>Complete D (+20)</button>
          <button type="button" className={BUTTON} onClick={() => playQuest('B', 55)}>Complete B (+55)</button>
          <button type="button" className={BUTTON} onClick={() => playQuest('S', 120)}>Complete S (+120)</button>
        </div>
        {row !== null && (
          <ul aria-label="Lab quest" className="flex flex-col gap-2.5">
            <QuestCard key={row.id} quest={FAKE_QUEST(row.id, row.difficulty, row.exp)} pending={false} onComplete={() => undefined} />
          </ul>
        )}
      </section>

      {PRESETS.map(({ group, presets }) => (
        <section key={group} aria-label={group} className="flex flex-col gap-2">
          <SectionLabel>{group.toUpperCase()}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {presets.map(({ label, events }) => (
              <button key={label} type="button" className={BUTTON} onClick={() => play(events())}>
                {label}
              </button>
            ))}
          </div>
        </section>
      ))}

      <section aria-label="Queue" className="flex flex-col gap-2">
        <SectionLabel>QUEUE</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              play(achievements(1))
              play(levelUp(9, 3))
              play(weeklyResult(8, 225))
            }}
          >
            Several at once
          </button>
          <button type="button" className={BUTTON} onClick={() => controller.dispatch({ type: 'clear' })}>
            Clear queue
          </button>
        </div>
      </section>
    </div>
  )
}

function Mode({ runtime }: { runtime: NonNullable<ReturnType<typeof usePresentationRuntime>> }) {
  const snapshot = useEffectsSnapshot(runtime)
  return (
    <p className="text-sm text-muted">
      Effects: <span className="font-semibold text-foreground">{snapshot.mode.toUpperCase()}</span>
      {snapshot.osReducedMotion ? ' (the device asks for reduced motion)' : ''}. Change it under Status → System Settings.
    </p>
  )
}
