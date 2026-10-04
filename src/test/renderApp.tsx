import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppRuntimeProvider, type AppRuntimeOptions } from '@/app/AppRuntimeProvider'
import { appRoutes } from '@/app/routes'
import type { IdSource } from '@/application'
import {
  createSequentialIds,
  createTestClock,
  newFactory,
  noonOn,
  type TestClock,
} from '@/application/test-utils/helpers'
import { TEST_TIMINGS } from './presentationTimings'

export interface RenderAppOptions {
  /** Initial route. */
  path?: string
  /** Defaults to Berlin midday on 2026-10-05 (a Monday). */
  clock?: TestClock
  /** Defaults to a fresh, empty fake IndexedDB. Reuse one to simulate a restart. */
  factory?: IDBFactory
  /** Defaults to a deterministic sequence of UUIDs. */
  ids?: IdSource
  strictMode?: boolean
  /** Presentation seams (settings, timings, haptics, sound). Defaults to zero delays and no count-up. */
  presentation?: AppRuntimeOptions['presentation']
}

/**
 * Renders the real application (runtime provider + routes) against a fake
 * IndexedDB and an injected clock. Nothing below the provider is mocked: the
 * UI exercises the real application services, persistence and domain.
 */
export function renderApp({
  path = '/',
  clock = createTestClock(noonOn('2026-10-05')),
  factory = newFactory(),
  ids = createSequentialIds(),
  strictMode = false,
  presentation = { timings: TEST_TIMINGS },
}: RenderAppOptions = {}) {
  const options: AppRuntimeOptions = { clock, ids, database: { factory }, presentation }
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  const tree = (
    <AppRuntimeProvider options={options}>
      <RouterProvider router={router} />
    </AppRuntimeProvider>
  )
  const view = render(strictMode ? <StrictMode>{tree}</StrictMode> : tree)
  return { ...view, router, clock, factory }
}
