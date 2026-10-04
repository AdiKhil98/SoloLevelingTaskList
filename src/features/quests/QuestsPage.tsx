import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { QuestListItem } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { BUTTON, BUTTON_PRIMARY, EMPTY_STATE, NOTICE_DANGER } from '@/components/ui/styles'
import { cn } from '@/lib/utils'
import { QuestRow } from './QuestRow'
import { FLASH_NOTICE_TEXT, saveFailureText, type FlashNotice } from './questMessages'
import { moveItem } from './sortable'
import { useFlashNotice } from './useFlashNotice'
import { useSortableList } from './useSortableList'

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly active: readonly QuestListItem[]; readonly archived: readonly QuestListItem[] }
  | { readonly status: 'failed' }

type View = 'active' | 'archived'

const TAB = 'flex-1'

const STALE_ORDER_TEXT = 'Your quests changed in another tab or window, so the list was reloaded. Please try the move again.'

/**
 * Quest management: the player's quest templates, active and archived. It
 * displays what the application layer lists and forwards the player's intent
 * (archive, restore, reorder) to it. Archiving is deliberate (a confirmation
 * first) and never deletes anything.
 *
 * Reordering: the active list is the player's manual order, which Home follows.
 * A drop (or a Move button) shows the new order at once and stores it through one
 * application call; stores are queued so each one is checked against the order
 * the previous one left, and a refusal (the list changed elsewhere) reloads the
 * list instead of overwriting anything.
 */
