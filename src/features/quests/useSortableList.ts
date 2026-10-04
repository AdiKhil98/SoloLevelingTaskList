import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { dropIndex, moveItem, shiftFor } from './sortable'

/** Pointer travel (px) before a press on the handle becomes a drag; a smaller wobble is ignored. */
export const DRAG_THRESHOLD_PX = 6

/** Auto-scroll: how close to the top/bottom of the visible area (px) scrolling starts, and its top speed (px/frame). */
const SCROLL_ZONE_PX = 72
const SCROLL_MAX_SPEED = 16
/** The fixed bottom navigation covers this much of the viewport (its height plus a margin). */
const BOTTOM_COVER_PX = 64

interface Measured {
  readonly center: number
  readonly height: number
  readonly top: number
  readonly bottom: number
}

interface Drag {
  readonly id: string
  readonly index: number
  readonly pointerId: number
  readonly startY: number
  readonly startScroll: number
  readonly handle: HTMLElement
  /** True once the pointer travelled past the threshold. */
  active: boolean
  lastY: number
  target: number
  rows: Measured[]
  slot: number
  frame: number | null
}

interface UseSortableListOptions {
  /** The current order of the item ids. */
  readonly ids: readonly string[]
  /** The player dropped `movedId`: the whole new order. Called ONCE per completed drag, never while moving. */
  readonly onReorder: (newOrder: string[], movedId: string) => void
  readonly disabled?: boolean
}

/**
 * Drag-to-reorder for a vertical list, on plain Pointer Events (no library).
 *
 *  - Only the drag handle starts a drag; it alone has `touch-action: none`, so the
 *    rest of the page scrolls normally with a finger.
 *  - Movement is drawn with transforms set directly on the rows, so the pointer
 *    never causes a React re-render and nothing is stored while it moves.
 *  - The order is reported once, on release. Pointer cancel, lost capture,
 *    Escape or the page being hidden revert the rows and report nothing.
 *  - Near the top or bottom of the visible area the page scrolls itself.
 */
