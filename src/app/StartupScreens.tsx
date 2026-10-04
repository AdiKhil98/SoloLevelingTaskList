import type { ReactNode } from 'react'
import type { FailureReason } from '@/application'

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
        className="mt-2 inline-flex min-h-12 min-w-32 items-center justify-center rounded-[3px] border border-accent bg-accent/10 px-6 font-medium text-accent system-focus active:bg-accent/20"
      >
        Retry
      </button>
    </StartupFrame>
  )
}
