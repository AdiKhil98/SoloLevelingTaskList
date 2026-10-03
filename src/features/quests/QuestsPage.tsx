import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { QuestListItem } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { cn } from '@/lib/utils'
import { QuestRow } from './QuestRow'
import { FLASH_NOTICE_TEXT, saveFailureText, type FlashNotice } from './questMessages'
import { useFlashNotice } from './useFlashNotice'

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly active: readonly QuestListItem[]; readonly archived: readonly QuestListItem[] }
  | { readonly status: 'failed' }

type View = 'active' | 'archived'

const TAB =
  'inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/**
 * Quest management: the player's quest templates, active and archived. It
 * displays what the application layer lists and forwards the player's intent
 * (archive, restore) to it. Archiving is deliberate (a confirmation first) and
 * never deletes anything.
 */
export function QuestsPage() {
  const { quests } = useAppRuntime()
  const flash = useFlashNotice()

  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [view, setView] = useState<View>('active')
  const [notice, setNotice] = useState<FlashNotice | null>(flash)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void quests.list().then((result) => {
      if (cancelled) return
      if (result.status === 'ok') {
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

  const items = list.status === 'ok' ? (view === 'active' ? list.active : list.archived) : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold tracking-[0.4em] text-accent">QUESTS</h1>
        <Link
          to="/quests/new"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/60 px-3.5 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15"
        >
          <Plus aria-hidden="true" className="size-5" />
          Add Quest
        </Link>
      </div>

      {/* Stays in the page (empty) so screen readers announce text added to it. */}
      <p role="status" className="text-sm text-accent empty:hidden">
        {notice === null ? '' : FLASH_NOTICE_TEXT[notice]}
      </p>
      {errorText !== null && (
        <p role="alert" className="rounded-xl border border-red-400/50 bg-red-500/10 p-3 text-sm">
          {errorText}
        </p>
      )}

      {list.status === 'loading' && <p className="text-muted">Loading quests…</p>}

      {list.status === 'failed' && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-red-400/50 bg-red-500/10 p-3 text-sm">
          <p>Your quests could not be loaded.</p>
          <button
            type="button"
            onClick={() => {
              setList({ status: 'loading' })
              refreshList()
            }}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15"
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
              className={cn(TAB, view === 'active' ? 'border-accent bg-accent/15' : 'border-border text-muted')}
            >
              Active ({list.active.length})
            </button>
            <button
              type="button"
              aria-pressed={view === 'archived'}
              onClick={() => setView('archived')}
              className={cn(TAB, view === 'archived' ? 'border-accent bg-accent/15' : 'border-border text-muted')}
            >
              Archived ({list.archived.length})
            </button>
          </div>

          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-muted">
              {view === 'active' ? 'No active quests. Add one to get started.' : 'No archived quests.'}
            </p>
          ) : (
            <ul aria-label={view === 'active' ? 'Active quests' : 'Archived quests'} className="flex flex-col gap-2.5">
              {items.map((item) => (
                <QuestRow
                  key={item.templateId}
                  item={item}
                  confirming={confirmingId === item.templateId}
                  pending={pendingId === item.templateId}
                  onAskArchive={(target) => {
                    setErrorText(null)
                    setNotice(null)
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
