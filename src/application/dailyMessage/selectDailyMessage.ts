import { asDateKey, daysBetween, type DateKey } from '@/domain'
import { DAILY_MESSAGES } from './catalog'

/**
 * Selection strategy: a date's message is the catalog entry at
 *
 *   daysBetween(ANCHOR, dateKey) mod catalog size   (always non-negative)
 *
 * so the catalog is walked one entry per calendar day and cycles without a
 * repeat until it is exhausted. The function is pure: the same `DateKey` and
 * the same catalog always give the same message, with no random source, no
 * stored assignment and no clock.
 */
const ANCHOR: DateKey = asDateKey('2026-01-01')

export interface DailyMessage {
  readonly index: number
  readonly text: string
}

export function dailyMessageIndexFor(
  dateKey: DateKey,
  catalogSize: number = DAILY_MESSAGES.length,
): number {
  const offset = daysBetween(ANCHOR, dateKey)
  return ((offset % catalogSize) + catalogSize) % catalogSize
}

export function selectDailyMessage(dateKey: DateKey): DailyMessage {
  const index = dailyMessageIndexFor(dateKey)
  // The index is always inside the (non-empty) catalog; the fallback only
  // satisfies the type checker's indexed-access rule.
  const text = DAILY_MESSAGES[index] ?? DAILY_MESSAGES[0] ?? ''
  return { index, text }
}
