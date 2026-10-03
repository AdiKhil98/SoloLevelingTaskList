import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppRuntimeProvider, type AppRuntimeOptions } from '@/app/AppRuntimeProvider'
import { appRoutes } from '@/app/routes'
import { createTestClock, newFactory, noonOn, type TestClock } from '@/application/test-utils/helpers'

export interface RenderAppOptions {
  /** Initial route. */
  path?: string
  /** Defaults to Berlin midday on 2026-10-05 (a Monday). */
  clock?: TestClock
  /** Defaults to a fresh, empty fake IndexedDB. Reuse one to simulate a restart. */
  factory?: IDBFactory
  strictMode?: boolean
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
  strictMode = false,
}: RenderAppOptions = {}) {
  const options: AppRuntimeOptions = { clock, database: { factory } }
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  const tree = (
    <AppRuntimeProvider options={options}>
      <RouterProvider router={router} />
    </AppRuntimeProvider>
  )
  const view = render(strictMode ? <StrictMode>{tree}</StrictMode> : tree)
  return { ...view, router, clock, factory }
}
