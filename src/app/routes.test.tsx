import { render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { appRoutes } from './routes'

function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
}

describe('application routes', () => {
  it('renders the Phase 01 placeholder at the root route', () => {
    renderAt('/')

    expect(
      screen.getByRole('heading', { name: 'SoloLevelingTaskList' }),
    ).toBeInTheDocument()
    expect(screen.getByText('System foundation initialized.')).toBeVisible()
    expect(screen.getByText('Phase 01')).toBeVisible()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders the not-found route for unknown paths', () => {
    renderAt('/does-not-exist')

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to start' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})
