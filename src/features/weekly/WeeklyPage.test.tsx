/// <reference types="node" />
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, newFactory, noonOn } from '@/application/test-utils/helpers'
import { renderApp } from '@/test/renderApp'
import { resumeApp } from '@/test/resume'
import { writeFailingFactory } from '@/test/questUi'
import { NEXT_MONDAY, plantBoard, readBoard, scoringDefinition, typeInto, WEDNESDAY, weeklyReady } from '@/test/weeklyUi'

afterEach(() => {
  vi.restoreAllMocks()
})

const wednesday = () => createTestClock(noonOn(WEDNESDAY))
const homeReady = () => screen.findByRole('heading', { name: 'SYSTEM' })
const nav = () => screen.getByRole('navigation', { name: 'Primary' })

/** A reusable database holding this week's board, planted as the editor would have saved it. */
async function plantedWeek(definition = scoringDefinition(0)) {
  const factory = newFactory()
  const first = renderApp({ clock: wednesday(), factory })
  await homeReady()
  first.unmount()
  await plantBoard(factory, definition)
  return factory
}

describe('navigation', () => {
  it('has Weekly in the primary navigation and opens the Weekly screen', async () => {
    renderApp({ clock: wednesday() })
    await homeReady()
    const links = within(nav()).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Home', 'Quests', 'Weekly', 'Status'])
    expect(within(nav()).getByRole('link', { name: 'Weekly' })).toHaveAttribute('href', '/weekly')

    fireEvent.click(within(nav()).getByRole('link', { name: 'Weekly' }))
    await weeklyReady()
    expect(within(nav()).getByRole('link', { name: 'Weekly' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps Weekly highlighted on its sub-screens', async () => {
    renderApp({ clock: wednesday(), path: '/weekly/history' })
    await screen.findByRole('heading', { name: 'WEEKLY HISTORY' })
    expect(within(nav()).getByRole('link', { name: 'Weekly' })).toHaveAttribute('aria-current', 'page')
  })

  it('every bottom navigation target stays at least 44 px tall (a usable touch target)', async () => {
    renderApp({ clock: wednesday() })
    await homeReady()
    // The height comes from one token (also used for the page's bottom padding): check its value, not a class.
    const globalStyles = readFileSync('src/styles/globals.css', 'utf8') // vitest runs from the project root
    const navHeight = /--nav-height:\s*([\d.]+)rem/.exec(globalStyles)
    expect(navHeight).not.toBeNull()
    expect(Number(navHeight?.[1]) * 16).toBeGreaterThanOrEqual(44)
    for (const link of within(nav()).getAllByRole('link')) expect(link.className).toContain('h-(--nav-height)')
  })
})

describe('the setup state', () => {
  it('invites the player to set the week’s goals and invents none', async () => {
    renderApp({ clock: wednesday(), path: '/weekly' })
    await weeklyReady()
    expect(await screen.findByRole('heading', { name: 'SET THIS WEEK’S GOAL CRUSHERS' })).toBeInTheDocument()
    expect(screen.getByText('Oct 5 – Oct 11, 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set up goals' })).toHaveAttribute('href', '/weekly/edit')
    expect(screen.queryByRole('list', { name: 'Weekly goals' })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows no history yet and links to it', async () => {
    renderApp({ clock: wednesday(), path: '/weekly' })
    await weeklyReady()
    fireEvent.click(screen.getByRole('link', { name: 'History' }))
    await screen.findByRole('heading', { name: 'WEEKLY HISTORY' })
    expect(await screen.findByText('No finished weeks yet. A week is finalized after its Sunday.')).toBeInTheDocument()
  })
})

describe('the current board', () => {
  it('shows the focus, the live score, each goal, and the reward tiers with the current one marked', async () => {
    const factory = await plantedWeek(scoringDefinition(7))
    renderApp({ clock: wednesday(), factory, path: '/weekly' })
    await screen.findByText('Frozen focus')

    expect(screen.getByRole('progressbar', { name: 'Weekly score' })).toHaveAttribute('aria-valuenow', '7')
    expect(screen.getByText(/^7 \/ 10$/)).toBeInTheDocument()
    expect(screen.getByText('7 / 10 goals complete')).toBeInTheDocument()
    const goals = within(screen.getByRole('list', { name: 'Weekly goals' })).getAllByRole('listitem')
    expect(goals).toHaveLength(10)
    expect(within(goals[0]!).getByText('Complete · 1 pts')).toBeInTheDocument()
    expect(within(goals[9]!).queryByText(/^Complete/)).not.toBeInTheDocument()

    const tiers = within(screen.getByRole('list', { name: 'Reward tiers' })).getAllByRole('listitem')
    expect(tiers.map((tier) => tier.textContent)).toEqual([
      '6+Reward 6',
      '7+Reward 7CURRENT',
      '8+Reward 8',
      '9+Reward 9',
      '10Reward 10',
    ])
    expect(tiers[1]).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('The bonus EXP is awarded once, when the week ends.')).toBeInTheDocument()
  })

  it('has no spectacle: no canvas, no animated effect, only a plain progress bar', async () => {
    const factory = await plantedWeek(scoringDefinition(10))
    renderApp({ clock: wednesday(), factory, path: '/weekly' })
    await screen.findByText('Frozen focus')
    expect(document.querySelector('canvas')).toBeNull()
    expect(document.querySelector('[class*="animate-"]')).toBeNull()
  })

  it('updates a manual goal with + / − and a typed number, and the score follows', async () => {
    const factory = await plantedWeek({
      focus: null,
      goals: [
        { id: 'wg_a', title: 'Backtests', maxPoints: 6, target: 20, unit: 'backtests', tracking: { mode: 'manual' }, manualProgress: 14, notes: null },
        { id: 'wg_b', title: 'Report', maxPoints: 4, target: 1, unit: null, tracking: { mode: 'manual' }, manualProgress: 0, notes: null },
      ],
      rewardTiers: scoringDefinition(0).rewardTiers,
    })
    renderApp({ clock: wednesday(), factory, path: '/weekly' })
    await screen.findByText('14 / 20 backtests')
    expect(screen.getByRole('progressbar', { name: 'Weekly score' })).toHaveAttribute('aria-valuenow', '0')

    // + once: still below the target.
    fireEvent.click(screen.getByRole('button', { name: 'Increase progress for Backtests' }))
    await screen.findByText('15 / 20 backtests')
    // Typing exactly the target completes the goal and earns its points.
    typeInto(screen.getByRole('textbox', { name: 'Progress for Backtests' }), '20')
    fireEvent.submit(screen.getByRole('textbox', { name: 'Progress for Backtests' }).closest('form')!)
    await screen.findByText('20 / 20 backtests')
    expect(await screen.findByText('Goal complete: Backtests.')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Weekly score' })).toHaveAttribute('aria-valuenow', '6')

    // Above the target earns nothing extra.
    typeInto(screen.getByRole('textbox', { name: 'Progress for Backtests' }), '25')
    fireEvent.submit(screen.getByRole('textbox', { name: 'Progress for Backtests' }).closest('form')!)
    await screen.findByText('25 / 20 backtests')
    expect(screen.getByRole('progressbar', { name: 'Weekly score' })).toHaveAttribute('aria-valuenow', '6')

    // − corrects it.
    fireEvent.click(screen.getByRole('button', { name: 'Decrease progress for Backtests' }))
    await screen.findByText('24 / 20 backtests')
    expect((await readBoard(factory))?.goals[0]?.manualProgress).toBe(24)
  })

  it('rejects text that is not a whole number and keeps the stored value', async () => {
    const factory = await plantedWeek()
    renderApp({ clock: wednesday(), factory, path: '/weekly' })
    await screen.findByText('Frozen focus')
    const field = screen.getByRole('textbox', { name: 'Progress for Task 1' })
    typeInto(field, '2.5')
    fireEvent.submit(field.closest('form')!)
    expect(await screen.findByText('Enter a whole number, 0 or more.')).toBeInTheDocument()
    expect((await readBoard(factory))?.goals[0]?.manualProgress).toBe(0)
  })

  it('keeps the same + button (and keyboard focus) across updates instead of remounting it', async () => {
    const factory = await plantedWeek()
    renderApp({ clock: wednesday(), factory, path: '/weekly' })
    await screen.findByText('Frozen focus')
    const plus = screen.getByRole('button', { name: 'Increase progress for Task 1' })
    plus.focus()
    fireEvent.click(plus)
    await screen.findByText('Goal complete: Task 1.')
    const item = screen.getByRole('button', { name: 'Increase progress for Task 1' })
    expect(item).toBe(plus) // not remounted
    expect(document.activeElement).toBe(plus) // focus did not jump to the page
    expect(await within(item.closest('li')!).findByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Increase progress for Task 1' })).toBe(plus) // still the same node after the reload
    expect(document.activeElement).toBe(plus)
  })

  it('does not go below zero', async () => {
    const factory = await plantedWeek()
    renderApp({ clock: wednesday(), factory, path: '/weekly' })
    await screen.findByText('Frozen focus')
    expect(screen.getByRole('button', { name: 'Decrease progress for Task 1' })).toBeDisabled()
  })
})

describe('linked goals through the real Home flow', () => {
  it('completing the linked quest on Home moves the weekly progress and the Home card', async () => {
    const factory = await plantedWeek({
      focus: null,
      goals: [
        { id: 'wg_l', title: 'Pray Fajr', maxPoints: 10, target: 2, unit: null, tracking: { mode: 'linked_quest', templateId: 'tpl_seed_prayer_fajr' }, manualProgress: 0, notes: null },
      ],
      rewardTiers: scoringDefinition(0).rewardTiers,
    })
    renderApp({ clock: wednesday(), factory, path: '/' })
    await homeReady()
    const card = await screen.findByRole('link', { name: /WEEKLY GOAL CRUSHER/ })
    expect(card).toHaveTextContent('0 / 10')
    expect(card).toHaveTextContent('0 / 1 goals complete')

    fireEvent.click(screen.getByRole('button', { name: /^Complete Fajr\b/ }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Complete Fajr\b/ })).not.toBeInTheDocument())

    fireEvent.click(within(nav()).getByRole('link', { name: 'Weekly' }))
    await screen.findByText('Counts completions of Fajr this week')
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /progress for Pray Fajr/ })).not.toBeInTheDocument()
  })
})

