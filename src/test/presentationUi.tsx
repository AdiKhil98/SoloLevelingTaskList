import { act, render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { vi } from 'vitest'
import type { DomainEvent } from '@/domain'
import { planPresentation } from '@/effects/plan'
import { DEFAULT_EFFECTS_SETTINGS, serializeEffectsSettings, type EffectsSettings } from '@/effects/settings'
import { createEffectsSettingsStore } from '@/effects/settingsStore'
import type { PresentationTimings } from '@/effects/timings'
import { PresentationHost } from '@/features/presentation/PresentationHost'
import { createPresentationRuntime, PresentationContext } from '@/features/presentation/runtime'
import { TEST_TIMINGS } from './presentationTimings'

/** UI-test harness for the presentation layer: the real host, queue and overlays, with injected settings, haptics and sound. */

export function memorySettings(initial: Partial<EffectsSettings> = {}, osReduced = false) {
  let stored: string | null = serializeEffectsSettings({ ...DEFAULT_EFFECTS_SETTINGS, ...initial })
  let reduced = osReduced
  const listeners = new Set<() => void>()
  const store = createEffectsSettingsStore({
    read: () => stored,
    write: (value) => {
      stored = value
      return true
    },
    osReducedMotion: {
      get: () => reduced,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  })
  return {
    store,
    stored: () => stored,
    setOsReduced(next: boolean) {
      reduced = next
      act(() => {
        for (const listener of [...listeners]) listener()
      })
    },
  }
}

export interface RenderHostOptions {
  readonly settings?: Partial<EffectsSettings>
  readonly osReduced?: boolean
  readonly timings?: Partial<PresentationTimings>
  readonly path?: string
  /** Rendered next to the host (a HUD, a quest row), inside the same router and runtime. */
  readonly children?: React.ReactNode
}

export function renderHost({ settings, osReduced = false, timings, path = '/', children }: RenderHostOptions = {}) {
  const memory = memorySettings(settings, osReduced)
  const vibrate = vi.fn((pattern: readonly number[]) => pattern.length > 0)
  const playSound = vi.fn()
  const runtime = createPresentationRuntime({
    settings: memory.store,
    timings: { ...TEST_TIMINGS, ...timings },
    vibrate,
    playSound,
    unlockSound: async () => true,
  })
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <>
            <button type="button">Behind the overlay</button>
            {children}
            <PresentationHost />
          </>
        ),
      },
    ],
    { initialEntries: [path] },
  )
  const view = render(
    <PresentationContext value={runtime}>
      <RouterProvider router={router} />
    </PresentationContext>,
  )
  return {
    ...view,
    runtime,
    controller: runtime.controller,
    router,
    vibrate,
    playSound,
    settings: memory,
    /** Plans `events` exactly as the app does and puts them in the queue. */
    present(events: readonly DomainEvent[], origin: 'action' | 'lifecycle' = 'action') {
      act(() => runtime.controller.enqueue(planPresentation(events, { origin })))
    },
  }
}
