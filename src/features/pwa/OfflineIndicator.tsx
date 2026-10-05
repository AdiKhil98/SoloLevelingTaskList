import { useSyncExternalStore } from 'react'
import { connectivity } from '@/platform/connectivity'

interface ConnectivitySource {
  isOnline(): boolean
  subscribe(listener: () => void): () => void
}

/**
 * A tiny, calm "OFFLINE" marker, shown only while the browser reports no connection. It is purely informational:
 * the application needs no network, so it never disables, hides or changes any action. It takes no layout space
 * (fixed, pointer-transparent), so it appearing never shifts or blocks a tap.
 *
 * Like the presentation popups it mounts only while it has something to say (a polite status region).
 */
export function OfflineIndicator({ source = connectivity }: { source?: ConnectivitySource }) {
  const online = useSyncExternalStore(source.subscribe, source.isOnline, () => true)
  if (online) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.125rem)] z-20 mx-auto flex max-w-md justify-center px-3"
    >
      <p className="rounded-[3px] border border-border bg-background/85 px-2 font-display text-[0.625rem] leading-3.5 font-semibold tracking-[0.2em] text-muted">
        OFFLINE
      </p>
    </div>
  )
}
