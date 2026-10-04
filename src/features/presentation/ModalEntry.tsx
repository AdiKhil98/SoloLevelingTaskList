import { Component, lazy, Suspense, useCallback, type ReactNode } from 'react'
import type { EffectsMode } from '@/effects/settings'
import type { PresentationTimings } from '@/effects/timings'
import type { PresentationEntry } from '@/effects/types'
import { progressionSummary, weeklyResultSummary } from './entryText'
import { loadOverlays } from './overlayChunk'
import { OverlayFrame } from './OverlayFrame'

interface ModalEntryProps {
  entry: PresentationEntry
  mode: EffectsMode
  timings: PresentationTimings
  paused: boolean
  onFinish: () => void
}

const EntryOverlay = lazy(loadOverlays)

/**
 * The same information as the overlay, in the plain dialog shell. It is what a
 * Level Up or a weekly result falls back to if the overlay chunk cannot be
 * loaded (offline before it was cached): the player still sees every number.
 */
function PlainResult({ entry, mode, timings, paused, onFinish }: ModalEntryProps) {
  const summary = entry.kind === 'progression' ? progressionSummary(entry) : entry.kind === 'weekly_result' ? weeklyResultSummary(entry) : ''
  const heading = entry.kind === 'progression' ? (entry.rank === null ? 'LEVEL UP' : 'RANK ADVANCEMENT') : 'WEEKLY RESULT'
  const continueFallback = useCallback(() => false, [])
  return (
    <OverlayFrame
      labelledBy="plain-heading"
      describedBy="plain-summary"
      mode={mode}
      intensity="normal"
      inputGuardMs={timings.inputGuardMs}
      closeMs={timings.closeMs}
      visibleMs={timings.visibleMs(entry)}
      paused={paused}
      onContinue={continueFallback}
      onFinish={onFinish}
      entryId={entry.id}
      continueLabel="TAP TO CLOSE"
    >
      <p aria-hidden="true" className="font-display text-[0.6875rem] font-semibold tracking-[0.5em] text-accent">
        [ SYSTEM ]
      </p>
      <h2 id="plain-heading" className="mt-4 font-display text-3xl font-extrabold tracking-[0.1em] text-foreground">
        {heading}
      </h2>
      <p id="plain-summary" className="mt-4 font-display text-base text-accent-2">
        {summary}
      </p>
    </OverlayFrame>
  )
}

class OverlayBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('The overlay could not be shown; showing the plain result instead', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** A full-screen entry (major / critical): the lazy overlay, or the plain result if it cannot load. */
export function ModalEntry(props: ModalEntryProps) {
  return (
    <OverlayBoundary fallback={<PlainResult {...props} />}>
      <Suspense fallback={null}>
        <EntryOverlay {...props} />
      </Suspense>
    </OverlayBoundary>
  )
}
