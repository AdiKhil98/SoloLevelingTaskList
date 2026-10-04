import type { EffectsMode } from '@/effects/settings'
import type { PresentationTimings } from '@/effects/timings'
import type { PresentationEntry } from '@/effects/types'
import ProgressionOverlay from './ProgressionOverlay'
import WeeklyResultOverlay from './WeeklyResultOverlay'

interface EntryOverlayProps {
  entry: PresentationEntry
  mode: EffectsMode
  timings: PresentationTimings
  paused: boolean
  onFinish: () => void
}

/**
 * The lazily loaded half of the presentation layer: the full-screen overlays,
 * their particles and text effects. It is a separate chunk (the main bundle only
 * imports it dynamically), so ordinary screens never pay for it.
 */
export default function EntryOverlay({ entry, mode, timings, paused, onFinish }: EntryOverlayProps) {
  switch (entry.kind) {
    case 'progression':
      return <ProgressionOverlay entry={entry} mode={mode} timings={timings} paused={paused} onFinish={onFinish} />
    case 'weekly_result':
      return <WeeklyResultOverlay entry={entry} mode={mode} timings={timings} paused={paused} onFinish={onFinish} />
    default:
      return null // medium and minor entries are shown by the always-loaded popup and toast
  }
}
