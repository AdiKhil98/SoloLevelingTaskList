import type { Ref } from 'react'
import { PLAYER_NAME_MAX_GRAPHEMES } from '@/domain'
import { cn } from '@/lib/utils'
import { INPUT } from '../quests/FormControls'
import { NAME_HINT, playerNameErrorText } from './nameText'
import type { PlayerNameDraft } from './usePlayerNameDraft'

interface NameFieldProps {
  id: string
  label: string
  draft: PlayerNameDraft
  inputRef?: Ref<HTMLInputElement>
  disabled?: boolean
  /** Replaces the hint line (for example, "Leave empty to use PLAYER"). */
  hint?: string
  /** A problem that is not about the text itself (a failed save), read out when it appears. */
  alert?: string | null
}

/**
 * The player-name text field: a real labelled input, the rule hint, a live
 * character count and the domain's validation message. It never submits or
 * saves anything. The text is only ever rendered as text (React children and
 * input values), never as markup.
 */
export function NameField({ id, label, draft, inputRef, disabled = false, hint = NAME_HINT, alert = null }: NameFieldProps) {
  const errorText = draft.error === null ? null : playerNameErrorText(draft.error)
  const describedBy = [`${id}-hint`, errorText === null ? null : `${id}-error`, alert === null ? null : `${id}-alert`].filter(Boolean).join(' ')
  return (
    <div className="flex flex-col gap-2 text-left">
      <label htmlFor={id} className="font-display text-xs font-semibold tracking-[0.14em] text-muted uppercase">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        dir="auto"
        value={draft.value}
        onChange={(event) => draft.setValue(event.target.value)}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        maxLength={128}
        aria-invalid={draft.error !== null}
        aria-describedby={describedBy}
        className={INPUT}
      />
      <div className="flex items-start justify-between gap-3">
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
        <p aria-hidden="true" className={cn('shrink-0 font-display text-xs tabular-nums', draft.count > PLAYER_NAME_MAX_GRAPHEMES ? 'text-danger' : 'text-muted')}>
          {draft.count}/{PLAYER_NAME_MAX_GRAPHEMES}
        </p>
      </div>
      {/* Always in the page (visually hidden while empty), so a screen reader is told when a problem appears. */}
      <p id={`${id}-error`} aria-live="polite" className={errorText === null ? 'sr-only' : 'text-sm text-danger'}>
        {errorText}
      </p>
      {alert !== null && (
        <p id={`${id}-alert`} role="alert" className="rounded-[3px] border border-danger/50 bg-danger/10 p-3 text-sm">
          {alert}
        </p>
      )}
    </div>
  )
}
