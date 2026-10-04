import { err, ok, type Result } from '../types/result'

/**
 * The player's chosen name (Phase 11). It is identity, never gameplay: nothing
 * in the engine reads it, and it can never change EXP, levels, streaks or scores.
 *
 * A name is stored exactly as `parsePlayerName` returns it, so the stored form is
 * always its own normalized form (`isStoredPlayerName`). `null` means "no name
 * chosen": the screens show the generic `PLAYER` label (presentation text).
 */

/** The longest name, in user-perceived characters (grapheme clusters). */
export const PLAYER_NAME_MAX_GRAPHEMES = 20

/** A storage guard on top of the grapheme limit (a cluster can hold many code units). */
export const PLAYER_NAME_MAX_UNITS = 96

export type PlayerNameErrorCode =
  /** More than `PLAYER_NAME_MAX_GRAPHEMES` characters, or more than `PLAYER_NAME_MAX_UNITS` code units. */
  | 'too_long'
  /** Contains control, private-use, lone-surrogate or invisible format characters (ZWJ and ZWNJ excepted). */
  | 'invalid_characters'
  /** Only invisible characters: nothing a person could read. */
  | 'no_visible_characters'

/**
 * Control (Cc), private-use (Co) and lone-surrogate (Cs) characters, and format
 * characters (Cf: zero-width space, BOM, soft hyphen, bidi overrides and marks)
 * EXCEPT the zero-width joiner and non-joiner: emoji sequences and Persian/Indic
 * scripts need those two.
 */
const UNSAFE_CHARACTER = /[\p{Cc}\p{Co}\p{Cs}]|(?![‌‍])\p{Cf}/u

/** At least one character a person can see: a letter, number, symbol (emoji) or punctuation mark. */
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{S}\p{P}]/u

const segmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('en', { granularity: 'grapheme' })
    : null

/** User-perceived characters; code points where `Intl.Segmenter` does not exist. */
export function countGraphemes(text: string): number {
  if (segmenter === null) return Array.from(text).length
  let count = 0
  for (const _segment of segmenter.segment(text)) {
    void _segment
    count += 1
  }
  return count
}

/** Unicode NFC, every whitespace run (spaces, tabs, line breaks, NBSP, …) collapsed to one space, trimmed. */
function normalizeName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim()
}

/**
 * Normalizes and validates a typed name.
 *
 *  - blank (nothing but whitespace) → `ok(null)`: no name, shown as `PLAYER`;
 *  - otherwise `ok(name)` with the normalized text, or the first problem found.
 *
 * Unicode names of any script are allowed. The text is never interpreted as
 * markup: `<`, `&` and quotes are ordinary characters, and the UI renders a name
 * only as text.
 */
export function parsePlayerName(raw: string): Result<string | null, PlayerNameErrorCode> {
  const name = normalizeName(raw)
  if (name === '') return ok(null)
  if (UNSAFE_CHARACTER.test(name)) return err('invalid_characters')
  if (!VISIBLE_CHARACTER.test(name)) return err('no_visible_characters')
  if (name.length > PLAYER_NAME_MAX_UNITS || countGraphemes(name) > PLAYER_NAME_MAX_GRAPHEMES) return err('too_long')
  return ok(name)
}

/** True for a string that is already a valid, normalized name (what storage must hold). */
export function isStoredPlayerName(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = parsePlayerName(value)
  return parsed.ok && parsed.value === value
}
