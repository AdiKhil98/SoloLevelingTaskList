import type { LifecycleNotice } from '@/app/runtimeContext'
import { BUTTON_QUIET } from '@/components/ui/styles'
import { lifecycleNoticeText } from './lifecycleNoticeText'

/**
 * The single, restrained notice after a catch-up (OD-21): no popups per old
 * day or week, no celebrations. Plain information the player can dismiss.
 */
export function LifecycleNoticeBanner({ notice, onDismiss }: { notice: LifecycleNotice; onDismiss: () => void }) {
  return (
    <div role="status" className="system-panel flex items-center justify-between gap-3 border-l-2 border-l-accent-2 px-4 py-2 text-sm">
      <p>{lifecycleNoticeText(notice)}</p>
      <button type="button" onClick={onDismiss} className={BUTTON_QUIET}>
        Dismiss
      </button>
    </div>
  )
}
