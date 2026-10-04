import { describe, expect, it } from 'vitest'
import {
  countGraphemes,
  isStoredPlayerName,
  parsePlayerName,
  PLAYER_NAME_MAX_GRAPHEMES,
  PLAYER_NAME_MAX_UNITS,
} from './playerName'

const valid = (raw: string) => {
  const parsed = parsePlayerName(raw)
  if (!parsed.ok) throw new Error(`expected "${raw}" to be valid, got ${parsed.error}`)
  return parsed.value
}
const invalid = (raw: string) => {
  const parsed = parsePlayerName(raw)
  if (parsed.ok) throw new Error(`expected "${raw}" to be rejected, got ${String(parsed.value)}`)
  return parsed.error
}

describe('parsePlayerName — trimming and blank', () => {
  it('trims surrounding whitespace, including Unicode spaces and line breaks', () => {
    expect(valid('  Adi  ')).toBe('Adi')
    expect(valid('  Adi\n\t')).toBe('Adi')
  })

  it('treats nothing-but-whitespace as no name (null), never an error', () => {
    expect(valid('')).toBeNull()
    expect(valid('   ')).toBeNull()
    expect(valid('\n\t  ')).toBeNull()
  })

  it('collapses every inner whitespace run to one space (a pasted line break becomes a space)', () => {
    expect(valid('Adi    Khil')).toBe('Adi Khil')
    expect(valid('Adi\n\tKhil')).toBe('Adi Khil')
  })
})

describe('parsePlayerName — Unicode', () => {
  it('accepts names in any script', () => {
    expect(valid('אדי')).toBe('אדי')
    expect(valid('علي')).toBe('علي')
    expect(valid('李小龍')).toBe('李小龍')
    expect(valid('Ωmega-7')).toBe('Ωmega-7')
    expect(valid('Zoë')).toBe('Zoë')
  })

  it('normalizes to NFC so one name has one stored form', () => {
    const decomposed = 'José' // "e" + combining acute
    expect(valid(decomposed)).toBe('José')
    expect(valid(decomposed)).toBe(valid('José'))
  })

  it('accepts emoji, including ZWJ sequences, and keeps ZWNJ (needed in Persian and Indic scripts)', () => {
    expect(valid('🐺')).toBe('🐺')
    expect(valid('👨‍👩‍👧')).toBe('👨‍👩‍👧')
    expect(valid('می‌خواهم')).toBe('می‌خواهم')
  })

  it('treats markup characters as ordinary text (nothing is ever interpreted as HTML)', () => {
    expect(valid('<b>Ada</b> & "Co"')).toBe('<b>Ada</b> & "Co"')
    expect(valid('<script>')).toBe('<script>')
  })
})

describe('parsePlayerName — unsafe and invisible characters', () => {
  it.each([
    ['NUL', 'Ad\u0000i'],
    ['an ASCII control', 'Ad\u0007i'],
    ['DEL', 'Ad\u007fi'],
    ['a C1 control', 'Ad\u0090i'],
    ['zero-width space', 'Ad​i'],
    ['a soft hyphen', 'Ad­i'],
    ['a word joiner', 'Ad⁠i'],
    ['a right-to-left override', 'Ad‮i'],
    ['a bidi isolate', 'Ad⁦i'],
    ['a left-to-right mark', 'Ad‎i'],
    ['a private-use character', 'Adi'],
    ['a lone surrogate', 'Ad\ud800i'],
  ])('rejects %s', (_label, raw) => {
    expect(invalid(raw)).toBe('invalid_characters')
  })

  it('rejects a name with nothing a person can see (only ZWJ / ZWNJ)', () => {
    expect(invalid('‍')).toBe('no_visible_characters')
    expect(invalid('‌‍‌')).toBe('no_visible_characters')
  })

  it('accepts punctuation-only and symbol-only names as visible', () => {
    expect(valid('...')).toBe('...')
    expect(valid('★')).toBe('★')
  })
})

describe('parsePlayerName — length', () => {
  it('allows exactly the maximum number of characters and rejects one more', () => {
    expect(valid('a'.repeat(PLAYER_NAME_MAX_GRAPHEMES))).toHaveLength(PLAYER_NAME_MAX_GRAPHEMES)
    expect(invalid('a'.repeat(PLAYER_NAME_MAX_GRAPHEMES + 1))).toBe('too_long')
  })

  it('counts user-perceived characters, not code units: 20 emoji fit, 21 do not', () => {
    expect(valid('🐺'.repeat(20))).toBe('🐺'.repeat(20))
    expect(invalid('🐺'.repeat(21))).toBe('too_long')
    expect(countGraphemes('👨‍👩‍👧')).toBe(1)
    expect(countGraphemes('é')).toBe(1)
  })

  it('measures the length AFTER trimming and collapsing whitespace', () => {
    expect(valid(`   ${'a'.repeat(20)}   `)).toHaveLength(20)
    expect(valid('a  b   c')).toBe('a b c')
  })

  it('bounds storage even when few characters hide many code units', () => {
    const heavy = 'x' + '́'.repeat(PLAYER_NAME_MAX_UNITS) // one grapheme ("x" has no precomposed form), far too many code units
    expect(countGraphemes(heavy)).toBe(1)
    expect(invalid(heavy)).toBe('too_long')
  })
})

describe('isStoredPlayerName', () => {
  it('accepts only an already-normalized, valid name', () => {
    expect(isStoredPlayerName('Adi')).toBe(true)
    expect(isStoredPlayerName('אדי')).toBe(true)
  })

  it.each([
    ['padded', ' Adi'],
    ['empty', ''],
    ['double space', 'Adi  Khil'],
    ['too long', 'a'.repeat(21)],
    ['a control character', 'Ad\u0007i'],
    ['not NFC', 'José'],
  ])('rejects a stored value that is %s', (_label, value) => {
    expect(isStoredPlayerName(value)).toBe(false)
  })

  it('rejects anything that is not a string', () => {
    expect(isStoredPlayerName(null)).toBe(false)
    expect(isStoredPlayerName(undefined)).toBe(false)
    expect(isStoredPlayerName(42)).toBe(false)
  })
})
