import type { LifecycleNotice } from '@/app/runtimeContext'
import { lifecycleNoticeText } from './lifecycleNoticeText'

/**
 * The single, restrained notice after a catch-up (OD-21): no popups per old
 * day or week, no celebrations. Plain information the player can dismiss.
 */
export function LifecycleNoticeBanner({ notice, onDismiss }: { notice: LifecycleNotice; onDismiss: () => void }) {
  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2 text-sm">
      <p>{lifecycleNoticeText(notice)}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15"
      >
        Dismiss
      </button>
    </div>
  )
}
