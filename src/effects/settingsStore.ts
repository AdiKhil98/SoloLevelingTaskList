import {
  parseEffectsSettings,
  resolveEffectsMode,
  serializeEffectsSettings,
  type EffectsMode,
  type EffectsSettings,
} from './settings'

/** The two environment readings the store needs, injected so it can be tested without a browser. */
export interface SettingsEnvironment {
  /** The stored string, or null (also null if storage is unavailable). */
  read(): string | null
  /** Stores the string; returns false if it could not be stored. Never throws. */
  write(value: string): boolean
  /** The device's reduced-motion preference. */
  readonly osReducedMotion: {
    get(): boolean
    subscribe(listener: () => void): () => void
  }
}

export interface EffectsSettingsSnapshot extends EffectsSettings {
  readonly osReducedMotion: boolean
  /** The motion mode that applies: reduced if the player chose it or the device asks for it. */
  readonly mode: EffectsMode
}

export interface EffectsSettingsStore {
  /** The same object until a setting or the device preference changes (for `useSyncExternalStore`). */
  getSnapshot(): EffectsSettingsSnapshot
  subscribe(listener: () => void): () => void
  update(patch: Partial<EffectsSettings>): void
}

export function createEffectsSettingsStore(environment: SettingsEnvironment): EffectsSettingsStore {
  let settings = parseEffectsSettings(environment.read())
  let snapshot = buildSnapshot(settings, environment.osReducedMotion.get())
  const listeners = new Set<() => void>()

  function buildSnapshot(next: EffectsSettings, osReduced: boolean): EffectsSettingsSnapshot {
    return { ...next, osReducedMotion: osReduced, mode: resolveEffectsMode(next, osReduced) }
  }
  function publish(next: EffectsSettingsSnapshot) {
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  function refreshDevice() {
    const osReduced = environment.osReducedMotion.get()
    if (osReduced !== snapshot.osReducedMotion) publish(buildSnapshot(settings, osReduced))
  }

  // The device preference is watched only while something is subscribed (and re-read when watching resumes).
  let stopWatchingDevice: (() => void) | null = null

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      if (stopWatchingDevice === null) {
        stopWatchingDevice = environment.osReducedMotion.subscribe(refreshDevice)
        refreshDevice()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && stopWatchingDevice !== null) {
          stopWatchingDevice()
          stopWatchingDevice = null
        }
      }
    },
    update(patch) {
      const next: EffectsSettings = { ...settings, ...patch }
      if (next.effects === settings.effects && next.haptics === settings.haptics && next.sound === settings.sound) return
      settings = next
      environment.write(serializeEffectsSettings(next)) // a refusal keeps the choice for this session
      publish(buildSnapshot(next, snapshot.osReducedMotion))
    },
  }
}
