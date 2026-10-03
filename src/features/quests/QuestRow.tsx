import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import type { QuestListItem } from '@/application'
import { categoryLabel } from '../displayLabels'
import { ArchiveConfirmation } from './ArchiveConfirmation'
import { recurrenceListText } from './recurrenceSummary'

interface QuestRowProps {
  item: QuestListItem
  /** The archive confirmation for this row is open. */
  confirming: boolean
  /** An archive or restore for this row is being saved. */
  pending: boolean
  onAskArchive: (item: QuestListItem) => void
  onCancelArchive: () => void
  onConfirmArchive: (item: QuestListItem) => void
  onRestore: (item: QuestListItem) => void
}

const ACTION =
  'inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15 disabled:opacity-60'

/** One quest in the management list: what it is, plus the actions that make sense for its state. */
export function QuestRow({
  item,
  confirming,
  pending,
  onAskArchive,
  onCancelArchive,
  onConfirmArchive,
  onRestore,
}: QuestRowProps) {
  const archived = item.status === 'archived'

  // After Cancel, return focus to the button that opened the confirmation.
  const archiveButton = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  useEffect(() => {
    if (wasConfirming.current && !confirming) archiveButton.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])

  return (
    <li className="rounded-xl border border-border bg-surface p-3.5">
      <p className="font-medium break-words">{item.title}</p>
      <p className="text-sm text-muted">{recurrenceListText(item.recurrence)}</p>
      <p className="text-sm text-muted">
        Difficulty {item.difficulty} · +{item.expReward} EXP · {categoryLabel(item.category)}
      </p>
      {item.datePassed && <p className="text-sm text-amber-300">Date passed</p>}

      {archived ? (
        item.canRestore ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              aria-busy={pending}
              aria-label={`Restore ${item.title}`}
              onClick={() => onRestore(item)}
              className={ACTION}
            >
              Restore
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Its date has passed, so it cannot be restored.</p>
        )
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <Link to={`/quests/${encodeURIComponent(item.templateId)}/edit`} aria-label={`Edit ${item.title}`} className={ACTION}>
              Edit
            </Link>
            <button
              ref={archiveButton}
              type="button"
              disabled={pending}
              aria-label={`Archive ${item.title}`}
              aria-expanded={confirming}
              onClick={() => onAskArchive(item)}
              className={ACTION}
            >
              Archive
            </button>
          </div>
          {confirming && (
            <ArchiveConfirmation
              title={item.title}
              pending={pending}
              onCancel={onCancelArchive}
              onConfirm={() => onConfirmArchive(item)}
            />
          )}
        </>
      )}
    </li>
  )
}
