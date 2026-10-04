/**
 * Effects settings (OD-06 / OD-07 / OD-08). Small, per-device preferences: they
 * live in localStorage (see `src/platform/preferences.ts`) and are
 * intentionally NOT part of the backup. Losing them can never change progress.
 */

/** What the player chose for motion. The device's own reduced-motion setting can only add to it. */
export type EffectsPreference = 'normal' | 'reduced'

/** What actually applies, after the device setting is taken into account. */
export type EffectsMode = 'normal' | 'reduced'

export interface EffectsSettings {
  readonly effects: EffectsPreference
  readonly haptics: boolean
  readonly sound: boolean
}

/** Effects NORMAL, haptics ON, sound OFF. */
export const DEFAULT_EFFECTS_SETTINGS: EffectsSettings = { effects: 'normal', haptics: true, sound: false }

/** The localStorage key (versioned so a future shape can migrate or be ignored). */
export const EFFECTS_SETTINGS_KEY = 'sltl.effects-settings.v1'

/** Reads stored settings defensively: anything missing or of the wrong type falls back to its default, field by field. */
export function parseEffectsSettings(raw: string | null): EffectsSettings {
  if (raw === null) return DEFAULT_EFFECTS_SETTINGS
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return DEFAULT_EFFECTS_SETTINGS
  }
  if (typeof value !== 'object' || value === null) return DEFAULT_EFFECTS_SETTINGS
  const record = value as Record<string, unknown>
  return {
    effects: record.effects === 'reduced' || record.effects === 'normal' ? record.effects : DEFAULT_EFFECTS_SETTINGS.effects,
    haptics: typeof record.haptics === 'boolean' ? record.haptics : DEFAULT_EFFECTS_SETTINGS.haptics,
    sound: typeof record.sound === 'boolean' ? record.sound : DEFAULT_EFFECTS_SETTINGS.sound,
  }
}

export function serializeEffectsSettings(settings: EffectsSettings): string {
  return JSON.stringify({ effects: settings.effects, haptics: settings.haptics, sound: settings.sound })
}

/** The device's reduced-motion setting always wins; the in-app choice can only reduce further. */
export function resolveEffectsMode(settings: EffectsSettings, osReducedMotion: boolean): EffectsMode {
  return osReducedMotion || settings.effects === 'reduced' ? 'reduced' : 'normal'
}
