import { useMemo, useState } from 'react'
import { countGraphemes, parsePlayerName, type PlayerNameErrorCode } from '@/domain'

export interface PlayerNameDraft {
  /** The raw text in the field. */
  readonly value: string
  readonly setValue: (next: string) => void
  /** The rule that fails, if any (shown as the player types). */
  readonly error: PlayerNameErrorCode | null
  /** True when the field is empty or only whitespace. */
  readonly blank: boolean
  /** The name as it would be stored: normalized and valid, or null (blank or invalid). */
  readonly name: string | null
  /** Characters typed so far, as a person counts them. */
  readonly count: number
}

/** The state of one name field. It only reflects the domain's rules; it decides nothing itself. */
export function usePlayerNameDraft(initial = ''): PlayerNameDraft {
  const [value, setValue] = useState(initial)
  return useMemo(() => {
    const parsed = parsePlayerName(value)
    return {
      value,
      setValue,
      error: parsed.ok ? null : parsed.error,
      blank: parsed.ok && parsed.value === null,
      name: parsed.ok ? parsed.value : null,
      count: countGraphemes(value.trim()),
    }
  }, [value])
}
