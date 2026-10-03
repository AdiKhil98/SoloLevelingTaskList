/** The five permanent player categories (MASTER_SPEC §5.4). Not extensible. */
export const CATEGORIES = [
  'discipline',
  'fitness',
  'business',
  'knowledge',
  'trading',
] as const

export type Category = (typeof CATEGORIES)[number]

export function isCategory(value: unknown): value is Category {
  return (
    typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
  )
}