export function useSortableList({ ids, onReorder, disabled = false }: UseSortableListOptions) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const rows = useRef(new Map<string, HTMLElement>())
  const drag = useRef<Drag | null>(null)
  const idsRef = useRef(ids)
  const onReorderRef = useRef(onReorder)

  useLayoutEffect(() => {
    idsRef.current = ids
    onReorderRef.current = onReorder
  })

  const clearTransforms = useCallback(() => {
    for (const element of rows.current.values()) element.style.transform = ''
  }, [])

  const applyPositions = useCallback((current: Drag) => {
    const travelled = current.lastY - current.startY + (window.scrollY - current.startScroll)
    const draggedCenter = current.rows[current.index]!.center + travelled
    current.target = dropIndex(
      current.rows.map((row) => row.center),
      current.index,
      draggedCenter,
    )
    idsRef.current.forEach((id, index) => {
      const element = rows.current.get(id)
      if (element === undefined) return
      if (index === current.index) {
        element.style.transform = `translateY(${travelled}px)`
      } else {
        const shift = shiftFor(index, current.index, current.target, current.slot)
        element.style.transform = shift === 0 ? '' : `translateY(${shift}px)`
      }
    })
  }, [])

  const stopListening = useRef<() => void>(() => undefined)

  const finish = useCallback(
    (commit: boolean) => {
      const current = drag.current
      if (current === null) return
      drag.current = null
      stopListening.current()
      if (current.frame !== null) cancelAnimationFrame(current.frame)
      try {
        if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId)
      } catch {
        // The capture may already be gone (for example after pointercancel).
      }
      document.body.style.removeProperty('user-select')
      setDraggingId(null)

      if (commit && current.active && current.target !== current.index) {
        // The rows keep their drag offsets until the new order renders (see the layout effect above).
        onReorderRef.current(moveItem(idsRef.current, current.index, current.target), current.id)
      } else {
        clearTransforms()
      }
    },
    [clearTransforms],
  )

  // The order just changed. After a drop the rows are already in their final places, so the drag
  // offsets must go; if a drag is somehow still running (the list was reloaded under it), it is
  // abandoned, because its measurements no longer describe the list.
  const orderKey = ids.join('\u0000')
  useLayoutEffect(() => {
    if (drag.current !== null) finish(false)
    else clearTransforms()
  }, [orderKey, finish, clearTransforms])

  const autoScroll = useCallback(
    (current: Drag) => {
      const step = () => {
        current.frame = null
        if (drag.current !== current || !current.active) return
        const bottomEdge = window.innerHeight - BOTTOM_COVER_PX
        let speed = 0
        if (current.lastY < SCROLL_ZONE_PX) {
          speed = -SCROLL_MAX_SPEED * Math.min(1, (SCROLL_ZONE_PX - current.lastY) / SCROLL_ZONE_PX)
        } else if (current.lastY > bottomEdge - SCROLL_ZONE_PX) {
          speed = SCROLL_MAX_SPEED * Math.min(1, (current.lastY - (bottomEdge - SCROLL_ZONE_PX)) / SCROLL_ZONE_PX)
        }
        if (speed !== 0) {
          const before = window.scrollY
          window.scrollBy(0, speed)
          if (window.scrollY !== before) applyPositions(current)
        }
        current.frame = requestAnimationFrame(step)
      }
      if (current.frame === null) current.frame = requestAnimationFrame(step)
    },
    [applyPositions],
  )

  const begin = useCallback(
    (current: Drag) => {
      const measured: Measured[] = []
      for (const id of idsRef.current) {
        const element = rows.current.get(id)
        if (element === undefined) {
          // A row is missing: do not guess positions.
          finish(false)
          return
        }
        const rect = element.getBoundingClientRect()
        measured.push({ top: rect.top, bottom: rect.bottom, height: rect.height, center: rect.top + rect.height / 2 })
      }
      current.rows = measured
      const self = measured[current.index]!
      const neighbour = current.index > 0 ? measured[current.index - 1]! : measured[current.index + 1]
      const gap = neighbour === undefined ? 0 : current.index > 0 ? self.top - neighbour.bottom : neighbour.top - self.bottom
      current.slot = self.height + Math.max(0, gap)
      current.active = true
      document.body.style.setProperty('user-select', 'none')
      setDraggingId(current.id)
      applyPositions(current)
      autoScroll(current)
    },
    [applyPositions, autoScroll, finish],
  )

  const handleProps = useCallback(
    (id: string) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (disabled || drag.current !== null || !event.isPrimary || event.button !== 0) return
        const index = idsRef.current.indexOf(id)
        if (index === -1) return
        event.preventDefault()
        const handle = event.currentTarget
        try {
          handle.setPointerCapture(event.pointerId)
        } catch {
          // Capture is a convenience (moves keep coming outside the handle); the drag still works without it.
        }
        const current: Drag = {
          id,
          index,
          pointerId: event.pointerId,
          startY: event.clientY,
          startScroll: window.scrollY,
          handle,
          active: false,
          lastY: event.clientY,
          target: index,
          rows: [],
          slot: 0,
          frame: null,
        }
        drag.current = current

        const onKeyDown = (keyEvent: KeyboardEvent) => {
          if (keyEvent.key === 'Escape') finish(false)
        }
        const onHidden = () => {
          if (document.visibilityState === 'hidden') finish(false)
        }
        window.addEventListener('keydown', onKeyDown)
        document.addEventListener('visibilitychange', onHidden)
        stopListening.current = () => {
          window.removeEventListener('keydown', onKeyDown)
          document.removeEventListener('visibilitychange', onHidden)
          stopListening.current = () => undefined
        }
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        const current = drag.current
        if (current === null || event.pointerId !== current.pointerId) return
        current.lastY = event.clientY
        if (!current.active) {
          if (Math.abs(event.clientY - current.startY) < DRAG_THRESHOLD_PX) return
          begin(current)
          return
        }
        applyPositions(current)
      },
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        const current = drag.current
        if (current === null || event.pointerId !== current.pointerId) return
        current.lastY = event.clientY
        if (current.active) applyPositions(current)
        finish(true)
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
        if (drag.current !== null && event.pointerId === drag.current.pointerId) finish(false)
      },
      onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => {
        if (drag.current !== null && event.pointerId === drag.current.pointerId) finish(false)
      },
      onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    }),
    [applyPositions, begin, disabled, finish],
  )

  const rowRef = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element === null) rows.current.delete(id)
      else rows.current.set(id, element)
    },
    [],
  )

  // Leaving the screen mid-drag must leave nothing behind.
  useEffect(
    () => () => {
      const current = drag.current
      if (current !== null) {
        drag.current = null
        if (current.frame !== null) cancelAnimationFrame(current.frame)
      }
      stopListening.current()
      document.body.style.removeProperty('user-select')
    },
    [],
  )

  return { draggingId, rowRef, handleProps }
}
