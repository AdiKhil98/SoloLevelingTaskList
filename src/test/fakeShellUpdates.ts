import { vi } from 'vitest'
import type { ShellUpdateSnapshot, ShellUpdates } from '@/platform/shellUpdates'

/**
 * A stand-in for the service-worker update store, for UI tests. It behaves like the real one where the UI can see
 * it: `later()` dismisses, `restart()` marks the update as applying (and, like the real one, never reloads here).
 * Test-only.
 */
export function createFakeShellUpdates(initial: Partial<ShellUpdateSnapshot> = {}) {
  let snapshot: ShellUpdateSnapshot = { updateReady: false, applying: false, dismissed: false, ...initial }
  const listeners = new Set<() => void>()
  const set = (patch: Partial<ShellUpdateSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    for (const listener of [...listeners]) listener()
  }
  const restart = vi.fn(() => set({ applying: true }))
  const later = vi.fn(() => set({ dismissed: true }))
  const updates: ShellUpdates = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start: vi.fn(async () => undefined),
    restart,
    later,
  }
  return { updates, set, restart, later }
}
