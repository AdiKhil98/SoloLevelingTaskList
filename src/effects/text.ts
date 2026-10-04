/** Pure helpers for the two text effects. Neither touches the DOM or a clock. */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+<>/'
/** Characters that keep their place while the rest scrambles. */
const KEEP = /[^A-Za-z0-9]/

/** Clamps to [0, 1]; anything that is not a finite number counts as 0. */
function unit(progress: number): number {
  return Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
}

/**
 * One frame of the scramble: the first `progress` share of the letters and
 * digits is already the real text, the rest shows random glyphs. Spaces,
 * punctuation and symbols (including `?` and `→`) always stay as they are, so
 * the line never changes width or reads as noise. At progress 1 it is exactly
 * the input.
 */
export function scrambleFrame(text: string, progress: number, random: () => number): string {
  const chars = Array.from(text)
  const settled = Math.floor(unit(progress) * chars.length)
  return chars
    .map((char, index) => {
      if (index < settled || KEEP.test(char)) return char
      return GLYPHS[Math.floor(random() * GLYPHS.length)] ?? char
    })
    .join('')
}

/** The first `progress` share of the characters (by code point). At progress 1 it is exactly the input. */
export function typedPrefix(text: string, progress: number): string {
  const chars = Array.from(text)
  return chars.slice(0, Math.ceil(unit(progress) * chars.length)).join('')
}

export function easeOutCubic(progress: number): number {
  const p = unit(progress)
  return 1 - (1 - p) ** 3
}

/** The value `from → to` at `progress`, eased and rounded to a whole number (EXP never shows fractions). */
export function interpolateWhole(from: number, to: number, progress: number): number {
  return Math.round(from + (to - from) * easeOutCubic(progress))
}
