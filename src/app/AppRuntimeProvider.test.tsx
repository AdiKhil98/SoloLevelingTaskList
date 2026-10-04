import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newFactory } from '@/application/test-utils/helpers'
import { markPlayerAwakened } from '@/test/identity'
import { renderApp } from '@/test/renderApp'

/**
 * Wraps a factory so every connection it hands out is recorded, and the
 * test can see which ones were closed.
 */
function trackConnections(factory: IDBFactory) {
  const opened: IDBDatabase[] = []
  const closed = new Set<IDBDatabase>()
  const tracking = {
    open(name: string, version?: number) {
      const request = factory.open(name, version)
      request.addEventListener('success', () => {
        const connection = request.result
        const close = connection.close.bind(connection)
        connection.close = () => {
          closed.add(connection)
          close()
        }
        opened.push(connection)
      })
      return request
    },
  } as unknown as IDBFactory
  return { factory: tracking, opened, closed }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AppRuntimeProvider — database ownership', () => {
  it('opens one database handle for the whole session and closes it on dispose', async () => {
    const base = newFactory()
    await markPlayerAwakened(base) // seeded on the real factory, so only the app's own connections are counted
    const tracked = trackConnections(base)
    const view = renderApp({ factory: tracked.factory, awakened: false })
    await screen.findByRole('heading', { name: 'SYSTEM' })

    // Using the app (navigating, completing) never opens another connection.
    fireEvent.click(screen.getByRole('link', { name: 'Status' }))
    await screen.findByRole('heading', { name: 'STATUS' })
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Complete Fajr/ }))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())

    expect(tracked.opened).toHaveLength(1)
    expect(tracked.closed.size).toBe(0)

    view.unmount()

    expect(tracked.closed.size).toBe(1)
  })

  it('leaks no connection under StrictMode’s mount–unmount–mount', async () => {
    const base = newFactory()
    await markPlayerAwakened(base)
    const tracked = trackConnections(base)
    const view = renderApp({ factory: tracked.factory, strictMode: true, awakened: false })
    await screen.findByRole('heading', { name: 'SYSTEM' })

    // Whatever was opened, exactly one connection (the live one) remains open.
    await waitFor(() => expect(tracked.opened.length - tracked.closed.size).toBe(1))

    view.unmount()

    expect(tracked.closed.size).toBe(tracked.opened.length)
  })
})

describe('AppRuntimeProvider — startup failure', () => {
  it('shows a recoverable error with Retry, hides raw errors, and recovers', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const working = newFactory()
    await markPlayerAwakened(working) // once storage works again this is an existing player, not a first launch
    let failing = true
    const flaky = {
      open(name: string, version?: number) {
        if (failing) throw new DOMException('Raw internal failure: QuotaExceededError xyz', 'AbortError')
        return working.open(name, version)
      },
    } as unknown as IDBFactory

    renderApp({ factory: flaky, awakened: false })

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading', { name: 'Local data could not be loaded' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('Raw internal failure')
    expect(document.body).not.toHaveTextContent('QuotaExceededError')
    expect(screen.queryByRole('button', { name: /reset|delete|clear/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/LV\./)).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()

    failing = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(screen.getByText('SYSTEM INITIALIZING...')).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'SYSTEM' })
    expect(screen.getByText('LV. 1')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains an unavailable storage layer without leaking technical detail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const unavailable = { open: () => { throw new Error('boom') } } as unknown as IDBFactory

    renderApp({ factory: unavailable, awakened: false })

    expect(await screen.findByRole('alert')).toHaveTextContent('Local data could not be loaded')
    expect(screen.getByRole('alert')).not.toHaveTextContent('boom')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
