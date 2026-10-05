import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router'
import { BUTTON_PRIMARY, BUTTON_QUIET } from '@/components/ui/styles'
import { cn } from '@/lib/utils'
import { shellUpdates, type ShellUpdates } from '@/platform/shellUpdates'
import { isUnsavedFormRoute } from './formRoutes'

/** The CSS variable the page's bottom padding adds while the notice is showing (see `AppShell`). */
const NOTICE_SPACE_VARIABLE = '--notice-space'
/** A little air between the last item and the notice. */
const NOTICE_SPACE_MARGIN_PX = 8

/**
 * "SYSTEM UPDATE AVAILABLE  [ RESTART ]  [ LATER ]": a newer build has been downloaded and is waiting.
 *
 * It never reloads anything by itself. RESTART is the player's choice; LATER hides the notice for this session
 * (a reload shows it again). On a form route (quest create/edit, weekly edit) it stays out of the way and shows once
 * the player has left the form, because RESTART would discard unsaved edits.
 *
 * While it is showing it floats above the bottom navigation, so it reserves its own height at the bottom of the page
 * (the `--notice-space` variable): the last item can always be scrolled clear of it.
 *
 * Like the presentation popups it mounts only while it has something to say (a polite status region).
 */
export function UpdateNotice({ source = shellUpdates }: { source?: ShellUpdates }) {
  const { updateReady, applying, dismissed } = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const { pathname } = useLocation()
  const visible = updateReady && !dismissed && !isUnsavedFormRoute(pathname)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = panel.current
    if (!visible || element === null) return
    const root = document.documentElement
    const reserve = () => root.style.setProperty(NOTICE_SPACE_VARIABLE, `${element.offsetHeight + NOTICE_SPACE_MARGIN_PX}px`)
    reserve()
    // The notice can change height (it wraps on a narrow phone, and when the screen is rotated).
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reserve)
    observer?.observe(element)
    return () => {
      observer?.disconnect()
      root.style.removeProperty(NOTICE_SPACE_VARIABLE)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+0.5rem)] z-20 flex justify-center px-3"
    >
      <div
        ref={panel}
        className="system-panel system-panel-accent pointer-events-auto flex w-full max-w-md flex-wrap items-center justify-end gap-x-3 gap-y-1 py-1.5 pr-1.5 pl-3 shadow-glow-soft"
      >
        <p className="mr-auto font-display text-[0.625rem] font-semibold tracking-[0.1em] text-accent">SYSTEM UPDATE AVAILABLE</p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={source.restart}
            disabled={applying}
            className={cn(BUTTON_PRIMARY, 'px-2.5 font-display text-[0.6875rem] tracking-[0.12em]')}
          >
            {applying ? 'RESTARTING...' : 'RESTART'}
          </button>
          <button
            type="button"
            onClick={source.later}
            disabled={applying}
            className={cn(BUTTON_QUIET, 'px-2.5 font-display text-[0.6875rem] tracking-[0.12em]')}
          >
            LATER
          </button>
        </div>
      </div>
    </div>
  )
}
