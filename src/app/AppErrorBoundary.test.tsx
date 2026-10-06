import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RouteObject } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listTemplates, openDatabase } from '@/persistence'
import { reloadPage } from '@/platform/page'
import { renderApp } from '@/test/renderApp'
import { AppErrorBoundary } from './AppErrorBoundary'
import { appRoutes } from './routes'

// Reloading is the player's choice; here it is observed, never performed.
vi.mock('@/platform/page', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/platform/page')>()), reloadPage: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(reloadPage).mockClear()
})

const RAW_MESSAGE = 'probe: this screen threw while rendering'

function Boom(): never {
  throw new Error(RAW_MESSAGE)
}

/** The real route table plus one screen that always fails to render. */
const routesWithFailingScreen: RouteObject[] = (() => {
  const [root] = appRoutes
  if (root === undefined) throw new Error('the route table is empty')
  return [{ ...root, children: [...(root.children ?? []), { path: 'boom', element: <Boom /> }] } as RouteObject]
})()

describe('a screen that fails to render', () => {
  it('shows the calm SYSTEM crash screen, not the router developer page, and no raw error text', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderApp({ path: '/boom', routes: routesWithFailingScreen })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong')
    expect(alert).toHaveTextContent('does not delete or change your saved progress')
    expect(document.body).not.toHaveTextContent('Unexpected Application Error')
    expect(document.body).not.toHaveTextContent(RAW_MESSAGE)
    // Logged for the developer from an effect that runs just after the screen appears, so wait for it.
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('A screen failed to render', expect.objectContaining({ message: RAW_MESSAGE })))
  })

  it('offers Reload (once per press, never by itself) and a Home link that works without an address bar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderApp({ path: '/boom', routes: routesWithFailingScreen })
    await screen.findByRole('alert')

    await new Promise((resolve) => setTimeout(resolve, 50)) // time for any automatic retry to have happened
    expect(reloadPage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reloadPage).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Reload']) // no reset, no delete
  })

  it('changes nothing that is stored', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { factory } = renderApp({ path: '/boom', routes: routesWithFailingScreen })
    await screen.findByRole('alert')

    const database = await openDatabase({ factory })
    try {
      expect(await listTemplates(database)).toHaveLength(6) // the six default quests, exactly as started
    } finally {
      database.close()
    }
  })

  it('leaves every other screen alone', async () => {
    renderApp({ routes: routesWithFailingScreen })
    expect(await screen.findByRole('heading', { name: 'SYSTEM' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('an error outside the route tree', () => {
  it('shows the same crash screen instead of a blank page', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(document.body).not.toHaveTextContent(RAW_MESSAGE)
    expect(consoleError).toHaveBeenCalledWith('The application failed to render', expect.objectContaining({ message: RAW_MESSAGE }))

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('renders a healthy application untouched', () => {
    render(
      <AppErrorBoundary>
        <p>all fine</p>
      </AppErrorBoundary>,
    )
    expect(screen.getByText('all fine')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