describe('the Home card', () => {
  it('invites the player to set the week when there is no board, and leads to the Weekly screen', async () => {
    renderApp({ clock: wednesday() })
    await homeReady()
    const card = screen.getByRole('link', { name: /WEEKLY GOAL CRUSHER/ })
    expect(card).toHaveTextContent('Set this week’s Goal Crushers')
    expect(card).toHaveAttribute('href', '/weekly')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument() // the editor is not on Home
  })

  it('shows the score and the completed goals when there is a board', async () => {
    const factory = await plantedWeek(scoringDefinition(6))
    renderApp({ clock: wednesday(), factory })
    await homeReady()
    const card = await screen.findByRole('link', { name: /WEEKLY GOAL CRUSHER/ })
    expect(card).toHaveTextContent('6 / 10')
    expect(card).toHaveTextContent('6 / 10 goals complete')
  })

  it('is hidden while the clock is behind (Home shows the paused state instead)', async () => {
    const clock = wednesday()
    const first = renderApp({ clock })
    await homeReady()
    first.unmount()
    clock.set(noonOn(NEXT_MONDAY))
    const second = renderApp({ clock, factory: first.factory })
    await homeReady()
    clock.set(noonOn(WEDNESDAY))
    await resumeApp() // waits until the app is listening: a `focus` sent before that is simply not heard
    await screen.findByText('Clock appears to have moved backwards')
    expect(screen.queryByRole('link', { name: /WEEKLY GOAL CRUSHER/ })).not.toBeInTheDocument()
    second.unmount()
  })
})

