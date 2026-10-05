import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlayerProfile, listTemplates, openDatabase } from '@/persistence'
import { reloadPage } from '@/platform/page'
import { renderApp } from '@/test/renderApp'

// The first-launch screen's code cannot be loaded (what a failed chunk fetch looks like: the dynamic import rejects).
vi.mock('@/features/awakening/AwakeningFlow', () => {
  throw new Error('Failed to fetch dynamically imported module: /assets/AwakeningFlow-abc.js')
})
// Reloading is the player's choice; here it is observed, never performed.
vi.mock('@/platform/page', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/platform/page')>()), reloadPage: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(reloadPage).mockClear()
})

describe('the first-launch screen fails to load', () => {
  it('shows a calm Reload screen instead of unmounting the app, and changes nothing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { factory } = renderApp({ awakened: false })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This screen could not be loaded')
    expect(alert).toHaveTextContent('Nothing has been changed or deleted')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled()
    expect(document.body).not.toHaveTextContent('Failed to fetch dynamically imported module') // no raw error text
    expect(consoleError).toHaveBeenCalled() // but it is logged for the developer

    const database = await openDatabase({ factory })
    try {
      expect(await getPlayerProfile(database)).toEqual({ status: 'absent' }) // Awakening never started: still a new player
      expect(await listTemplates(database)).toHaveLength(0)
    } finally {
      database.close()
    }
  })

  it('never reloads by itself (so it cannot loop); one press reloads once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderApp({ awakened: false })
    await screen.findByRole('alert')

    await new Promise((resolve) => setTimeout(resolve, 50)) // time for any automatic retry to have happened
    expect(reloadPage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('offers no way to reset or delete anything', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderApp({ awakened: false })
    await screen.findByRole('alert')
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Reload'])
  })
})
