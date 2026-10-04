import { useEffect, useRef, type KeyboardEvent } from 'react'

interface ArchiveConfirmationProps {
  title: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}

const BUTTON =
  'inline-flex min-h-11 flex-1 items-center justify-center rounded-[3px] border px-4 text-sm font-semibold system-focus disabled:opacity-60'

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
          className={`${BUTTON} border-border active:bg-accent/15`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          aria-busy={pending}
          className={`${BUTTON} border-danger/70 bg-danger/15 active:bg-danger/25`}
        >
          Archive Quest
        </button>
      </div>
    </div>
  )
}
