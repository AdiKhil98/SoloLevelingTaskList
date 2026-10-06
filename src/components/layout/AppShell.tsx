import { Outlet } from 'react-router'
import { PresentationHost } from '@/features/presentation/PresentationHost'
import { OfflineIndicator } from '@/features/pwa/OfflineIndicator'
import { UpdateNotice } from '@/features/pwa/UpdateNotice'
import { BottomNav } from './BottomNav'
import { usePageChrome } from './pageChrome'

/**
 * Architectural frame for every route: full mobile viewport, a single
 * centered content column (so wide screens never stretch it), room above the
 * bottom navigation, and the route outlet. It holds no game state. The
 * presentation host sits here, above every route, so an earned moment (a Level
 * Up, an achievement) survives navigation. The two small infrastructure notices
 * (OFFLINE, SYSTEM UPDATE AVAILABLE) sit beside it; they are informational and
 * never block an action. It also keeps the page title and scroll position in
 * step with the route (`usePageChrome`).
 */
export function AppShell() {
  usePageChrome()
  return (
    <>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        {/* The bottom padding is the nav's height (one token, shared with BottomNav) plus the safe area, so the last item always clears it. While the update notice floats above the nav it adds its own height (--notice-space, unset otherwise). */}
        <main className="flex flex-1 flex-col px-4 pt-5 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+1.5rem+var(--notice-space,0px))]">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <OfflineIndicator />
      <UpdateNotice />
      <PresentationHost />
    </>
  )
}
