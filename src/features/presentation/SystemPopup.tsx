import { Crown, Sparkles, Target, Trophy, X, type LucideIcon } from 'lucide-react'
import { useCallback } from 'react'
import type { EffectsMode } from '@/effects/settings'
import type { PresentationTimings } from '@/effects/timings'
import type { PresentationEntry } from '@/effects/types'
import { cn } from '@/lib/utils'
import { achievementsHeading, ALL_GOALS_TEXT, PERFECT_DAY_TEXT, weeklyResultText } from './entryText'
import { useFinish, useVisibleTimeout } from './useFinish'

interface SystemPopupProps {
  entry: PresentationEntry
  mode: EffectsMode
  timings: PresentationTimings
  paused: boolean
  onFinish: () => void
}

interface PopupContent {
  readonly Icon: LucideIcon
  readonly title: string
  readonly lines: readonly string[]
  /** A running light around the card (achievements only). */
  readonly trail: boolean
}

/** What a medium entry says. Everything shown comes from the entry the domain's events produced. */
function contentOf(entry: PresentationEntry): PopupContent | null {
  switch (entry.kind) {
    case 'achievements':
      return {
        Icon: Trophy,
        title: achievementsHeading(entry),
        lines: entry.items.length === 1 ? [entry.items[0]?.title.toUpperCase() ?? '', entry.items[0]?.description ?? ''] : entry.items.map((item) => item.title.toUpperCase()),
        trail: true,
      }
    case 'perfect_day':
      return { Icon: Sparkles, title: PERFECT_DAY_TEXT.title, lines: [PERFECT_DAY_TEXT.body], trail: false }
    case 'weekly_all_goals':
      return { Icon: Target, title: ALL_GOALS_TEXT.title, lines: [ALL_GOALS_TEXT.body], trail: false }
    case 'weekly_result': {
      // Only the restrained (0–5) result is a popup; stronger results are overlays.
      const text = weeklyResultText(entry)
      return { Icon: Crown, title: text.heading, lines: [text.score, text.bonus], trail: false }
    }
    default:
      return null
  }
}

/**
 * One medium-weight SYSTEM notification: achievements, a live Perfect Day, all
 * weekly goals done, a restrained weekly result. It is a polite live region, not
 * a dialog: it never takes focus and never blocks the screen. It closes itself
 * after a few seconds of visible time, or on a tap on it or on its close button.
 */
export function SystemPopup({ entry, mode, timings, paused, onFinish }: SystemPopupProps) {
  const { closing, close } = useFinish(timings.closeMs, onFinish)
  const elapsed = useCallback(() => close(), [close])
  useVisibleTimeout(timings.visibleMs(entry), paused || closing, elapsed)

  const content = contentOf(entry)
  if (content === null) return null
  const { Icon, title, lines, trail } = content

  return (
    <div
      className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 mx-auto flex max-w-md justify-center"
    >
      <div
        role="status"
        data-fx={mode}
        data-state={closing ? 'closing' : 'open'}
        onClick={close}
        className={cn(
          'system-fx-popup system-panel system-panel-accent pointer-events-auto flex w-full items-start gap-3 bg-surface-raised p-3.5 pr-2 shadow-glow',
          trail && 'system-fx-trail',
        )}
      >
        <span aria-hidden="true" className="mt-0.5 rounded-[3px] border border-border-strong bg-accent/10 p-2 text-accent">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p aria-hidden="true" className="font-display text-[0.625rem] font-semibold tracking-[0.35em] text-accent">
            [ SYSTEM ]
          </p>
          <p className="mt-1 font-display text-sm font-bold tracking-[0.16em] text-foreground">{title}</p>
          {lines.map((line, index) => (
            <p key={`${index}-${line}`} className={cn('break-words', index === 0 ? 'mt-0.5 font-display text-base font-semibold text-accent-2' : 'text-sm text-muted')}>
              {line}
            </p>
          ))}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={(event) => {
            event.stopPropagation()
            close()
          }}
          className="system-focus inline-flex size-11 shrink-0 items-center justify-center rounded-[3px] text-muted active:bg-accent/15"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  )
}
