import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, newFactory, noonOn } from '@/application/test-utils/helpers'
import { renderApp } from '@/test/renderApp'
import { writeFailingFactory } from '@/test/questUi'
import { editorReady, fillGoal, goalCard, goalCards, readBoard, readBoards, save, typeInto, WEDNESDAY, weeklyReady } from '@/test/weeklyUi'

afterEach(() => {
  vi.restoreAllMocks()
})

/** The running total under the Goals heading (each goal's own points `<output>` is a status too). */
const pointsReadout = () => screen.getByText(/^\d+ \/ 10 points$/)

const wednesday = () => createTestClock(noonOn(WEDNESDAY))

async function openEditor(options: Parameters<typeof renderApp>[0] = {}) {
  const view = renderApp({ path: '/weekly/edit', clock: wednesday(), ...options })
  await editorReady('SET WEEKLY GOALS')
  return view
}

describe('the weekly goal form — fields', () => {
  it('starts empty for a new week: one blank goal, no points, five empty reward fields', async () => {
    await openEditor()
    expect(screen.getByText('Oct 5 – Oct 11, 2026')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Weekly Focus (optional)' })).toHaveValue('')
    expect(goalCards()).toHaveLength(1)
    expect(pointsReadout()).toHaveTextContent('1 / 10 points') // the blank goal's single default point
    for (const label of ['6+ points', '7+ points', '8+ points', '9+ points', '10 points']) {
      expect(screen.getByRole('textbox', { name: label })).toHaveValue('')
    }
  })

  it('adds and removes goals, and the points readout follows', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    expect(goalCards()).toHaveLength(3)
    expect(pointsReadout()).toHaveTextContent('3 / 10 points')

    fireEvent.click(within(goalCard(1)).getByRole('button', { name: 'Increase points for goal 2' }))
    expect(pointsReadout()).toHaveTextContent('4 / 10 points')
    fireEvent.click(screen.getByRole('button', { name: 'Remove goal 2' }))
    expect(goalCards()).toHaveLength(2)
    expect(pointsReadout()).toHaveTextContent('2 / 10 points')
  })

  it('keeps the point stepper within 1 to 10', async () => {
    await openEditor()
    const card = within(goalCard(0))
    expect(card.getByRole('button', { name: 'Decrease points for goal 1' })).toBeDisabled()
    for (let press = 0; press < 12; press += 1) {
      const increase = card.getByRole('button', { name: 'Increase points for goal 1' })
      if (!(increase as HTMLButtonElement).disabled) fireEvent.click(increase)
    }
    expect(card.getByRole('status', { name: 'Points for goal 1' })).toHaveTextContent('10')
    expect(card.getByRole('button', { name: 'Increase points for goal 1' })).toBeDisabled()
  })

  it('lets the player choose how progress is measured, and only then shows the quest selector', async () => {
    await openEditor()
    const card = within(goalCard(0))
    expect(card.getByRole('radio', { name: 'I update it' })).toBeChecked()
    expect(card.queryByLabelText('Quest to count')).not.toBeInTheDocument()

    fireEvent.click(card.getByRole('radio', { name: 'Counted from a quest' }))
    const select = card.getByLabelText('Quest to count')
    // The active quests (the six defaults) are offered, none invented.
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Choose a quest…',
      'Fajr',
      'Dhuhr',
      'Asr',
      'Maghrib',
      'Isha',
      'Sleep before 00:00',
    ])
  })
})

