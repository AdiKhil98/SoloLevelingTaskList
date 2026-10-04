import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildTemplate, d, newFactory } from '@/application/test-utils/helpers'
import { createTemplate, openDatabase } from '@/persistence'
import { renderApp } from '@/test/renderApp'

async function statusReady() {
  return screen.findByRole('region', { name: 'Player status' })
}

describe('Status', () => {
  it('shows the neutral player label, level, rank and lifetime EXP for a new player', async () => {
    renderApp({ path: '/status' })
    const sheet = await statusReady()

    expect(within(sheet).getByText('Player').nextElementSibling).toHaveTextContent('PLAYER')
    expect(within(sheet).getByText('Level').nextElementSibling).toHaveTextContent('1')
    expect(within(sheet).getByText('Rank').nextElementSibling).toHaveTextContent('E-RANK')
    expect(within(sheet).getByText('Lifetime EXP').nextElementSibling).toHaveTextContent('0')
  })

  it('shows current-level EXP against the next-level requirement', async () => {
    renderApp({ path: '/status' })
    await statusReady()

    expect(screen.getByText('0 / 100')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /EXP progress/ })).toHaveAttribute('aria-valuemax', '100')
  })

  it('distinguishes lifetime EXP from EXP inside the current level', async () => {
    const factory = newFactory()
    const database = await openDatabase({ factory })
    await createTemplate(
      database,
      buildTemplate({ id: 'tpl_big', title: 'Big quest', difficulty: 'S', createdAt: 9, activeFrom: d('2026-10-05') }),
    )
    database.close()
    renderApp({ factory })
    fireEvent.click(await screen.findByRole('button', { name: /^Complete Big quest/ }))
    // The HUD's level (the Level Up overlay also names LV. 2, so the query is scoped to the player window).
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'PLAYER' })).getByText('LV. 2')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('link', { name: 'Status' }))
    const sheet = await statusReady()

    expect(within(sheet).getByText('Level').nextElementSibling).toHaveTextContent('2')
    expect(within(sheet).getByText('Lifetime EXP').nextElementSibling).toHaveTextContent('120')
    expect(screen.getByText('20 / 135')).toBeInTheDocument()
  })
})
