import { useCallback, useState } from 'react'
import { ParticleBurst } from '@/effects/ParticleBurst'
import type { EffectsMode } from '@/effects/settings'
import type { PresentationTimings } from '@/effects/timings'
import { TextScramble } from '@/effects/TextScramble'
import type { ProgressionEntry } from '@/effects/types'
import { Typewriter } from '@/effects/Typewriter'
import { cn } from '@/lib/utils'
import { expText, levelPhaseText, progressionSummary, rankPhaseText, type PhaseText } from '../entryText'
import { OverlayFrame } from '../OverlayFrame'

interface ProgressionOverlayProps {
  entry: ProgressionEntry
  mode: EffectsMode
  timings: PresentationTimings
  paused: boolean
  onFinish: () => void
}

const LEVEL_PARTICLES = 60
const RANK_PARTICLES = 110

/**
 * Level Up, and (when the award also crossed a rank boundary) the rank
 * advancement that follows it, as ONE overlay with up to two phases:
 * `LV. 9 → LV. 12`, then `E-RANK → D-RANK`. A tap, or the timer, moves from the
 * first phase to the second, and then closes it. The levels and ranks shown are
 * the ones the domain reported; at Level 100 the new rank reads `???`.
 */
export default function ProgressionOverlay({ entry, mode, timings, paused, onFinish }: ProgressionOverlayProps) {
  const level = levelPhaseText(entry)
  const rank = rankPhaseText(entry)
  const phases = [level, rank].filter((phase): phase is PhaseText => phase !== null)
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [burstEndedFor, setBurstEndedFor] = useState(-1)
  const hasNext = phaseIndex < phases.length - 1

  const advance = useCallback(() => {
    if (!hasNext) return false
    setPhaseIndex((current) => current + 1)
    return true
  }, [hasNext])

  const phase = phases[phaseIndex]
  if (phase === undefined) return null
  const isRank = phase === rank
  const reduced = mode === 'reduced'
  const exp = expText(entry.expGained)

  // With two phases the entry's time is split evenly between them.
  const total = timings.visibleMs(entry)
  const firstHalf = Math.floor(total / 2)
  const visibleMs = phases.length === 2 ? (phaseIndex === 0 ? firstHalf : total - firstHalf) : total

  return (
    <OverlayFrame
      labelledBy="progression-heading"
      describedBy="progression-summary"
      mode={mode}
      intensity={isRank ? 'high' : 'normal'}
      inputGuardMs={timings.inputGuardMs}
      closeMs={timings.closeMs}
      visibleMs={visibleMs}
      paused={paused}
      phaseKey={phaseIndex}
      onContinue={advance}
      onFinish={onFinish}
      entryId={entry.id}
      continueLabel={hasNext ? 'TAP TO CONTINUE' : 'TAP TO CLOSE'}
      backdrop={
        <>
          {!reduced && burstEndedFor !== phaseIndex && (
            <ParticleBurst
              key={phaseIndex}
              count={isRank ? RANK_PARTICLES : LEVEL_PARTICLES}
              durationMs={isRank ? 2600 : 2000}
              style="radial"
              onDone={() => setBurstEndedFor(phaseIndex)}
            />
          )}
          <div key={`sweep-${phaseIndex}`} className="system-fx-sweep" />
        </>
      }
    >
      <p id="progression-summary" className="sr-only">
        {progressionSummary(entry)}
      </p>

      <div
        key={phaseIndex}
        className={cn(
          'system-fx-reveal flex w-full flex-col items-center',
          isRank && 'system-fx-trail rounded-[3px] border border-border-strong bg-surface/90 px-4 py-8',
        )}
      >
        <p aria-hidden="true" className="font-display text-[0.6875rem] font-semibold tracking-[0.5em] text-accent">
          [ SYSTEM ]
        </p>
        <h2
          id="progression-heading"
          className={cn(
            'mt-4 font-display font-extrabold text-foreground [text-shadow:0_0_22px_rgb(167_139_250/0.8)]',
            isRank ? 'text-3xl tracking-[0.1em]' : 'text-5xl tracking-[0.12em]',
          )}
        >
          <TextScramble text={phase.heading} reduced={reduced} durationMs={timings.scrambleMs} />
        </h2>
        {/* Sized so "LV. 100" and "S-RANK → ???" fit a 320 px screen on one line; wraps rather than overflows if a very long value ever appears. */}
        <p aria-hidden="true" className="mt-7 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 font-display whitespace-nowrap">
          <span className="text-xl font-semibold text-muted">{phase.from}</span>
          <span className="text-accent">→</span>
          <span className="system-fx-pop text-4xl font-extrabold text-accent-2 [text-shadow:0_0_20px_rgb(34_211_238/0.6)]">{phase.to}</span>
        </p>
        {phase.detail !== null && (
          <p aria-hidden="true" className="mt-3 font-display text-sm font-semibold tracking-[0.2em] text-accent">
            {phase.detail}
          </p>
        )}
        {exp !== null && !isRank && (
          <p aria-hidden="true" className="mt-4 font-display text-sm font-semibold tracking-[0.2em] text-accent-2/90">
            {exp}
          </p>
        )}
        <p aria-hidden="true" className="mt-6 min-h-5 font-display text-xs tracking-[0.25em] text-muted">
          <Typewriter text={phase.line} reduced={reduced} durationMs={timings.typeMs} delayMs={500} />
        </p>
      </div>
    </OverlayFrame>
  )
}