describe('the weekly goal form — saving', () => {
  it('saves a valid board and shows it on the Weekly screen', async () => {
    const { factory } = await openEditor()
    typeInto(screen.getByRole('textbox', { name: 'Weekly Focus (optional)' }), 'Build clean backtesting reps.')
    fillGoal(0, { title: 'Complete backtests', target: '20', unit: 'backtests', points: 6 })
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    fillGoal(1, { title: 'Finish the report', target: '1', points: 4 })
    expect(pointsReadout()).toHaveTextContent('10 / 10 points')
    typeInto(screen.getByRole('textbox', { name: '6+ points' }), 'Gaming')
    typeInto(screen.getByRole('textbox', { name: '10 points' }), 'Evening off')
    save()

    await weeklyReady()
    expect(await screen.findByText('Goal Crushers set for this week.')).toBeInTheDocument()
    expect(await screen.findByText('Build clean backtesting reps.')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Weekly score' })).toHaveAttribute('aria-valuenow', '0')
    const goals = screen.getByRole('list', { name: 'Weekly goals' })
    expect(within(goals).getAllByRole('listitem')).toHaveLength(2)
    expect(within(goals).getByText('Complete backtests')).toBeInTheDocument()
    expect(within(goals).getByText('0 / 20 backtests')).toBeInTheDocument()

    const board = await readBoard(factory)
    expect(board).toMatchObject({ status: 'active', revision: 1, focus: 'Build clean backtesting reps.' })
    expect(board?.goals.map((goal) => [goal.title, goal.maxPoints, goal.target, goal.unit])).toEqual([
      ['Complete backtests', 6, 20, 'backtests'],
      ['Finish the report', 4, 1, null],
    ])
    expect(board?.rewardTiers.map((tier) => tier.text)).toEqual(['Gaming', '', '', '', 'Evening off'])
  })

  it.each([
    ['below ten', 1, '(they add up to 1)'],
    ['above ten', 11, '(they add up to 11)'],
  ])('refuses points that total %s, says what they add up to, and saves nothing', async (_name, total, phrase) => {
    const { factory } = await openEditor()
    fillGoal(0, { title: 'Only goal', target: '1', points: Math.min(total, 10) })
    if (total > 10) {
      fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
      fillGoal(1, { title: 'Second', target: '1', points: 1 })
    }
    save()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nothing was saved')
    expect(alert).toHaveTextContent('must add up to exactly 10')
    expect(alert).toHaveTextContent(phrase)
    expect(await readBoards(factory)).toEqual([])
    expect(screen.getByRole('heading', { name: 'SET WEEKLY GOALS' })).toBeInTheDocument() // still on the form
  })

  it('shows every field problem together, tied to its field, and keeps what was typed', async () => {
    await openEditor()
    fillGoal(0, { title: '', target: 'abc', points: 10 })
    save()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Goal 1 · Title: Enter a title.')
    expect(alert).toHaveTextContent('Goal 1 · Target:')
    const card = within(goalCard(0))
    expect(card.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    expect(card.getByLabelText('Target')).toHaveAttribute('aria-invalid', 'true')
    expect(card.getByLabelText('Target')).toHaveValue('abc')
  })

  it('requires a quest for a linked goal', async () => {
    const { factory } = await openEditor()
    fillGoal(0, { title: 'Pray on time', target: '5', points: 10 })
    fireEvent.click(within(goalCard(0)).getByRole('radio', { name: 'Counted from a quest' }))
    save()
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the quest to count.')
    expect(await readBoards(factory)).toEqual([])
  })

  it('saves a linked goal and shows what it counts', async () => {
    const { factory } = await openEditor()
    fillGoal(0, { title: 'Pray Fajr', target: '3', points: 10 })
    fireEvent.click(within(goalCard(0)).getByRole('radio', { name: 'Counted from a quest' }))
    fireEvent.change(within(goalCard(0)).getByLabelText('Quest to count'), { target: { value: 'tpl_seed_prayer_fajr' } })
    save()

    await weeklyReady()
    expect(await screen.findByText('Counts completions of Fajr this week')).toBeInTheDocument()
    expect(await readBoard(factory)).toMatchObject({ goals: [{ tracking: { mode: 'linked_quest', templateId: 'tpl_seed_prayer_fajr' } }] })
    // A linked goal has no manual control.
    expect(screen.queryByRole('button', { name: /Increase progress for Pray Fajr/ })).not.toBeInTheDocument()
  })

  it('does not save twice on a double tap', async () => {
    const { factory } = await openEditor()
    fillGoal(0, { title: 'One goal', target: '1', points: 10 })
    const button = screen.getByRole('button', { name: 'Save Goals' })
    fireEvent.click(button)
    fireEvent.click(button)
    await weeklyReady()
    expect(await readBoards(factory)).toHaveLength(1)
  })

  it('shows a clear failure and keeps the form when saving fails', async () => {
    const base = newFactory()
    const { factory, state } = writeFailingFactory(base)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await openEditor({ factory })
    fillGoal(0, { title: 'One goal', target: '1', points: 10 })
    state.failWrites = true
    save()
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was changed')
    expect(screen.getByRole('heading', { name: 'SET WEEKLY GOALS' })).toBeInTheDocument()
    state.failWrites = false
    expect(await readBoards(base)).toEqual([])
  })
})

describe('editing the current week’s board', () => {
  async function withBoard() {
    const view = await openEditor()
    typeInto(screen.getByRole('textbox', { name: 'Weekly Focus (optional)' }), 'Original focus')
    fillGoal(0, { title: 'Backtests', target: '20', unit: 'reps', points: 6 })
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    fillGoal(1, { title: 'Report', target: '1', points: 4 })
    typeInto(screen.getByRole('textbox', { name: '8+ points' }), 'Movie night')
    save()
    await weeklyReady()
    await screen.findByText('Original focus')
    return view
  }

  it('loads the saved values, saves a change as a new revision and keeps what was already counted', async () => {
    const { factory, router } = await withBoard()
    // Count some progress first.
    fireEvent.click(await screen.findByRole('button', { name: 'Increase progress for Report' }))
    await screen.findByText('Complete · 4 pts')

    fireEvent.click(screen.getByRole('link', { name: 'Edit goals' }))
    await editorReady('EDIT WEEKLY GOALS')
    expect(screen.getByRole('textbox', { name: 'Weekly Focus (optional)' })).toHaveValue('Original focus')
    expect(within(goalCard(0)).getByLabelText('Title')).toHaveValue('Backtests')
    expect(within(goalCard(0)).getByLabelText('Target')).toHaveValue('20')
    expect(screen.getByRole('textbox', { name: '8+ points' })).toHaveValue('Movie night')

    typeInto(within(goalCard(1)).getByLabelText('Title'), 'Report v2')
    typeInto(screen.getByRole('textbox', { name: 'Weekly Focus (optional)' }), 'Edited focus')
    save()
    await weeklyReady()
    expect(await screen.findByText('Weekly board updated.')).toBeInTheDocument()
    expect(await screen.findByText('Edited focus')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/weekly')

    const board = await readBoard(factory)
    expect(board).toMatchObject({ revision: 3, focus: 'Edited focus' })
    expect(board?.goals[1]).toMatchObject({ title: 'Report v2', manualProgress: 1 }) // the counted progress survived the edit
  })

  it('refuses to save an edited board whose weights no longer total 10, and leaves the stored board alone', async () => {
    const { factory } = await withBoard()
    fireEvent.click(screen.getByRole('link', { name: 'Edit goals' }))
    await editorReady('EDIT WEEKLY GOALS')
    fireEvent.click(within(goalCard(1)).getByRole('button', { name: 'Decrease points for goal 2' }))
    save()
    expect(await screen.findByRole('alert')).toHaveTextContent('must add up to exactly 10')
    expect(await readBoard(factory)).toMatchObject({ revision: 1 })
  })

  it('offers a goal’s removal and recomputes the total', async () => {
    await withBoard()
    fireEvent.click(screen.getByRole('link', { name: 'Edit goals' }))
    await editorReady('EDIT WEEKLY GOALS')
    expect(pointsReadout()).toHaveTextContent('10 / 10 points')
    fireEvent.click(screen.getByRole('button', { name: 'Remove goal 2' }))
    expect(pointsReadout()).toHaveTextContent('6 / 10 points')
  })

  it('never offers editing once the clock is behind the recorded history', async () => {
    const clock = wednesday()
    const first = renderApp({ clock, path: '/weekly/edit' })
    await editorReady('SET WEEKLY GOALS')
    first.unmount()
    // Finalize days up to the next Monday, then set the device clock back.
    clock.set(noonOn('2026-10-12'))
    const second = renderApp({ clock, factory: first.factory, path: '/weekly' })
    await weeklyReady()
    clock.set(noonOn(WEDNESDAY))
    await act(async () => {
      window.dispatchEvent(new Event('focus')) // the app resumes and finds the clock behind the recorded days
    })
    await act(async () => {
      await second.router.navigate('/weekly/edit')
    })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Changes paused' })).toBeInTheDocument())
  })
})
