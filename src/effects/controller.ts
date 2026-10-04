import { EMPTY_QUEUE, queueReducer, type QueueAction, type QueueState } from './queue'
import type { PresentationEntry } from './types'

/**
 * A tiny external store around the pure queue reducer, shaped for React's
 * `useSyncExternalStore`: `getState` returns the same object until something
 * actually changes. It is framework-free so the application wiring and the
 * tests can drive it without rendering anything.
 */
export interface PresentationController {
  getState(): QueueState
  subscribe(listener: () => void): () => void
  dispatch(action: QueueAction): void
  /** Adds entries (deduplicated by id). */
  enqueue(entries: readonly PresentationEntry[]): void
}

export function createPresentationController(initial: QueueState = EMPTY_QUEUE): PresentationController {
  let state = initial
  const listeners = new Set<() => void>()
  const dispatch = (action: QueueAction) => {
    const next = queueReducer(state, action)
    if (next === state) return
    state = next
    for (const listener of [...listeners]) listener()
  }
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispatch,
    enqueue: (entries) => dispatch({ type: 'enqueue', entries }),
  }
}
