import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlayerStatus, TodayQuest } from '@/application'
import { totalExpToReachLevel } from '@/domain'
import { PlayerSummary } from '../home/PlayerSummary'
import { QuestCard } from '../home/QuestCard'
import { awardEvents, questCompleted } from '@/test/events'
import { renderHost } from '@/test/presentationUi'
import { TEST_TIMINGS } from '@/test/presentationTimings'

/** The player AFTER a level 9 → 10 award (what the stored state says the moment the award is saved). */
const AFTER: PlayerStatus = { totalExp: 5_000, level: 10, expIntoLevel: 40, expToNext: 600, rank: 'D' }
const hud = () => screen.getByRole('region', { name: 'PLAYER' })
const barOf = () => within(hud()).getByRole('progressbar')

/** An award that takes level 9 (E rank) to level 10 (D rank). */
const levelNineToTen = () => awardEvents(totalExpToReachLevel(9) + 10, 700)

/** Delays that keep every entry waiting, so the held HUD can be observed. */
const SLOW_START = { startDelayMs: { ...TEST_TIMINGS.startDelayMs!, progression: 60_000 } }

describe('the HUD while a Level Up waits to be revealed', () => {
  it('keeps the old level and rank with the bar full, then shows the new level when the overlay opens', async () => {
    const host = renderHost({ children: <PlayerSummary player={AFTER} />, timings: { startDelayMs: { ...TEST_TIMINGS.startDelayMs!, progression: 150 } } })
    // Nothing waiting: the stored state.
    expect(within(hud()).getByText('LV. 10')).toBeInTheDocument()

    host.present([questCompleted('occ'), ...levelNineToTen()])
    expect(within(hud()).getByText('LV. 9')).toBeInTheDocument() // held: the player has not seen the level up yet
    expect(within(hud()).getByText('E-RANK')).toBeInTheDocument()
    expect(barOf()).toHaveAttribute('aria-valuenow', barOf().getAttribute('aria-valuemax')) // the bar is full

    await screen.findByRole('dialog', { name: 'LEVEL UP' }) // …and once the overlay is open the HUD behind it has the new level
    await waitFor(() => expect(within(hud()).getByText('LV. 10')).toBeInTheDocument())
    expect(within(hud()).getByText('D-RANK')).toBeInTheDocument()
    expect(barOf()).toHaveAttribute('aria-valuenow', '40')
  })


  it('never holds longer than the cap: past it the real level shows again even if the reveal is still waiting', async () => {
    const host = renderHost({ children: <PlayerSummary player={AFTER} />, timings: { ...SLOW_START, holdMaxMs: 40 } })
    host.present(levelNineToTen())
    expect(within(hud()).getByText('LV. 9')).toBeInTheDocument()
    await waitFor(() => expect(within(hud()).getByText('LV. 10')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // the reveal itself is still to come
  })

  it('is released at once if the queue is cleared, so the HUD can never stay stale', () => {
    const host = renderHost({ children: <PlayerSummary player={AFTER} />, timings: SLOW_START })
    host.present(levelNineToTen())
    expect(within(hud()).getByText('LV. 9')).toBeInTheDocument()
    act(() => host.controller.dispatch({ type: 'clear' }))
    expect(within(hud()).getByText('LV. 10')).toBeInTheDocument()
  })

  it('does not touch the HUD for a plain EXP gain', () => {
    const host = renderHost({ children: <PlayerSummary player={AFTER} />, timings: SLOW_START })
    host.present([questCompleted('occ'), ...awardEvents(0, 10)])
    expect(within(hud()).getByText('LV. 10')).toBeInTheDocument()
  })

  it('outside the app (no runtime) it simply shows the stored status', async () => {
    const { render } = await import('@testing-library/react')
    render(<PlayerSummary player={AFTER} />)
    expect(within(hud()).getByText('LV. 10')).toBeInTheDocument()
  })
})

const quest = (overrides: Partial<TodayQuest> = {}): TodayQuest => ({
  occurrenceId: 'occ:tpl@2026-10-05',
  templateId: 'tpl',
  title: 'Gym',
  difficulty: 'B',
  category: 'fitness',
  expReward: 55,
  role: 'standard',
  completed: true,
  completedAt: 1,
  ...overrides,
})
const row = () => screen.getByRole('img', { name: 'Completed' }).closest('div') as HTMLElement

describe('the completed quest row', () => {
  const list = (item: TodayQuest) => (
    <ul>
      <QuestCard quest={item} pending={false} onComplete={() => undefined} />
    </ul>
  )

  it('pulses and shows +EXP only for the quest that was JUST completed, with the strength of its difficulty', () => {
    const host = renderHost({ children: list(quest()) })
    expect(row().className).not.toContain('system-fx-complete') // merely shown: no animation
    expect(screen.queryByText('+55 EXP', { selector: '.system-fx-chip' })).not.toBeInTheDocument()

    host.present([questCompleted('occ:tpl@2026-10-05', 'B'), ...awardEvents(0, 55)])
    expect(row().className).toContain('system-fx-complete')
    expect(row()).toHaveAttribute('data-strength', 'strong')
    expect(row()).toHaveAttribute('data-fx', 'normal')
    const chip = screen.getByText('+55 EXP', { selector: '.system-fx-chip' })
    expect(chip).toHaveAttribute('aria-hidden', 'true') // visual only: the status line carries the words
  })

  it.each([
    ['E', 'base'],
    ['A', 'strong'],
    ['S', 'major'],
  ] as const)('a %s quest answers with a %s response', (difficulty, strength) => {
    const host = renderHost({ children: list(quest({ difficulty })) })
    host.present([questCompleted('occ:tpl@2026-10-05', difficulty), ...awardEvents(0, 10)])
    expect(row()).toHaveAttribute('data-strength', strength)
  })

  it('ends by itself within about a second and leaves the plain completed row', async () => {
    const host = renderHost({ children: list(quest()), timings: { visibleMs: () => 40 } })
    host.present([questCompleted('occ:tpl@2026-10-05', 'B'), ...awardEvents(0, 55)])
    expect(row().className).toContain('system-fx-complete')
    await waitFor(() => expect(row().className).not.toContain('system-fx-complete'))
    expect(document.querySelector('.system-fx-chip')).toBeNull()
  })

  it('REDUCED keeps the +EXP chip but marks the row so no motion plays', () => {
    const host = renderHost({ settings: { effects: 'reduced' }, children: list(quest()) })
    host.present([questCompleted('occ:tpl@2026-10-05', 'B'), ...awardEvents(0, 55)])
    expect(row()).toHaveAttribute('data-fx', 'reduced')
    expect(screen.getByText('+55 EXP', { selector: '.system-fx-chip' })).toHaveAttribute('data-fx', 'reduced')
  })

  it('a different quest\'s feedback does not animate this row', () => {
    const host = renderHost({ children: list(quest()) })
    host.present([questCompleted('occ:other@2026-10-05', 'B'), ...awardEvents(0, 55)])
    expect(row().className).not.toContain('system-fx-complete')
  })

  it('an open quest stays a plain button', () => {
    renderHost({ children: list(quest({ completed: false, completedAt: null })) })
    fireEvent.click(screen.getByRole('button', { name: /Complete Gym/ }))
    expect(document.querySelector('.system-fx-complete')).toBeNull()
  })
})
