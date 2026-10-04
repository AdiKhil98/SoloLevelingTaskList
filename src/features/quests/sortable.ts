/**
 * Pure helpers for reordering a list by dragging. They know nothing about the
 * DOM, React or storage: given measurements, they say where an item lands.
 */

/** A copy of `items` with the element at `from` moved to index `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return [...items]
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as T)
  return next
}

/**
 * Where the dragged item lands: its index among the others once its centre is at
 * `draggedCenter`. `centers` are the vertical centres of all items in their
 * resting order (measured once, when the drag starts), so the result does not
 * depend on how far the other rows have visually shifted meanwhile.
 *
 * It is the number of OTHER items whose centre lies above the dragged centre, so
 * a drag that has not moved far enough to cross a neighbour's centre keeps its
 * own index.
 */
export function dropIndex(centers: readonly number[], draggedIndex: number, draggedCenter: number): number {
  let index = 0
  centers.forEach((center, other) => {
    if (other !== draggedIndex && center < draggedCenter) index += 1
  })
  return index
}

/**
 * How far each OTHER item shifts, in px, while the dragged item (at `from`) is
 * over index `to`: the ones it has passed move out of its way by one slot
 * (`slot` = the dragged item's height plus the gap between rows).
 */
export function shiftFor(index: number, from: number, to: number, slot: number): number {
  if (index === from) return 0
  if (to > from && index > from && index <= to) return -slot
  if (to < from && index >= to && index < from) return slot
  return 0
}
