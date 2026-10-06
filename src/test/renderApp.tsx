import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMemoryRouter, type RouteObject } from 'react-router'
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
import { AwakenedGate } from './AwakenedGate'
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
  /**
   * Defaults to true: the database already belongs to a player who has been through Awakening (or predates it, like
   * an upgraded Phase 10 installation), so the test goes straight to the app. Pass false to leave the database exactly
   * as it is: a fresh factory is then a brand-new install and plays the real first launch.
   */
  awakened?: boolean
  /** Defaults to the real route table; a test may add a screen of its own (for example one that fails to render). */
  routes?: RouteObject[]
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
  awakened = true,
  routes = appRoutes,
}: RenderAppOptions = {}) {
  const options: AppRuntimeOptions = { clock, ids, database: { factory }, presentation }
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const app = (
    <AppRuntimeProvider options={options}>
      <RouterProvider router={router} />
    </AppRuntimeProvider>
  )
  const tree = awakened ? <AwakenedGate factory={factory}>{app}</AwakenedGate> : app
  const view = render(strictMode ? <StrictMode>{tree}</StrictMode> : tree)
  return { ...view, router, clock, factory }
}