export function QuestsPage() {
  const { quests } = useAppRuntime()
  const flash = useFlashNotice()

  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [view, setView] = useState<View>('active')
  const [notice, setNotice] = useState<FlashNotice | null>(flash)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  // The order last known to be stored, and the chain of stores in flight (see the component comment).
  const storedOrder = useRef<readonly string[]>([])
  const writes = useRef<Promise<void>>(Promise.resolve())
  const generation = useRef(0)

  useEffect(() => {
    let cancelled = false
    void quests.list().then((result) => {
      if (cancelled) return
      if (result.status === 'ok') {
        storedOrder.current = result.active.map((item) => item.templateId)
        setList(result)
      } else {
        console.error('Listing quests failed', result.cause)
        setList({ status: 'failed' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [quests, version])

  const refreshList = () => setVersion((current) => current + 1)

  const handleConfirmArchive = async (item: QuestListItem) => {
    if (pendingId !== null) return
    setPendingId(item.templateId)
    setNotice(null)
    setAnnouncement(null)
    setErrorText(null)
    try {
      const result = await quests.archive(item.templateId)
      switch (result.status) {
        case 'archived':
        case 'already_archived':
          setConfirmingId(null)
          setNotice('archived')
          refreshList()
          break
        case 'not_found':
          setConfirmingId(null)
          setErrorText('That quest no longer exists.')
          refreshList()
          break
        case 'failed':
          console.error('Archiving a quest failed', result.cause)
          setErrorText(saveFailureText(result.reason, 'archive'))
          break
      }
    } finally {
      setPendingId(null)
    }
  }

  const handleRestore = async (item: QuestListItem) => {
    if (pendingId !== null) return
    setPendingId(item.templateId)
    setNotice(null)
    setAnnouncement(null)
    setErrorText(null)
    try {
      const result = await quests.restore(item.templateId)
      switch (result.status) {
        case 'restored':
        case 'already_active':
          setNotice('restored')
          refreshList()
          break
        case 'expired':
          setErrorText('That quest’s date has passed, so it cannot be restored.')
          refreshList()
          break
        case 'not_found':
          setErrorText('That quest no longer exists.')
          refreshList()
          break
        case 'failed':
          console.error('Restoring a quest failed', result.cause)
          setErrorText(saveFailureText(result.reason, 'restore'))
          break
      }
    } finally {
      setPendingId(null)
    }
  }

  /** Shows `newOrder` at once and queues its store. Called once per drop or Move button press. */
  const applyOrder = (newOrder: readonly string[], movedId: string) => {
    if (list.status !== 'ok') return
    const byId = new Map(list.active.map((item) => [item.templateId, item]))
    const moved = byId.get(movedId)
    setList({ ...list, active: newOrder.flatMap((id) => byId.get(id) ?? []) })
    setNotice(null)
    setErrorText(null)
    setConfirmingId(null)
    if (moved !== undefined) {
      setAnnouncement(`${moved.title} moved to position ${newOrder.indexOf(movedId) + 1} of ${newOrder.length}.`)
    }

    const mine = generation.current
    writes.current = writes.current.then(async () => {
      if (mine !== generation.current) return // an earlier store failed and the list was reloaded
      const result = await quests.reorder({ expectedOrder: storedOrder.current, newOrder })
      if (mine !== generation.current) return
      switch (result.status) {
        case 'reordered':
        case 'unchanged':
          storedOrder.current = result.order
          break
        case 'stale':
        case 'invalid':
          generation.current += 1
          setAnnouncement(null)
          setErrorText(STALE_ORDER_TEXT)
          refreshList()
          break
        case 'failed':
          generation.current += 1
          console.error('Reordering quests failed', result.cause)
          setAnnouncement(null)
          setErrorText(saveFailureText(result.reason, 'reorder'))
          refreshList()
          break
      }
    })
  }

  const activeItems = list.status === 'ok' ? list.active : []
  const activeIds = activeItems.map((item) => item.templateId)

  const { draggingId, rowRef, handleProps } = useSortableList({
    ids: activeIds,
    onReorder: applyOrder,
    disabled: list.status !== 'ok' || view !== 'active',
  })

  const items = list.status === 'ok' ? (view === 'active' ? list.active : list.archived) : []

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel as="h1" className="text-sm tracking-[0.3em] text-accent">
          QUESTS
        </SectionLabel>
        <Link to="/quests/new" className={cn(BUTTON_PRIMARY, 'gap-1.5 font-semibold')}>
          <Plus aria-hidden="true" className="size-5" />
          Add Quest
        </Link>
      </div>

      {/* Stays in the page (empty) so screen readers announce text added to it (confirmations and move results). */}
      <p role="status" className="text-sm text-accent empty:hidden">
        {announcement ?? (notice === null ? '' : FLASH_NOTICE_TEXT[notice])}
      </p>
      {errorText !== null && (
        <p role="alert" className={NOTICE_DANGER}>
          {errorText}
        </p>
      )}

      {list.status === 'loading' && <p className="text-muted">Loading quests…</p>}

      {list.status === 'failed' && (
        <div role="alert" className={cn(NOTICE_DANGER, 'flex flex-col items-start gap-2')}>
          <p>Your quests could not be loaded.</p>
          <button
            type="button"
            onClick={() => {
              setList({ status: 'loading' })
              refreshList()
            }}
            className={BUTTON}
          >
            Retry
          </button>
        </div>
      )}

      {list.status === 'ok' && (
        <>
          <div role="group" aria-label="Show quests" className="flex gap-2">
            <button
              type="button"
              aria-pressed={view === 'active'}
              onClick={() => setView('active')}
              className={cn(BUTTON, TAB, view === 'active' ? 'border-accent bg-accent/15' : 'text-muted')}
            >
              Active ({list.active.length})
            </button>
            <button
              type="button"
              aria-pressed={view === 'archived'}
              onClick={() => setView('archived')}
              className={cn(BUTTON, TAB, view === 'archived' ? 'border-accent bg-accent/15' : 'text-muted')}
            >
              Archived ({list.archived.length})
            </button>
          </div>

          {view === 'active' && list.active.length > 1 && (
            <p className="text-sm text-muted">
              Drag a quest by its handle, or use the arrow buttons, to set the order. Home shows your quests in this order.
            </p>
          )}

          {items.length === 0 ? (
            <p className={EMPTY_STATE}>
              {view === 'active' ? 'No active quests. Add one to get started.' : 'No archived quests.'}
            </p>
          ) : (
            <ul aria-label={view === 'active' ? 'Active quests' : 'Archived quests'} className="flex flex-col gap-2.5">
              {items.map((item, index) => (
                <QuestRow
                  key={item.templateId}
                  item={item}
                  reorder={
                    view === 'active'
                      ? {
                          position: index + 1,
                          total: items.length,
                          dragging: draggingId === item.templateId,
                          rowRef: rowRef(item.templateId),
                          handleProps: handleProps(item.templateId),
                          onMove: (direction) => {
                            const to = direction === 'up' ? index - 1 : index + 1
                            if (to < 0 || to >= activeIds.length) return
                            applyOrder(moveItem(activeIds, index, to), item.templateId)
                          },
                        }
                      : undefined
                  }
                  confirming={confirmingId === item.templateId}
                  pending={pendingId === item.templateId}
                  onAskArchive={(target) => {
                    setErrorText(null)
                    setNotice(null)
                    setAnnouncement(null)
                    setConfirmingId(target.templateId)
                  }}
                  onCancelArchive={() => setConfirmingId(null)}
                  onConfirmArchive={handleConfirmArchive}
                  onRestore={handleRestore}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
