import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PlayerStatus } from '@/application'
import { totalExpToReachLevel } from '@/domain'
import { PlayerSummary } from '../home/PlayerSummary'
import { awardEvents } from '@/test/events'
import { renderHost } from '@/test/presentationUi'

// The overlay chunk's arrival is controlled by the test, so "the overlay is still loading" is a state we can hold.
const gate = vi.hoisted(() => {
  let open!: () => void
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
})
vi.mock('./overlayChunk', () => ({
  loadOverlays: () => gate.opened.then(() => import('./overlays/EntryOverlay')),
  prefetchOverlays: () => undefined,
}))

const AFTER: PlayerStatus = { totalExp: 5_000, level: 10, expIntoLevel: 40, expToNext: 600, rank: 'D' }
const hud = () => screen.getByRole('region', { name: 'PLAYER' })

describe('the HUD while the Level Up overlay is still loading', () => {
  it('keeps the old level until the overlay is actually open, so the new level never shows before its reveal', async () => {
    const host = renderHost({ children: <PlayerSummary player={AFTER} />, timings: { holdMaxMs: 60_000 } })
    host.present(awardEvents(totalExpToReachLevel(9) + 10, 700))

    // The entry has started (its start delay is 0) but its overlay chunk has not arrived.
    await waitFor(() => expect(host.controller.getState().active?.kind).toBe('progression'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(hud()).getByText('LV. 9')).toBeInTheDocument()
    expect(within(hud()).getByText('E-RANK')).toBeInTheDocument()

    gate.open() // the chunk arrives; the overlay mounts and reports it is open
    await screen.findByRole('dialog', { name: 'LEVEL UP' })
    await waitFor(() => expect(within(hud()).getByText('LV. 10')).toBeInTheDocument())
    expect(within(hud()).getByText('D-RANK')).toBeInTheDocument()
  })

  it('the cap still releases a hold if the overlay never arrives, so the HUD cannot stay stale', async () => {
    const host = renderHost({ children: <PlayerSummary player={AFTER} />, timings: { holdMaxMs: 40 } })
    host.present(awardEvents(totalExpToReachLevel(9) + 10, 700))
    expect(within(hud()).getByText('LV. 9')).toBeInTheDocument()
    await waitFor(() => expect(within(hud()).getByText('LV. 10')).toBeInTheDocument())
  })
})
