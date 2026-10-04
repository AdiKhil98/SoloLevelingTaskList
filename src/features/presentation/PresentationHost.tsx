import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router'
import { firstHeldEntryId } from '@/effects/queue'
import type { EffectsMode } from '@/effects/settings'
import { isFormPath, type PresentationTimings } from '@/effects/timings'
import { isModalClass, type PresentationEntry } from '@/effects/types'
import { pageVisibility } from '@/platform/page'
import { GoalToast } from './GoalToast'
import { ModalEntry } from './ModalEntry'
import { prefetchOverlays } from './overlayChunk'
import type { PresentationRuntime } from './runtime'
import { SystemPopup } from './SystemPopup'
import { useEffectsSnapshot, usePresentationRuntime, useQueueState, useTimings } from './usePresentation'
import { useVisibleTimeout } from './useFinish'

/** Runs `callback` when the browser is idle (or soon after, where it has no idle callback). */
function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback)
    return () => window.cancelIdleCallback(handle)
  }
  const timer = window.setTimeout(callback, 2_000)
  return () => window.clearTimeout(timer)
}

/** One minor entry: plays its cue, shows its toast if it has one, and removes itself after its time. */
function MinorEntryView({
  entry,
  mode,
  timings,
  hidden,
  onCue,
  onExpire,
}: {
  entry: PresentationEntry
  mode: EffectsMode
  timings: PresentationTimings
  hidden: boolean
  onCue: (entry: PresentationEntry) => void
  onExpire: (id: string) => void
}) {
  useEffect(() => {
    onCue(entry)
  }, [entry, onCue])
  const expire = useCallback(() => onExpire(entry.id), [entry.id, onExpire])
  useVisibleTimeout(timings.visibleMs(entry), hidden, expire)
  return entry.kind === 'weekly_goal' ? <GoalToast entry={entry} mode={mode} /> : null // a completed quest's feedback is drawn on its own row
}

function Host({ runtime }: { runtime: PresentationRuntime }) {
  const { controller, playCue } = runtime
  const state = useQueueState(runtime)
  const { mode } = useEffectsSnapshot(runtime)
  const timings = useTimings(runtime, mode)
  const hidden = useSyncExternalStore(pageVisibility.subscribe, pageVisibility.isHidden, () => false)
  const { pathname } = useLocation()
  const played = useRef(new Set<string>())

  /** Each entry's cue plays once, however many times an effect re-runs. */
  const onCue = useCallback(
    (entry: PresentationEntry) => {
      if (entry.cue === null || played.current.has(entry.id)) return
      played.current.add(entry.id)
      playCue(entry.cue)
    },
    [playCue],
  )

  // The next waiting entry starts after its own delay (the quest row and the EXP bar play first). Nothing
  // starts while the page is hidden, and a reconciliation-origin entry waits until the player leaves a form.
  const next = state.pending[0]
  const blocked = hidden || (next?.origin === 'lifecycle' && isFormPath(pathname))
  useEffect(() => {
    if (state.active !== null || next === undefined || blocked) return
    const timer = window.setTimeout(() => controller.dispatch({ type: 'start_next' }), timings.startDelayMs[next.kind])
    return () => window.clearTimeout(timer)
  }, [controller, state.active, next, blocked, timings])

  const active = state.active
  useEffect(() => {
    if (active !== null) onCue(active)
  }, [active, onCue])

  // The HUD never waits long for a Level Up reveal: past the cap it shows the real level again.
  const heldId = firstHeldEntryId(state)
  useEffect(() => {
    if (heldId === null) return
    const timer = window.setTimeout(() => controller.dispatch({ type: 'release_hold', id: heldId }), timings.holdMaxMs)
    return () => window.clearTimeout(timer)
  }, [controller, heldId, timings.holdMaxMs])

  useEffect(() => whenIdle(prefetchOverlays), [])

  const expireMinor = useCallback((id: string) => controller.dispatch({ type: 'expire_minor', id }), [controller])
  const finishActive = useCallback(() => {
    if (active !== null) controller.dispatch({ type: 'finish', id: active.id })
  }, [controller, active])

  return (
    <>
      {state.minor.map((entry) => (
        <MinorEntryView key={entry.id} entry={entry} mode={mode} timings={timings} hidden={hidden} onCue={onCue} onExpire={expireMinor} />
      ))}
      {active !== null && !isModalClass(active.class) && (
        <SystemPopup key={active.id} entry={active} mode={mode} timings={timings} paused={hidden} onFinish={finishActive} />
      )}
      {active !== null && isModalClass(active.class) && (
        <ModalEntry key={active.id} entry={active} mode={mode} timings={timings} paused={hidden} onFinish={finishActive} />
      )}
    </>
  )
}

/**
 * The single place earned moments are shown. It reads the one presentation
 * queue and renders what it says: inline feedback, one SYSTEM popup at a time,
 * or one full-screen overlay (lazy-loaded). It decides nothing about the game;
 * it only shows entries built from domain events. Mounted inside the router
 * (the weekly overlay links to Weekly) and above every route, so a moment
 * survives navigation. Outside the app it renders nothing.
 */
export function PresentationHost() {
  const runtime = usePresentationRuntime()
  return runtime === null ? null : <Host runtime={runtime} />
}
