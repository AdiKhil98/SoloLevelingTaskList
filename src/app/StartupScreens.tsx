import type { ReactNode } from 'react'
import type { FailureReason } from '@/application'
import { BUTTON, BUTTON_PRIMARY } from '@/components/ui/styles'
import { cn } from '@/lib/utils'

/** A hint under the generic headline; never raw browser or storage error text. */
function startupFailureHint(reason: FailureReason): string {
  switch (reason) {
    case 'database_blocked':
      return 'Another tab or window is still using an older version of the app. Close other copies of it, then retry.'
    case 'newer_data':
      return 'Your saved data was created by a newer version of the app, so it was left untouched.'
    case 'storage_full':
      return 'This device is out of storage space.'
    case 'database_unavailable':
      return 'Storage is not available in this browser right now.'
    case 'data_invalid':
      return 'Some saved data could not be read. Nothing has been changed or deleted.'
    case 'clock_unavailable':
      return 'The device date and time could not be read.'
    case 'clock_behind':
    case 'day_not_synchronized':
    case 'unexpected':
      return 'Nothing has been changed or deleted.'
  }
}

/** The recovery actions are the shared SYSTEM buttons, a little larger: they are all there is on these screens. */
const ACTION_SIZE = 'min-h-12 min-w-32 px-6 text-base'
const PRIMARY_ACTION = cn(BUTTON_PRIMARY, ACTION_SIZE)
const SECONDARY_ACTION = cn(BUTTON, ACTION_SIZE)

function StartupFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-10 text-center pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      {children}
    </main>
  )
}

/** Shown while the database opens and today's state loads; never a flash of "0 EXP". */
export function LoadingScreen() {
  return (
    <StartupFrame>
      <p role="status" className="font-display text-sm tracking-[0.3em] text-accent">
        SYSTEM INITIALIZING...
      </p>
    </StartupFrame>
  )
}

/**
 * A screen's code could not be loaded (for example offline before it was downloaded). Nothing has been saved or
 * changed. Reload is the player's choice; nothing here reloads by itself, so it can never loop.
 */
export function ScreenLoadFailedScreen({ onReload }: { onReload: () => void }) {
  return (
    <StartupFrame>
      <div role="alert" className="flex flex-col items-center gap-3">
        <h1 className="font-display text-xl font-semibold">This screen could not be loaded</h1>
        <p className="text-muted">Check your connection, then reload. Nothing has been changed or deleted.</p>
      </div>
      <button
        type="button"
        onClick={onReload}
        className={cn(PRIMARY_ACTION, 'mt-2')}
      >
        Reload
      </button>
    </StartupFrame>
  )
}

/**
 * A screen failed while it was being shown (a render error). The error itself is logged by whoever caught it and is
 * never shown here. Reload is the player's choice (nothing reloads by itself, so it cannot loop). Home is a plain link
 * that loads the start screen: an installed app has no address bar, so without it a screen that always fails would
 * trap the player. Nothing here deletes or resets anything.
 */
export function AppCrashScreen({ onReload }: { onReload: () => void }) {
  return (
    <StartupFrame>
      <div role="alert" className="flex flex-col items-center gap-3">
        <h1 className="font-display text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted">This screen could not be shown. Reloading does not delete or change your saved progress.</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onReload}
          className={PRIMARY_ACTION}
        >
          Reload
        </button>
        <a
          href="/"
          className={SECONDARY_ACTION}
        >
          Home
        </a>
      </div>
    </StartupFrame>
  )
}

interface StartupErrorScreenProps {
  reason: FailureReason
  onRetry: () => void
}

/** Recoverable: it explains, offers Retry, and never deletes or resets anything. */
export function StartupErrorScreen({ reason, onRetry }: StartupErrorScreenProps) {
  return (
    <StartupFrame>
      <div role="alert" className="flex flex-col items-center gap-3">
        <h1 className="font-display text-xl font-semibold">Local data could not be loaded</h1>
        <p className="text-muted">{startupFailureHint(reason)}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={cn(PRIMARY_ACTION, 'mt-2')}
      >
        Retry
      </button>
    </StartupFrame>
  )
}
