import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newFactory } from '@/application/test-utils/helpers'
import { letDaysPass, letNeutralDaysPass, playFirstDay } from '@/test/historyUi'
import { renderApp } from '@/test/renderApp'

const ready = () => screen.findByRole('heading', { name: 'DAILY HISTORY' })
const loadedList = () => screen.findByRole('list', { name: 'Finalized days' })
const days = () => within(screen.getByRole('list', { name: 'Finalized days' })).getAllByRole('listitem')

describe('Daily History', () => {
  it('says so when no day has been finalized yet', async () => {
    renderApp({ path: '/status/history' })
    await ready()
    expect(await screen.findByText(/No finished days yet/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Finalized days' })).not.toBeInTheDocument()
  })

  it('lists a finalized day with its quality, counts, EXP and streak, from its immutable summary', async () => {
    const factory = newFactory()
    const clock = await playFirstDay(factory) // Oct 5: six of six
    renderApp({ path: '/status/history', factory, clock })
    await ready()

    await loadedList()
    const [only] = days()
    expect(only).toHaveTextContent('Oct 5, 2026')
    expect(only).toHaveTextContent('Perfect')
    expect(only).toHaveTextContent('6 / 6 quests · 100%')
    expect(only).toHaveTextContent('+70 EXP')
    expect(only).toHaveTextContent('Streak after: 1 day')
    expect(days()).toHaveLength(1)
  })

  it('never lists the day in progress', async () => {
    const factory = newFactory()
    const clock = await playFirstDay(factory) // today is Oct 6, not finalized
    renderApp({ path: '/status/history', factory, clock })
    await ready()
    await loadedList()
    expect(screen.queryByText('Oct 6, 2026')).not.toBeInTheDocument()
  })

  it('lists days newest first and shows an Incomplete day plainly', async () => {
    const factory = newFactory()
    const clock = await letDaysPass(factory, 3) // Oct 5, 6, 7 finalized Incomplete
    renderApp({ path: '/status/history', factory, clock })
    await ready()
    await loadedList()
    const items = days()
    expect(items.map((entry) => entry.querySelector('p')?.textContent)).toEqual(['Oct 7, 2026', 'Oct 6, 2026', 'Oct 5, 2026'])
    expect(items[0]).toHaveTextContent('Incomplete')
    expect(items[0]).toHaveTextContent('0 / 6 quests · 0%')
    expect(items[0]).toHaveTextContent('Streak after: 0 days')
  })

  it('shows a No Active Quests day as neutral: no counts, no percentage, no streak line', async () => {
    const factory = newFactory()
    const clock = await letNeutralDaysPass(factory, 2) // Oct 5 Incomplete, Oct 6 has no quests
    renderApp({ path: '/status/history', factory, clock })
    await ready()
    await loadedList()
    const [empty, incomplete] = days()
    expect(empty).toHaveTextContent('Oct 6, 2026')
    expect(empty).toHaveTextContent('No Active Quests')
    expect(empty).toHaveTextContent('No quests were scheduled. The streak did not change.')
    expect(empty).not.toHaveTextContent('%')
    expect(empty).not.toHaveTextContent('Streak after')
    expect(incomplete).toHaveTextContent('0 / 6 quests · 0%')
  })

  it('pages a long history: 30 days first, then Show more', async () => {
    const factory = newFactory()
    const clock = await letDaysPass(factory, 35)
    renderApp({ path: '/status/history', factory, clock })
    await ready()
    await loadedList()
    expect(days()).toHaveLength(30)

    fireEvent.click(screen.getByRole('button', { name: 'Show more (5 older)' }))
    expect(days()).toHaveLength(35)
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
  })

  it('is reachable from Status and goes back to it', async () => {
    renderApp({ path: '/status' })
    fireEvent.click(await screen.findByRole('link', { name: 'Daily History' }))
    await ready()
    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'STATUS' })).toBeInTheDocument()
  })
})
