import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useMatches } from 'react-router'
import { scrollToTop, setDocumentTitle, takeOverScrollRestoration } from '@/platform/page'

/**
 * What a route says about itself. A route object carries it as its `handle`, so each screen's name lives next to
 * its path in the route table. Presentation only.
 */
export interface RouteHandle {
  /** The screen's name (`Quests`); the page title becomes `Quests — SYSTEM`. */
  readonly title: string
}

/** The title before any screen has named itself; the same words as `index.html`. */
export const DEFAULT_DOCUMENT_TITLE = 'SYSTEM — Quest Tracker'

/** `Quests` → `Quests — SYSTEM`. */
export function documentTitleFor(screen: string): string {
  return `${screen} — SYSTEM`
}

function hasTitle(handle: unknown): handle is RouteHandle {
  return typeof handle === 'object' && handle !== null && typeof (handle as { title?: unknown }).title === 'string'
}

/** The page title for the matched routes: the deepest route that names itself decides, otherwise the default. */
export function documentTitleOf(matches: readonly { readonly handle: unknown }[]): string {
  for (const { handle } of [...matches].reverse()) {
    if (hasTitle(handle)) return documentTitleFor(handle.title)
  }
  return DEFAULT_DOCUMENT_TITLE
}

/**
 * The page's own chrome, kept in step with the route (mounted once, by `AppShell`):
 *  - the document title names the current screen (WCAG 2.4.2; it also labels the installed app in recent apps);
 *  - a new screen starts at the top. Without this a tab tapped while the page was scrolled landed part-way down
 *    the next screen, with its heading off-screen. Going Back counts too (the browser's own restoring is turned
 *    off: it landed part-way down a half-loaded screen). Only a change of path counts: the first render, and any
 *    update on the same path, leave the scroll position alone.
 */
export function usePageChrome(): void {
  const title = documentTitleOf(useMatches())
  useEffect(() => {
    setDocumentTitle(title)
  }, [title])

  useEffect(() => {
    takeOverScrollRestoration()
  }, [])

  const { pathname } = useLocation()
  const shownPath = useRef(pathname)
  useLayoutEffect(() => {
    if (shownPath.current === pathname) return
    shownPath.current = pathname
    scrollToTop()
  }, [pathname])
}
