import { STORE } from '../config'
import type { Migration } from './index'

/**
 * Schema v4 (Phase 09): adds `sortOrder` to every quest template (manual quest
 * ordering). No store or index is added; existing rows are rewritten once, here,
 * so that afterwards every template carries a unique non-negative integer.
 *
 * THIS FILE IS VERSION-FROZEN. It describes how a Phase 08 (schema v3) database
 * and a schema-3 backup become schema 4, and it must keep doing exactly that
 * whatever later phases change: it imports nothing from the domain or the
 * application and keeps its own copy of the Phase 08 rules below. Do not edit
 * `PHASE_08_SEED_KEY_ORDER` or the comparator; add a new migration instead.
 *
 * The assignment reproduces the Phase 08 visible order, so the upgrade changes
 * nothing the player could see:
 *   1. the approved default quests, in their Phase 08 order (even if archived);
 *   2. every other template, oldest `createdAt` first, then by template id.
 * Archived templates take part, so a restored quest returns to the place it held.
 * The result is dense: 0, 1, 2, … n-1.
 */

/** Seed keys of the six default quests in their Phase 08 display order. Frozen. */
export const PHASE_08_SEED_KEY_ORDER: readonly string[] = [
  'prayer.fajr',
  'prayer.dhuhr',
  'prayer.asr',
  'prayer.maghrib',
  'prayer.isha',
  'sleep',
]

type RawTemplate = Record<string, unknown>

function isRawObject(value: unknown): value is RawTemplate {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function seedPosition(template: RawTemplate): number | undefined {
  const { seedKey } = template
  if (typeof seedKey !== 'string') return undefined
  const position = PHASE_08_SEED_KEY_ORDER.indexOf(seedKey)
  return position === -1 ? undefined : position
}

function createdAtOf(template: RawTemplate): number {
  return typeof template.createdAt === 'number' ? template.createdAt : 0
}

function idOf(template: RawTemplate): string {
  return typeof template.id === 'string' ? template.id : ''
}

/** The Phase 08 comparator (`compareQuestOrder` of that phase), restated here so it can never drift. */
function comparePhase08Order(a: RawTemplate, b: RawTemplate): number {
  const positionA = seedPosition(a)
  const positionB = seedPosition(b)
  if (positionA !== undefined && positionB !== undefined && positionA !== positionB) return positionA - positionB
  if (positionA !== undefined && positionB === undefined) return -1
  if (positionA === undefined && positionB !== undefined) return 1

  const createdA = createdAtOf(a)
  const createdB = createdAtOf(b)
  if (createdA !== createdB) return createdA < createdB ? -1 : 1
  const idA = idOf(a)
  const idB = idOf(b)
  if (idA < idB) return -1
  if (idA > idB) return 1
  return 0
}

/**
 * Gives every template object a `sortOrder` that reproduces the Phase 08 order.
 * Returns new objects in the SAME positions as the input (the input is not
 * modified); anything that is not a plain object is returned untouched, to be
 * rejected later by validation rather than by the upgrade.
 */
export function assignPhase08SortOrder(templates: readonly unknown[]): unknown[] {
  const ranked = templates.filter(isRawObject).sort(comparePhase08Order)
  const rankOf = new Map<RawTemplate, number>(ranked.map((template, index) => [template, index]))
  return templates.map((template) =>
    isRawObject(template) ? { ...template, sortOrder: rankOf.get(template) ?? 0 } : template,
  )
}

/**
 * Backfills the templates of an open schema-3 database inside the live
 * version-change transaction, so the upgrade is all-or-nothing: if anything
 * fails the transaction aborts and the database stays at schema 3.
 */
export const migrateToV4: Migration = (_database, transaction) => {
  const store = transaction.objectStore(STORE.templates)
  const request = store.getAll()
  request.onsuccess = () => {
    try {
      const rows = request.result as unknown[]
      assignPhase08SortOrder(rows).forEach((row, index) => {
        if (row !== rows[index]) store.put(row)
      })
    } catch {
      transaction.abort()
    }
  }
}
