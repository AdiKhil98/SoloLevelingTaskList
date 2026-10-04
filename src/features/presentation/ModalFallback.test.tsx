import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { awardBetweenLevels, weeklyFinalized } from '@/test/events'
import { renderHost } from '@/test/presentationUi'

// The overlay chunk cannot be loaded (for example offline before it was ever cached).
vi.mock('./overlayChunk', () => ({
  loadOverlays: () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
  prefetchOverlays: () => undefined,
}))

describe('when the overlay chunk cannot be loaded', () => {
  it('still shows the Level Up with every number, as a plain dialog, and the app keeps working', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const host = renderHost()
    host.present(awardBetweenLevels(9, 12, 1))

    const dialog = await screen.findByRole('dialog', { name: 'RANK ADVANCEMENT' })
    expect(dialog).toHaveTextContent('LEVEL UP. LV. 9 to LV. 12.')
    expect(dialog).toHaveTextContent('RANK ADVANCEMENT. E-RANK to D-RANK.')
    expect(error).toHaveBeenCalled() // reported, never swallowed

    fireEvent.click(dialog)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Behind the overlay' })).toBeInTheDocument()
  })

  it('does the same for a weekly result', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const host = renderHost()
    host.present([weeklyFinalized(9, 325)], 'lifecycle')
    const dialog = await screen.findByRole('dialog', { name: 'WEEKLY RESULT' })
    expect(dialog).toHaveTextContent('STRONG WEEK. SCORE 9 / 10. +325 EXP. REWARD TIER 9+ UNLOCKED.')
  })
})
