import { Outlet } from 'react-router'
import { BottomNav } from './BottomNav'

/**
 * Architectural frame for every route: full mobile viewport, a single
 * centered content column (so wide screens never stretch it), room above the
 * bottom navigation, and the route outlet. It holds no game state.
 */
export function AppShell() {
  return (
    <>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        {/* 3.5rem = the bottom nav's height; the rest keeps the last item clear of it. */}
        <main className="flex flex-1 flex-col px-4 pt-6 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1.5rem)]">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </>
  )
}
