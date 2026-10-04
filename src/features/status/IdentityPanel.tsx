import { UserRoundPen } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useAppRuntime } from '@/app/runtimeContext'
import { Panel } from '@/components/ui/Panel'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { BUTTON, BUTTON_PRIMARY, BUTTON_QUIET } from '@/components/ui/styles'
import { playerDisplayName, PLAYER_LABEL } from '../displayLabels'
import { NameField } from '../identity/NameField'
import { NAME_HINT, playerNameErrorText } from '../identity/nameText'
import { usePlayerNameDraft } from '../identity/usePlayerNameDraft'

const SAVE_FAILED_TEXT = 'Your name could not be saved, so nothing has changed. Please try again.'
const NOT_AWAKENED_TEXT = 'There is no player to rename yet.'

/** The inline editor, mounted only while editing so its draft always starts from the stored name. */
function IdentityEditor({ stored, onDone }: { stored: string | null; onDone: (saved: boolean) => void }) {
  const { identity } = useAppRuntime()
  const draft = usePlayerNameDraft(stored ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return // a double tap must not save twice
    if (draft.error !== null) {
      inputRef.current?.focus()
      return
    }
    inFlight.current = true
    setSaving(true)
    setProblem(null)
    const result = await identity.rename(draft.value)
    inFlight.current = false
    setSaving(false)
    switch (result.status) {
      case 'renamed':
      case 'unchanged':
        onDone(result.status === 'renamed')
        return
      case 'rejected':
        setProblem(playerNameErrorText(result.reason))
        break
      case 'not_awakened':
        setProblem(NOT_AWAKENED_TEXT)
        break
      case 'failed':
        console.error('Renaming the player failed', result.cause)
        setProblem(SAVE_FAILED_TEXT)
        break
    }
    inputRef.current?.focus()
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
      <NameField
        id="identity-name"
        label="Player name"
        draft={draft}
        inputRef={inputRef}
        disabled={saving}
        hint={`${NAME_HINT} Leave it empty to be called ${PLAYER_LABEL}.`}
        alert={problem}
      />
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={BUTTON_PRIMARY}>
          {saving ? 'SAVING…' : 'SAVE'}
        </button>
        <button type="button" disabled={saving} onClick={() => onDone(false)} className={BUTTON_QUIET}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * IDENTITY: the player's name, and a small inline editor for it (Phase 11). It
 * only ever reads and renames the profile: renaming never replays Awakening,
 * never changes EXP, level or any other progression, and shows at once.
 */
export function IdentityPanel() {
  const { identity } = useAppRuntime()
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)

  function finish(didSave: boolean) {
    setEditing(false)
    setSaved(didSave)
    // The editor is gone: put focus back where the player started.
    queueMicrotask(() => editButton.current?.focus())
  }

  return (
    <Panel aria-labelledby="identity-heading" className="flex flex-col gap-3 p-4">
      <SectionLabel id="identity-heading">IDENTITY</SectionLabel>
      {editing ? (
        <IdentityEditor stored={identity.name} onDone={finish} />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold tracking-[0.14em] text-muted uppercase">Player name</p>
            <p dir="auto" className="font-display text-lg font-semibold tracking-[0.1em] break-words">
              {playerDisplayName(identity.name)}
            </p>
          </div>
          <button
            ref={editButton}
            type="button"
            onClick={() => {
              setSaved(false)
              setEditing(true)
            }}
            className={BUTTON}
          >
            <UserRoundPen aria-hidden="true" className="mr-2 size-4" />
            Edit name
          </button>
        </div>
      )}
      <p role="status" className="text-sm text-accent-2">
        {saved ? 'Name saved.' : ''}
      </p>
    </Panel>
  )
}