describe('a finished week', () => {
  async function finishedWeek(score: number, rewardText = true) {
    const factory = await plantedWeek(scoringDefinition(score, rewardText))
    return factory
  }

  it('is finalized on the next startup: LAST RESULT with the score, the bonus and the reward, plus one notice on Home', async () => {
    const clock = wednesday()
    const factory = await finishedWeek(9)
    clock.set(noonOn(NEXT_MONDAY))
    renderApp({ clock, factory, path: '/' })
    await homeReady()
    expect(await screen.findByText(/1 weekly board finalized \(\+325 EXP\)\./)).toBeInTheDocument() // one restrained notice
    expect(screen.getAllByRole('status').filter((node) => /finalized/.test(node.textContent ?? ''))).toHaveLength(1)

    fireEvent.click(within(nav()).getByRole('link', { name: 'Weekly' }))
    const last = await screen.findByRole('region', { name: 'LAST RESULT' })
    expect(last).toHaveTextContent('Oct 5 – Oct 11, 2026')
    expect(last).toHaveTextContent('Frozen focus')
    expect(last).toHaveTextContent('9 / 10')
    expect(last).toHaveTextContent('9 / 10 goals complete')
    expect(last).toHaveTextContent('+325 EXP')
    expect(last).toHaveTextContent('Reward (9+): Reward 9')
    expect(within(last).getByRole('button', { name: 'CLAIM REWARD' })).toBeEnabled()
    // The new week has no board yet.
    expect(screen.getByRole('heading', { name: 'SET THIS WEEK’S GOAL CRUSHERS' })).toBeInTheDocument()
  })

  it('dismisses the notice, which then does not return on a same-day reload', async () => {
    const clock = wednesday()
    const factory = await finishedWeek(8)
    clock.set(noonOn(NEXT_MONDAY))
    const first = renderApp({ clock, factory, path: '/' })
    await homeReady()
    await screen.findByText(/1 weekly board finalized \(\+225 EXP\)\./)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/weekly board finalized/)).not.toBeInTheDocument()
    first.unmount()

    renderApp({ clock, factory, path: '/' })
    await homeReady()
    expect(screen.queryByText(/weekly board finalized/)).not.toBeInTheDocument() // finalized once; nothing new to say
  })

  it('claims the reward once: the button is replaced by "Reward claimed" and EXP is untouched', async () => {
    const clock = wednesday()
    const factory = await finishedWeek(10)
    clock.set(noonOn(NEXT_MONDAY))
    renderApp({ clock, factory, path: '/weekly' })
    const last = await screen.findByRole('region', { name: 'LAST RESULT' })
    const claim = within(last).getByRole('button', { name: 'CLAIM REWARD' })
    fireEvent.click(claim)
    fireEvent.click(claim) // a double tap
    expect(await screen.findByText('Reward claimed.', { selector: 'p[role="status"]' })).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'LAST RESULT' })).queryByRole('button', { name: 'CLAIM REWARD' })).not.toBeInTheDocument())
    expect(within(screen.getByRole('region', { name: 'LAST RESULT' })).getByText('Reward claimed')).toBeInTheDocument()
  })

  it('offers no claim when the earned tier has no reward text, or when nothing was earned', async () => {
    const clock = wednesday()
    const blank = await finishedWeek(8, false)
    clock.set(noonOn(NEXT_MONDAY))
    const first = renderApp({ clock, factory: blank, path: '/weekly' })
    const last = await screen.findByRole('region', { name: 'LAST RESULT' })
    expect(within(last).queryByRole('button', { name: 'CLAIM REWARD' })).not.toBeInTheDocument()
    expect(last).toHaveTextContent('none written for this tier')
    first.unmount()

    const clock2 = wednesday()
    const low = await finishedWeek(3)
    clock2.set(noonOn(NEXT_MONDAY))
    renderApp({ clock: clock2, factory: low, path: '/weekly' })
    const lowLast = await screen.findByRole('region', { name: 'LAST RESULT' })
    expect(lowLast).toHaveTextContent('3 / 10')
    expect(lowLast).toHaveTextContent('No weekly bonus')
    expect(lowLast).toHaveTextContent('No reward earned.')
    expect(within(lowLast).queryByRole('button', { name: 'CLAIM REWARD' })).not.toBeInTheDocument()
  })

  it('lists the goals of the finished week with the progress that was scored', async () => {
    const clock = wednesday()
    const factory = await finishedWeek(7)
    clock.set(noonOn(NEXT_MONDAY))
    renderApp({ clock, factory, path: '/weekly' })
    const last = await screen.findByRole('region', { name: 'LAST RESULT' })
    fireEvent.click(within(last).getByText('Goals (7 / 10)'))
    const results = within(within(last).getByRole('list', { name: 'Goal results' })).getAllByRole('listitem')
    expect(results).toHaveLength(10)
    expect(results[0]).toHaveTextContent('Task 1')
    expect(results[0]).toHaveTextContent('1 / 1')
    expect(results[0]).toHaveTextContent('Done · 1 / 1 pts')
    expect(results[9]).toHaveTextContent('Missed · 0 / 1 pts')
  })

  it('has no edit control: the finished week is read-only everywhere', async () => {
    const clock = wednesday()
    const factory = await finishedWeek(7)
    clock.set(noonOn(NEXT_MONDAY))
    renderApp({ clock, factory, path: '/weekly' })
    await screen.findByRole('region', { name: 'LAST RESULT' })
    expect(screen.queryByRole('link', { name: 'Edit goals' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Progress for/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /progress for/i })).not.toBeInTheDocument()
  })
})

