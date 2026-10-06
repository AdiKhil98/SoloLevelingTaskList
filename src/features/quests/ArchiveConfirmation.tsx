import { useEffect, useRef, type KeyboardEvent } from 'react'
import { BUTTON, BUTTON_DANGER } from '@/components/ui/styles'
import { cn } from '@/lib/utils'

interface ArchiveConfirmationProps {
  title: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * A lightweight inline confirmation (no dialog dependency). It says plainly what
 * archiving does and does not do, puts focus on the safe choice (Cancel) and
 * closes on Escape. Nothing happens until the player confirms.
 */
export function ArchiveConfirmation({ title, pending, onCancel, onConfirm }: ArchiveConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !pending) {
      event.stopPropagation()
      onCancel()
    }
  }

  return (
    <div
      role="group"
      aria-labelledby="archive-confirmation-heading"
      onKeyDown={handleKeyDown}
      className="mt-3 flex flex-col gap-3 rounded-[3px] border border-danger/50 bg-danger/10 p-3"
    >
      <p id="archive-confirmation-heading" className="font-medium break-words">
        Archive “{title}”?
      </p>
      <ul className="list-disc pl-5 text-sm text-muted">
        <li>It will stop appearing on future days.</li>
        <li>Your history and earned EXP stay as they are.</li>
        <li>If it is already on today’s list, it stays there until the day ends.</li>
      </ul>
      <div className="flex gap-2">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={pending}
          className={cn(BUTTON, 'flex-1')}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          aria-busy={pending}
          className={cn(BUTTON_DANGER, 'flex-1')}
        >
          Archive Quest
        </button>
      </div>
    </div>
  )
}
