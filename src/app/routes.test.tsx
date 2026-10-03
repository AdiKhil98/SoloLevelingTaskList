import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newFactory } from '@/application/test-utils/helpers'
import { renderApp } from '@/test/renderApp'

describe('application routes', () => {
  it('renders Home at the root route', async () => {
    renderApp({ path: '/' })

    expect(await screen.findByRole('heading', { name: 'SYSTEM' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders Status at /status', async () => {
    renderApp({ path: '/status' })

    expect(await screen.findByRole('heading', { name: 'STATUS' })).toBeInTheDocument()
  })

  it('renders the not-found route for unknown paths', async () => {
    renderApp({ path: '/does-not-exist' })

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to start' })).toHaveAttribute('href', '/')
  })
})

describe('bottom navigation', () => {
  it('offers exactly Home and Status, with accessible labels', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'SYSTEM' })

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Home', 'Status'])
  })

  it('marks the active destination with aria-current', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'SYSTEM' })
    const nav = screen.getByRole('navigation', { name: 'Primary' })

    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Status' })).not.toHaveAttribute('aria-current')
  })

  it('navigates Home → Status → Home', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'SYSTEM' })
    const nav = screen.getByRole('navigation', { name: 'Primary' })

    fireEvent.click(within(nav).getByRole('link', { name: 'Status' }))
    expect(await screen.findByRole('heading', { name: 'STATUS' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Status' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    expect(screen.queryByRole('heading', { name: 'SYSTEM' })).not.toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('link', { name: 'Home' }))
    expect(await screen.findByRole('heading', { name: 'SYSTEM' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows progress made on Home when moving to Status without reloading storage', async () => {
    renderApp({ factory: newFactory() })
    fireEvent.click(await screen.findByRole('button', { name: /^Complete Fajr/ }))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('link', { name: 'Status' }))

    const sheet = await screen.findByRole('region', { name: 'Player status' })
    expect(within(sheet).getByText('10')).toBeInTheDocument()
  })
})
