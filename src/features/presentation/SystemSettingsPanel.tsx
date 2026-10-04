import { useState } from 'react'
import { Panel } from '@/components/ui/Panel'
import { SectionLabel } from '@/components/ui/SectionLabel'
import type { EffectsPreference } from '@/effects/settings'
import { cn } from '@/lib/utils'
import { canVibrate } from '@/platform/haptics'
import { useEffectsSnapshot, usePresentationRuntime } from './usePresentation'
import type { PresentationRuntime } from './runtime'

const EFFECT_CHOICES: readonly { readonly value: EffectsPreference; readonly label: string }[] = [
  { value: 'normal', label: 'NORMAL' },
  { value: 'reduced', label: 'REDUCED' },
]

/** A labelled on/off switch: a native checkbox (keyboard and screen-reader behaviour for free) drawn as a track. */
function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1">
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{label}</span>
        {hint !== undefined && <span className="text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border border-border-strong bg-background transition-colors peer-checked:bg-accent/30 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          'after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-muted after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-accent',
        )}
      />
    </label>
  )
}

function Settings({ runtime }: { runtime: PresentationRuntime }) {
  const snapshot = useEffectsSnapshot(runtime)
  const [soundNote, setSoundNote] = useState<string | null>(null)

  function changeSound(next: boolean) {
    setSoundNote(null)
    runtime.settings.update({ sound: next })
    if (!next) return
    // Turning sound on is the user gesture that unlocks audio; a soft cue confirms it.
    void runtime.unlockSound().then((ready) => {
      if (ready) runtime.playCue('quest')
      else setSoundNote('Sound is not available in this browser.')
    })
  }

  function changeHaptics(next: boolean) {
    runtime.settings.update({ haptics: next })
    if (next) runtime.playCue('quest')
  }

  return (
    <Panel aria-labelledby="settings-heading" className="flex flex-col gap-3 p-4">
      <SectionLabel id="settings-heading">SYSTEM SETTINGS</SectionLabel>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Effects</legend>
        <div className="flex gap-2">
          {EFFECT_CHOICES.map(({ value, label }) => (
            <label key={value} className="flex-1">
              <input
                type="radio"
                name="effects"
                value={value}
                checked={snapshot.effects === value}
                onChange={() => runtime.settings.update({ effects: value })}
                className="peer sr-only"
              />
              <span className="system-panel flex min-h-11 cursor-pointer items-center justify-center font-display text-xs font-semibold tracking-[0.2em] text-muted peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                {label}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">
          {snapshot.osReducedMotion
            ? 'This device asks for reduced motion, so effects are reduced whatever you choose here.'
            : 'Reduced removes particles and text effects and keeps every message.'}
        </p>
      </fieldset>

      <Switch
        label="Haptics"
        hint={canVibrate() ? 'A short vibration for progress.' : 'This device does not support vibration.'}
        checked={snapshot.haptics}
        onChange={changeHaptics}
      />
      <Switch label="Sound" hint="Soft SYSTEM tones. Off by default." checked={snapshot.sound} onChange={changeSound} />
      {soundNote !== null && (
        <p role="status" className="text-xs text-warning">
          {soundNote}
        </p>
      )}

      <p className="text-xs text-muted">Saved on this device only. Not part of backups.</p>
    </Panel>
  )
}

/** The player's three effect preferences (effects mode, haptics, sound). Nothing here touches progression. */
export function SystemSettingsPanel() {
  const runtime = usePresentationRuntime()
  return runtime === null ? null : <Settings runtime={runtime} />
}