describe('Weekly History', () => {
  it('lists finished weeks newest first with range, focus, score, goals, bonus, tier and claim state', async () => {
    const clock = wednesday()
    const factory = await plantedWeek(scoringDefinition(8))
    clock.set(noonOn(NEXT_MONDAY))
    renderApp({ clock, factory, path: '/weekly/history' })
    await screen.findByRole('heading', { name: 'WEEKLY HISTORY' })
    const list = await screen.findByRole('list', { name: 'Finished weeks' })
    const [week] = within(list).getAllByRole('listitem')
    expect(week).toHaveTextContent('Oct 5 – Oct 11, 2026')
    expect(week).toHaveTextContent('Frozen focus')
    expect(week).toHaveTextContent('8 / 10')
    expect(week).toHaveTextContent('8 / 10 goals complete')
    expect(week).toHaveTextContent('+225 EXP')
    expect(week).toHaveTextContent('Reward (8+): Reward 8')
    fireEvent.click(within(week!).getByRole('button', { name: 'CLAIM REWARD' }))
    expect(await within(week!).findByText('Reward claimed')).toBeInTheDocument()
  })

  it('shows a failure with a retry when the history cannot be read', async () => {
    const base = newFactory()
    const { factory, state } = writeFailingFactory(base)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderApp({ clock: wednesday(), factory, path: '/weekly/history' })
    await screen.findByRole('heading', { name: 'WEEKLY HISTORY' })
    await screen.findByText('No finished weeks yet. A week is finalized after its Sunday.')
    state.failReads = true
    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    fireEvent.click(await screen.findByRole('link', { name: 'History' }))
    expect(await screen.findByText('Your weekly history could not be loaded.')).toBeInTheDocument()
    state.failReads = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No finished weeks yet. A week is finalized after its Sunday.')).toBeInTheDocument()
  })
})
