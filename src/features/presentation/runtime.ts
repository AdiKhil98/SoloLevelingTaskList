import { createContext } from 'react'
import { primeAudio, getAudioContext } from '@/platform/audio'
import { vibrate } from '@/platform/haptics'
import { readPreference, reducedMotionPreference, writePreference } from '@/platform/preferences'
import { createPresentationController, type PresentationController } from '@/effects/controller'
import { hapticPatternFor } from '@/effects/haptics'
import { EFFECTS_SETTINGS_KEY } from '@/effects/settings'
import { createEffectsSettingsStore, type EffectsSettingsStore } from '@/effects/settingsStore'
import { scheduleCue } from '@/effects/sound'
import type { PresentationTimings } from '@/effects/timings'
import type { Cue } from '@/effects/types'

/**
 * Everything the presentation layer needs, created once per app: the one queue,
 * the player's effect settings, the cue player (haptics and synthesized sound,
 * both best effort) and optional timing overrides (tests shorten them).
 */
export interface PresentationRuntime {
  readonly controller: PresentationController
  readonly settings: EffectsSettingsStore
  readonly timingOverrides: Partial<PresentationTimings>
  /** Plays a cue's haptic pattern and sound if the player enabled them. Never throws. */
  playCue(cue: Cue): void
  /** Turns sound on from a user gesture: unlocks the audio context. Resolves to whether sound can play. */
  unlockSound(): Promise<boolean>
}

export interface PresentationRuntimeOptions {
  readonly settings?: EffectsSettingsStore
  readonly timings?: Partial<PresentationTimings>
  /** Replaces the device vibration (tests). */
  readonly vibrate?: (pattern: readonly number[]) => boolean
  /** Replaces the synthesized sound (tests). */
  readonly playSound?: (cue: Cue) => void
  readonly unlockSound?: () => Promise<boolean>
}

/** The player's settings, stored in localStorage and following the device's reduced-motion setting. */
export function createSystemSettingsStore(): EffectsSettingsStore {
  return createEffectsSettingsStore({
    read: () => readPreference(EFFECTS_SETTINGS_KEY),
    write: (value) => writePreference(EFFECTS_SETTINGS_KEY, value),
    osReducedMotion: reducedMotionPreference,
  })
}

/** Plays `cue` on the shared audio context if it is running; silence otherwise. */
function playSynthesizedSound(cue: Cue): void {
  const context = getAudioContext()
  if (context === null || context.state !== 'running') return
  try {
    scheduleCue(context, cue)
  } catch (error) {
    console.warn('Playing a sound cue failed', error)
  }
}

export function createPresentationRuntime(options: PresentationRuntimeOptions = {}): PresentationRuntime {
  const settings = options.settings ?? createSystemSettingsStore()
  const device = options.vibrate ?? vibrate
  const sound = options.playSound ?? playSynthesizedSound
  return {
    controller: createPresentationController(),
    settings,
    timingOverrides: options.timings ?? {},
    playCue(cue) {
      const { haptics, sound: soundOn } = settings.getSnapshot()
      try {
        if (haptics) device(hapticPatternFor(cue))
        if (soundOn) sound(cue)
      } catch (error) {
        console.warn('Playing a presentation cue failed', error)
      }
    },
    unlockSound: options.unlockSound ?? primeAudio,
  }
}

export const PresentationContext = createContext<PresentationRuntime | null>(null)
