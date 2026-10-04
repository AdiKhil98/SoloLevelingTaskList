import { useContext, useMemo, useSyncExternalStore } from 'react'
import type { PlayerStatus } from '@/application'
import { selectHudHold, type QueueState } from '@/effects/queue'
import type { EffectsSettingsSnapshot } from '@/effects/settingsStore'
import { timingsFor, type PresentationTimings } from '@/effects/timings'
import type { QuestFeedbackEntry } from '@/effects/types'
import { PresentationContext, type PresentationRuntime } from './runtime'

/** The runtime, or null outside the app (a component rendered alone then simply shows no effects). */
export function usePresentationRuntime(): PresentationRuntime | null {
  return useContext(PresentationContext)
}

const noopSubscribe = () => () => undefined

/** The queue state, re-read when it changes. */
export function useQueueState(runtime: PresentationRuntime): QueueState {
  return useSyncExternalStore(runtime.controller.subscribe, runtime.controller.getState)
}

/** The effect settings and the mode that applies (reduced if chosen or if the device asks for it). */
export function useEffectsSnapshot(runtime: PresentationRuntime): EffectsSettingsSnapshot {
  return useSyncExternalStore(runtime.settings.subscribe, runtime.settings.getSnapshot)
}

/** Timings for the applying mode, with the runtime's overrides. */
export function useTimings(runtime: PresentationRuntime, mode: EffectsSettingsSnapshot['mode']): PresentationTimings {
  const { timingOverrides } = runtime
  return useMemo(() => timingsFor(mode, timingOverrides), [mode, timingOverrides])
}

/**
 * How effects should render here: `reduced` outside the app (so a lone component stays static), otherwise the
 * applying mode, plus the count-up duration for the EXP numbers.
 */
export function useFx(): { readonly mode: 'normal' | 'reduced'; readonly countMs: number } {
  const runtime = usePresentationRuntime()
  const snapshot = useSyncExternalStore(
    runtime?.settings.subscribe ?? noopSubscribe,
    runtime?.settings.getSnapshot ?? (() => null),
  )
  const mode = snapshot?.mode ?? 'reduced'
  const timingOverrides = runtime?.timingOverrides
  return useMemo(() => ({ mode, countMs: timingsFor(mode, timingOverrides).countMs }), [mode, timingOverrides])
}

/** The feedback entry showing for this quest right now, if it was just completed. */
export function useQuestFeedback(occurrenceId: string): QuestFeedbackEntry | null {
  const runtime = usePresentationRuntime()
  return useSyncExternalStore(
    runtime?.controller.subscribe ?? noopSubscribe,
    () => {
      const entry = runtime?.controller.getState().minor.find((candidate) => candidate.kind === 'quest_feedback' && candidate.occurrenceId === occurrenceId)
      return entry?.kind === 'quest_feedback' ? entry : null
    },
  )
}

/** True while any quest feedback is showing (the EXP bar glows). */
export function useBarGain(): boolean {
  const runtime = usePresentationRuntime()
  return useSyncExternalStore(
    runtime?.controller.subscribe ?? noopSubscribe,
    () => runtime?.controller.getState().minor.some((entry) => entry.kind === 'quest_feedback') ?? false,
  )
}

/**
 * The player as the HUD should show it: while a Level Up is waiting to be
 * revealed, the level and rank the player had, with the bar full, so the bar
 * fills and the overlay opens instead of the bar jumping back. Otherwise (and
 * outside the app) exactly the stored status.
 */
export function useHeldPlayer(player: PlayerStatus): PlayerStatus {
  const runtime = usePresentationRuntime()
  const hold = useSyncExternalStore(
    runtime?.controller.subscribe ?? noopSubscribe,
    () => (runtime === null ? null : selectHudHold(runtime.controller.getState())),
  )
  return useMemo(
    () => (hold === null ? player : { ...player, level: hold.level, rank: hold.rank, expIntoLevel: hold.expToNext, expToNext: hold.expToNext }),
    [player, hold],
  )
}
