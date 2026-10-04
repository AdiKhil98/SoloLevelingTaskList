import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_EFFECTS_SETTINGS, parseEffectsSettings, resolveEffectsMode, serializeEffectsSettings } from './settings'
import { createEffectsSettingsStore, type SettingsEnvironment } from './settingsStore'
import { REDUCED_TIMINGS, NORMAL_TIMINGS, isFormPath, timingsFor } from './timings'
import type { PresentationEntry } from './types'
import { asDateKey } from '@/domain'

describe('defaults (OD-06 / OD-07 / OD-08)', () => {
  it('are effects NORMAL, haptics ON and sound OFF', () => {
    expect(DEFAULT_EFFECTS_SETTINGS).toEqual({ effects: 'normal', haptics: true, sound: false })
    expect(parseEffectsSettings(null)).toEqual(DEFAULT_EFFECTS_SETTINGS)
  })
})

describe('parseEffectsSettings', () => {
  it('reads what was stored', () => {
    expect(parseEffectsSettings(serializeEffectsSettings({ effects: 'reduced', haptics: false, sound: true }))).toEqual({ effects: 'reduced', haptics: false, sound: true })
  })

  it.each(['', 'not json', '42', 'null', '[]', '"reduced"'])('falls back to the defaults for the unusable value %j', (raw) => {
    expect(parseEffectsSettings(raw)).toEqual(DEFAULT_EFFECTS_SETTINGS)
  })

  it('falls back field by field', () => {
    expect(parseEffectsSettings('{"effects":"loud","haptics":"yes","sound":true}')).toEqual({ effects: 'normal', haptics: true, sound: true })
  })
})

describe('resolveEffectsMode', () => {
  it('is reduced when the device asks for it, whatever the player chose', () => {
    expect(resolveEffectsMode({ ...DEFAULT_EFFECTS_SETTINGS, effects: 'normal' }, true)).toBe('reduced')
  })
  it('is reduced when the player chose it, and normal otherwise', () => {
    expect(resolveEffectsMode({ ...DEFAULT_EFFECTS_SETTINGS, effects: 'reduced' }, false)).toBe('reduced')
    expect(resolveEffectsMode(DEFAULT_EFFECTS_SETTINGS, false)).toBe('normal')
  })
})

function makeEnvironment(initial: string | null = null, osReduced = false) {
  let stored = initial
  let reduced = osReduced
  const listeners = new Set<() => void>()
  const environment: SettingsEnvironment & { stored(): string | null; setOs(next: boolean): void; watchers(): number; write: ReturnType<typeof vi.fn> } = {
    read: () => stored,
    write: vi.fn((value: string) => {
      stored = value
      return true
    }),
    osReducedMotion: {
      get: () => reduced,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    stored: () => stored,
    setOs: (next) => {
      reduced = next
      for (const listener of [...listeners]) listener()
    },
    watchers: () => listeners.size,
  }
  return environment
}

describe('the settings store', () => {
  it('starts from storage and exposes the applying mode', () => {
    const store = createEffectsSettingsStore(makeEnvironment(serializeEffectsSettings({ effects: 'reduced', haptics: false, sound: false })))
    expect(store.getSnapshot()).toMatchObject({ effects: 'reduced', haptics: false, sound: false, mode: 'reduced', osReducedMotion: false })
  })

  it('saves a change and publishes a new snapshot; an unchanged value does nothing', () => {
    const environment = makeEnvironment()
    const store = createEffectsSettingsStore(environment)
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.getSnapshot()

    store.update({ sound: true })
    expect(store.getSnapshot()).not.toBe(before)
    expect(store.getSnapshot().sound).toBe(true)
    expect(JSON.parse(environment.stored() ?? '{}')).toMatchObject({ sound: true, haptics: true, effects: 'normal' })
    expect(listener).toHaveBeenCalledTimes(1)

    store.update({ sound: true })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(environment.write).toHaveBeenCalledTimes(1)
  })

  it('follows the device reduced-motion setting live, and the device wins over a NORMAL choice', () => {
    const environment = makeEnvironment()
    const store = createEffectsSettingsStore(environment)
    store.subscribe(() => undefined)
    expect(store.getSnapshot().mode).toBe('normal')
    environment.setOs(true)
    expect(store.getSnapshot()).toMatchObject({ osReducedMotion: true, mode: 'reduced', effects: 'normal' })
    environment.setOs(false)
    expect(store.getSnapshot().mode).toBe('normal')
  })

  it('watches the device only while something is subscribed, and resumes cleanly (StrictMode re-subscribes)', () => {
    const environment = makeEnvironment()
    const store = createEffectsSettingsStore(environment)
    expect(environment.watchers()).toBe(0)
    const stop = store.subscribe(() => undefined)
    expect(environment.watchers()).toBe(1)
    stop()
    expect(environment.watchers()).toBe(0)
    environment.setOs(true) // changes while nobody watches…
    const again = store.subscribe(() => undefined)
    expect(store.getSnapshot().mode).toBe('reduced') // …are noticed as soon as it is watched again
    again()
  })

  it('keeps the choice for this session if storage refuses the write', () => {
    const environment = makeEnvironment()
    environment.write.mockReturnValue(false)
    const store = createEffectsSettingsStore(environment)
    store.update({ effects: 'reduced' })
    expect(store.getSnapshot().effects).toBe('reduced')
  })
})

describe('timings', () => {
  const entry = (kind: PresentationEntry['kind']): PresentationEntry =>
    kind === 'progression'
      ? { kind, class: 'major', id: 'p', origin: 'action', cue: null, level: { from: 1, to: 2, levelsCrossed: [2] }, rank: null, expGained: 1, hold: null }
      : { kind: 'perfect_day', class: 'medium', id: 'd', origin: 'action', cue: null, dateKey: asDateKey('2026-10-05') }

  it('reduced effects have no count-up, scramble or typing, and shorter reading time', () => {
    expect(REDUCED_TIMINGS).toMatchObject({ countMs: 0, scrambleMs: 0, typeMs: 0 })
    expect(REDUCED_TIMINGS.visibleMs(entry('progression'))).toBeLessThan(NORMAL_TIMINGS.visibleMs(entry('progression')))
  })

  it('a level reveal is not a long cinematic, and a quest response is about a second', () => {
    expect(NORMAL_TIMINGS.visibleMs(entry('progression'))).toBeLessThanOrEqual(5_000)
    expect(NORMAL_TIMINGS.visibleMs({ kind: 'quest_feedback', class: 'minor', id: 'q', origin: 'action', cue: null, occurrenceId: 'o', amount: 1, strength: 'base' })).toBeLessThanOrEqual(1_200)
  })

  it('applies overrides on top of the mode timings', () => {
    expect(timingsFor('normal', { inputGuardMs: 0 }).inputGuardMs).toBe(0)
    expect(timingsFor('reduced').countMs).toBe(0)
  })

  it('knows which paths are forms', () => {
    expect(isFormPath('/quests/new')).toBe(true)
    expect(isFormPath('/quests/tpl_x/edit')).toBe(true)
    expect(isFormPath('/weekly/edit')).toBe(true)
    expect(isFormPath('/quests')).toBe(false)
    expect(isFormPath('/')).toBe(false)
  })
})
