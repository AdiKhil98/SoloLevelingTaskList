import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineIndicator } from './OfflineIndicator'

afterEach(() => {
  vi.restoreAllMocks()
})

function fakeConnectivity(online: boolean) {
  const listeners = new Set<() => void>()
  return {
    source: {
      isOnline: () => online,
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    },
    set(value: boolean) {
      online = value
      for (const listener of [...listeners]) listener()
    },
  }
}

describe('OfflineIndicator', () => {
  it('shows nothing while online', () => {
    render(<OfflineIndicator source={fakeConnectivity(true).source} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a small OFFLINE marker while offline', () => {
    render(<OfflineIndicator source={fakeConnectivity(false).source} />)
    expect(screen.getByRole('status')).toHaveTextContent('OFFLINE')
  })

  it('appears and disappears as the connection changes', () => {
    const connection = fakeConnectivity(true)
    render(<OfflineIndicator source={connection.source} />)

    act(() => connection.set(false))
    expect(screen.getByRole('status')).toHaveTextContent('OFFLINE')

    act(() => connection.set(true))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('is informational only: it takes no space, captures no taps and has no controls', () => {
    render(<OfflineIndicator source={fakeConnectivity(false).source} />)
    const status = screen.getByRole('status')
    expect(status).toHaveClass('pointer-events-none', 'fixed')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('follows the real browser connection by default', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<OfflineIndicator />)
    expect(screen.getByRole('status')).toHaveTextContent('OFFLINE')

    onLine.mockReturnValue(true)
    act(() => void window.dispatchEvent(new Event('online')))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
