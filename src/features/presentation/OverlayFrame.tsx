import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { EffectsMode } from '@/effects/settings'
import { cn } from '@/lib/utils'
import { useFinish, useVisibleTimeout } from './useFinish'
import { usePresentationRuntime } from './usePresentation'

interface OverlayFrameProps {
  /** The element naming the dialog (its heading). */
  labelledBy: string
  /** The element with the full text of the moment, for screen readers. */
  describedBy: string
  mode: EffectsMode
  /** Stronger aura for the critical overlays. */
  intensity: 'normal' | 'high'
  /** Taps and Esc are ignored for this long after the overlay opens. */
  inputGuardMs: number
  closeMs: number
  /** How long it stays before it moves on by itself (visible time only). */
  visibleMs: number
  /** True while the page is hidden. */
  paused: boolean
  /** Restarts the auto-dismiss clock (a new phase of the same overlay). */
  phaseKey?: string | number
  /** Called when the player taps, presses Enter/Escape, or the time is up. Return true if that advanced to another phase (the overlay then stays). */
  onContinue?: () => boolean
  /** Runs once, after the exit animation. */
  onFinish: () => void
  /** A short hint at the bottom of the screen. */
  continueLabel?: string
  /** Decoration filling the whole screen behind the content (particles, the light sweep). */
  backdrop?: ReactNode
  /** The queue entry this overlay shows: once it is open, the HUD stops holding the old level for it. */
  entryId?: string
  children: ReactNode
}

/** Applies `inert` to every direct child of <body> except the dialog, and restores exactly what it changed. */
function useInertBackground(dialog: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const changed: Element[] = []
    for (const child of Array.from(document.body.children)) {
      if (child === dialog.current || child.hasAttribute('inert')) continue
      child.setAttribute('inert', '')
      changed.push(child)
    }
    return () => {
      for (const child of changed) child.removeAttribute('inert')
    }
  }, [dialog])
}

/**
 * The shell of every full-screen overlay: a modal dialog over a darkened screen.
 *
 * - Semantics: `role="dialog"` + `aria-modal`, named by its heading and
 *   described by the full text of the moment.
 * - Focus: moves to the Continue button when it opens and returns to where it was
 *   when it closes. The rest of the page is `inert` while it is open, so there is
 *   no keyboard trap and nothing behind it can be reached.
 * - Dismissal: tap anywhere, Continue, Enter or Escape; or after `visibleMs` of
 *   visible time. A short input guard stops the tap that caused the moment from
 *   dismissing it at once.
 */
export function OverlayFrame({
  labelledBy,
  describedBy,
  mode,
  intensity,
  inputGuardMs,
  closeMs,
  visibleMs,
  paused,
  phaseKey = 0,
  onContinue,
  onFinish,
  continueLabel = 'TAP TO CONTINUE',
  backdrop,
  entryId,
  children,
}: OverlayFrameProps) {
  const runtime = usePresentationRuntime()
  const dialogRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const openedAt = useRef(0)
  const { closing, close } = useFinish(closeMs, onFinish)

  useInertBackground(dialogRef)

  useEffect(() => {
    openedAt.current = performance.now()
    const previous = document.activeElement
    buttonRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  // The reveal is on screen now: the HUD behind it may show the new level (it was held so it could not spoil it).
  const controller = runtime?.controller
  useEffect(() => {
    if (entryId !== undefined) controller?.dispatch({ type: 'release_hold', id: entryId })
  }, [controller, entryId])

  const proceed = useCallback(
    (fromPlayer: boolean) => {
      if (closing) return
      if (fromPlayer && performance.now() - openedAt.current < inputGuardMs) return
      if (onContinue?.() === true) return
      close()
    },
    [closing, inputGuardMs, onContinue, close],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') proceed(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [proceed])

  const elapsed = useCallback(() => proceed(false), [proceed])
  useVisibleTimeout(visibleMs, paused || closing, elapsed, phaseKey)

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      data-fx={mode}
      data-state={closing ? 'closing' : 'open'}
      onClick={() => proceed(true)}
      className="system-fx-overlay fixed inset-0 z-50 flex flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center"
    >
      <div data-intensity={intensity} className="system-fx-aura" />
      {backdrop}
      {/* The content centres when it fits and scrolls (from its top) when the screen is short; the button never overlaps it. */}
      <div className="relative z-10 flex min-h-0 flex-1 overflow-y-auto px-5">
        <div className="m-auto flex w-full max-w-sm flex-col items-center py-4">{children}</div>
      </div>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          'system-focus relative z-10 mx-auto mb-3 inline-flex min-h-11 shrink-0 items-center rounded-[3px] px-5 font-display text-xs font-semibold tracking-[0.3em] text-muted',
        )}
      >
        {continueLabel}
      </button>
    </div>,
    document.body,
  )
}
