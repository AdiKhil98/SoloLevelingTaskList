import { Outlet } from 'react-router'

/**
 * Architectural frame for every route: full mobile viewport, a single
 * content container, and the route outlet. Navigation and HUD chrome are
 * added by later phases.
 */
export function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      <main className="flex flex-1 flex-col px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
