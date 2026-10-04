import { Link } from 'react-router'
import { ParticleBurst } from '@/effects/ParticleBurst'
import { useState } from 'react'
import type { EffectsMode } from '@/effects/settings'
import type { PresentationTimings } from '@/effects/timings'
import { TextScramble } from '@/effects/TextScramble'
import type { WeeklyResultEntry } from '@/effects/types'
import { Typewriter } from '@/effects/Typewriter'
import { useCountUp } from '@/effects/useCountUp'
import { cn } from '@/lib/utils'
import { weeklyResultSummary, weeklyResultText } from '../entryText'
import { OverlayFrame } from '../OverlayFrame'

interface WeeklyResultOverlayProps {
  entry: WeeklyResultEntry
  mode: EffectsMode
  timings: PresentationTimings
  paused: boolean
  onFinish: () => void
}

/** Strong results get a light particle rise; a Perfect Week gets the full burst and the running light. */
const PARTICLES: Readonly<Record<WeeklyResultEntry['tier'], number>> = { restrained: 0, success: 0, strong: 50, perfect: 140 }

/**
 * The finalized Goal Crusher result (OD-20): the one weekly spectacle. It shows
 * what the domain reported: the score, the bonus EXP (counted up in normal
 * mode) and the reward tier earned, with a link to claim the reward in Weekly.
 * Claiming itself still happens there and awards no EXP.
 */
export default function WeeklyResultOverlay({ entry, mode, timings, paused, onFinish }: WeeklyResultOverlayProps) {
  const [burstEnded, setBurstEnded] = useState(false)
  const reduced = mode === 'reduced'
  const text = weeklyResultText(entry)
  const bonus = useCountUp(entry.bonusExp, timings.countMs, 0)
  const perfect = entry.tier === 'perfect'
  const particles = PARTICLES[entry.tier]

  return (
    <OverlayFrame
      labelledBy="weekly-heading"
      describedBy="weekly-summary"
      mode={mode}
      intensity={perfect ? 'high' : 'normal'}
      inputGuardMs={timings.inputGuardMs}
      closeMs={timings.closeMs}
      visibleMs={timings.visibleMs(entry)}
      paused={paused}
      onFinish={onFinish}
      continueLabel="TAP TO CLOSE"
      backdrop={
        <>
          {!reduced && particles > 0 && !burstEnded && (
            <ParticleBurst count={particles} durationMs={perfect ? 3000 : 2200} style={perfect ? 'radial' : 'rise'} onDone={() => setBurstEnded(true)} />
          )}
          {entry.tier !== 'success' && <div className="system-fx-sweep" />}
        </>
      }
    >
      <p id="weekly-summary" className="sr-only">
        {weeklyResultSummary(entry)}
      </p>

      <div
        className={cn(
          'system-fx-reveal flex w-full flex-col items-center',
          perfect && 'system-fx-trail rounded-[3px] border border-border-strong bg-surface/90 px-4 py-8',
        )}
      >
        <p aria-hidden="true" className="font-display text-[0.6875rem] font-semibold tracking-[0.5em] text-accent">
          [ SYSTEM ]
        </p>
        <h2
          id="weekly-heading"
          className="mt-4 font-display text-4xl font-extrabold tracking-[0.1em] text-foreground [text-shadow:0_0_22px_rgb(167_139_250/0.8)]"
        >
          <TextScramble text={text.heading} reduced={reduced} durationMs={timings.scrambleMs} />
        </h2>
        <p aria-hidden="true" className="mt-2 font-display text-[0.6875rem] font-semibold tracking-[0.3em] text-muted">
          GOAL CRUSHER
        </p>
        <p aria-hidden="true" className="system-fx-pop mt-5 font-display text-2xl font-bold tracking-[0.12em] text-accent-2">
          {text.score}
        </p>
        <p aria-hidden="true" className="mt-3 font-display text-lg font-semibold tabular-nums text-foreground">
          {entry.bonusExp > 0 ? `+${bonus.toLocaleString('en-US')} EXP` : text.bonus}
        </p>
        {text.reward !== null && (
          <>
            <p aria-hidden="true" className="mt-3 font-display text-xs font-semibold tracking-[0.2em] text-accent">
              {text.reward}
            </p>
            <Link
              to="/weekly"
              className="system-focus relative z-10 mt-5 inline-flex min-h-11 items-center justify-center rounded-[3px] border border-accent bg-accent/10 px-5 font-display text-xs font-semibold tracking-[0.2em] text-accent"
            >
              CLAIM IN WEEKLY
            </Link>
          </>
        )}
        <p aria-hidden="true" className="mt-6 min-h-5 font-display text-xs tracking-[0.25em] text-muted">
          <Typewriter text={text.line} reduced={reduced} durationMs={timings.typeMs} delayMs={500} />
        </p>
      </div>
    </OverlayFrame>
  )
}
