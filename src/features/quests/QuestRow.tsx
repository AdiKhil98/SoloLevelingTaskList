import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router'
import type { QuestListItem } from '@/application'
import { BUTTON } from '@/components/ui/styles'
import { cn } from '@/lib/utils'
import { categoryLabel } from '../displayLabels'
import { ArchiveConfirmation } from './ArchiveConfirmation'
import { recurrenceListText } from './recurrenceSummary'

/** What an ACTIVE row needs to take part in manual ordering. Archived rows have none. */
export interface RowReorder {
  /** 1-based place in the active list. */
  readonly position: number
  readonly total: number
  /** This row is being dragged right now. */
  readonly dragging: boolean
  readonly rowRef: (element: HTMLElement | null) => void
  /** Pointer handlers for the drag handle (see `useSortableList`). */
  readonly handleProps: {
    readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
    readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
    readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
    readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
    readonly onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void
    readonly onContextMenu: (event: { preventDefault: () => void }) => void
  }
  readonly onMove: (direction: 'up' | 'down') => void
}

interface QuestRowProps {
  item: QuestListItem
  reorder?: RowReorder
  /** The archive confirmation for this row is open. */
  confirming: boolean
  /** An archive or restore for this row is being saved. */
  pending: boolean
  onAskArchive: (item: QuestListItem) => void
  onCancelArchive: () => void
  onConfirmArchive: (item: QuestListItem) => void
  onRestore: (item: QuestListItem) => void
}

/** The text buttons of the action row share the space; the arrows keep a fixed 44 px square. */
const ACTION = cn(BUTTON, 'flex-1 px-3')
const MOVE = cn(BUTTON, 'w-11 shrink-0 px-0')

/** One quest in the management list: what it is, plus the actions that make sense for its state. */
export function QuestRow({
  item,
  reorder,
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

  // Moving a row re-inserts its element, which can drop keyboard focus: give it back to the arrow just used.
  const moveUp = useRef<HTMLButtonElement>(null)
  const moveDown = useRef<HTMLButtonElement>(null)
  const refocus = useRef<'up' | 'down' | null>(null)
  useLayoutEffect(() => {
    if (refocus.current === null) return
    const target = refocus.current === 'up' ? moveUp.current : moveDown.current
    refocus.current = null
    target?.focus()
  })

  const first = reorder !== undefined && reorder.position === 1
  const last = reorder !== undefined && reorder.position === reorder.total
  const requestMove = (direction: 'up' | 'down') => {
    if (reorder === undefined || (direction === 'up' ? first : last)) return
    refocus.current = direction
    reorder.onMove(direction)
  }

  return (
    <li
      ref={reorder?.rowRef}
      data-quest-id={item.templateId}
      data-dragging={reorder?.dragging ? '' : undefined}
      className={cn(
        'system-panel p-3',
        reorder?.dragging && 'z-10 border-accent bg-surface-raised shadow-glow',
      )}
    >
      {/* Title block first in the DOM; the position and handle are shown to its left (flex order). */}
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{item.title}</p>
          <p className="text-sm text-muted">{recurrenceListText(item.recurrence)}</p>
          <p className="text-sm text-muted">
            Difficulty {item.difficulty} · +{item.expReward} EXP · {categoryLabel(item.category)}
          </p>
          {item.datePassed && <p className="text-sm text-warning">Date passed</p>}
        </div>
        {reorder !== undefined && (
          <div className="order-first flex w-11 shrink-0 flex-col items-center gap-1">
            <span aria-hidden="true" className="font-display text-sm leading-none font-bold tabular-nums text-accent">
              {String(reorder.position).padStart(2, '0')}
            </span>
            <span className="sr-only">
              Position {reorder.position} of {reorder.total}
            </span>
            {/* Pointer-only: keyboard and screen-reader players use the Move buttons below. */}
            <div
              aria-hidden="true"
              data-drag-handle=""
              {...reorder.handleProps}
              className="flex size-11 cursor-grab touch-none items-center justify-center rounded-[3px] border border-border bg-surface-raised text-muted select-none active:cursor-grabbing"
            >
              <GripVertical className="size-5" />
            </div>
          </div>
        )}
      </div>

      {archived ? (
        item.canRestore ? (
          <div className="mt-3 flex flex-wrap gap-2">
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
          <div className="mt-3 flex flex-wrap gap-2">
            {reorder !== undefined && (
              <>
                <button
                  ref={moveUp}
                  type="button"
                  aria-label={`Move ${item.title} up`}
                  aria-disabled={first}
                  onClick={() => requestMove('up')}
                  className={cn(MOVE, first && 'opacity-40')}
                >
                  <ChevronUp aria-hidden="true" className="size-5" />
                </button>
                <button
                  ref={moveDown}
                  type="button"
                  aria-label={`Move ${item.title} down`}
                  aria-disabled={last}
                  onClick={() => requestMove('down')}
                  className={cn(MOVE, last && 'opacity-40')}
                >
                  <ChevronDown aria-hidden="true" className="size-5" />
                </button>
              </>
            )}
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
