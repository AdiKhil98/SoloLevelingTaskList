import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newFactory } from '@/application/test-utils/helpers'
import { CATEGORIES, DIFFICULTIES, DIFFICULTY_EXP } from '@/domain'
import { renderApp } from '@/test/renderApp'
import {
  choose,
  fillTitle,
  listedQuests,
  readTemplates,
  setDate,
  submit,
  titleField,
  waitForQuestsPage,
  writeFailingFactory,
} from '@/test/questUi'

afterEach(() => {
  vi.restoreAllMocks()
})

async function openCreateForm(options: Parameters<typeof renderApp>[0] = {}) {
  const view = renderApp({ path: '/quests/new', ...options })
  await screen.findByRole('heading', { name: 'NEW QUEST' })
  return view
}

describe('Create quest form — fields', () => {
  it('shows title, type, difficulty, a read-only reward and category', async () => {
    await openCreateForm()

    expect(titleField()).toHaveValue('')
    expect(screen.getByRole('radio', { name: 'Daily' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Scheduled' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'One-Time' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'C — Normal' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Discipline' })).toBeChecked()
    expect(screen.getByText('Reward')).toBeInTheDocument()
    expect(screen.getByText(`+${DIFFICULTY_EXP.C} EXP`)).toBeInTheDocument()
  })

  it('offers exactly the six difficulties and the five approved categories', async () => {
    await openCreateForm()

    const difficulty = screen.getByRole('group', { name: 'Difficulty' })
    expect(within(difficulty).getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([...DIFFICULTIES])
    expect(within(difficulty).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual([
      'E — Trivial',
      'D — Easy',
      'C — Normal',
      'B — Hard',
      'A — Very Hard',
      'S — Major',
    ])
    const category = screen.getByRole('group', { name: 'Category' })
    expect(within(category).getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([...CATEGORIES])
    expect(within(category).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual([
      'Discipline',
      'Fitness',
      'Business',
      'Knowledge',
      'Trading',
    ])
  })

  it.each(DIFFICULTIES)('updates the reward immediately when difficulty %s is chosen (from the domain table)', async (difficulty) => {
    await openCreateForm()

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${difficulty} — `) }))

    expect(screen.getByRole('radio', { name: new RegExp(`^${difficulty} — `) })).toBeChecked()
    expect(screen.getByText(`+${DIFFICULTY_EXP[difficulty]} EXP`)).toBeInTheDocument()
  })

  it('has no editable EXP input of any kind', async () => {
    const { container } = await openCreateForm()

    const inputs = [...container.querySelectorAll('input')]
    expect(inputs.filter((input) => /exp|reward|point|xp/i.test(`${input.name} ${input.id}`))).toEqual([])
    expect(inputs.filter((input) => input.type === 'number')).toEqual([])
    expect(screen.queryByLabelText(/exp/i)).not.toBeInTheDocument()
    // The reward line is plain text, not a control.
    expect(screen.getByText(`+${DIFFICULTY_EXP.C} EXP`).closest('input,button,select,textarea')).toBeNull()
  })

  it('shows only the Daily start date at first', async () => {
    await openCreateForm()

    expect(screen.getByLabelText('Start date')).toHaveValue('2026-10-05')
    expect(screen.queryByLabelText('Every (days)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Quest date')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Monday' })).not.toBeInTheDocument()
  })

  it('does not expose internal fields', async () => {
    const { container } = await openCreateForm()

    const names = [...container.querySelectorAll('input')].map((input) => `${input.name}|${input.id}`)
    expect(names.filter((name) => /seed|role|templateId|^id\|/i.test(name))).toEqual([])
    expect(document.body.textContent).not.toMatch(/seedKey|templateId|tpl_/)
  })

  it('uses a native date input and a numeric keypad for the interval', async () => {
    await openCreateForm()
    expect(screen.getByLabelText('Start date')).toHaveAttribute('type', 'date')

    choose('radio', 'Scheduled')
    choose('radio', 'Interval')

    const days = screen.getByLabelText('Every (days)')
    expect(days).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByLabelText('Starting')).toHaveAttribute('type', 'date')
  })
})

describe('Create quest form — recurrence types', () => {
  it('Scheduled → Selected weekdays shows seven accessible weekday checkboxes', async () => {
    await openCreateForm()

    choose('radio', 'Scheduled')

    expect(screen.getByRole('radio', { name: 'Selected weekdays' })).toBeChecked()
    const days = screen.getByRole('group', { name: 'Days' })
    const boxes = within(days).getAllByRole('checkbox')
    expect(boxes.map((box) => box.closest('label')?.textContent)).toEqual([
      'MonMonday',
      'TueTuesday',
      'WedWednesday',
      'ThuThursday',
      'FriFriday',
      'SatSaturday',
      'SunSunday',
    ])
    for (const name of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked()
    }
  })

  it('exposes the selected state of a weekday as it is toggled', async () => {
    await openCreateForm()
    choose('radio', 'Scheduled')

    choose('checkbox', 'Wednesday')
    expect(screen.getByRole('checkbox', { name: 'Wednesday' })).toBeChecked()
    choose('checkbox', 'Wednesday')
    expect(screen.getByRole('checkbox', { name: 'Wednesday' })).not.toBeChecked()
  })

  it('Scheduled → Interval shows "Every N days" and a start date', async () => {
    await openCreateForm()

    choose('radio', 'Scheduled')
    choose('radio', 'Interval')

    expect(screen.getByLabelText('Every (days)')).toHaveValue('2')
    expect(screen.getByLabelText('Starting')).toHaveValue('2026-10-05')
    expect(screen.queryByRole('group', { name: 'Days' })).not.toBeInTheDocument()
  })

  it('One-Time shows a single required date and no repeat option', async () => {
    await openCreateForm()

    choose('radio', 'One-Time')

    expect(screen.getByLabelText('Quest date')).toBeInTheDocument()
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Interval|Selected weekdays/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('remembers the chosen schedule when switching type and back', async () => {
    await openCreateForm()
    choose('radio', 'Scheduled')
    choose('radio', 'Interval')
    choose('radio', 'Daily')

    choose('radio', 'Scheduled')

    expect(screen.getByRole('radio', { name: 'Interval' })).toBeChecked()
  })
})

describe('Create quest form — saving', () => {
  it('creates a Daily quest and returns to the list with a confirmation', async () => {
    const factory = newFactory()
    await openCreateForm({ factory })

    fillTitle('  Read 10 pages  ')
    choose('radio', 'B — Hard')
    choose('radio', 'Knowledge')
    submit('Create Quest')

    await waitForQuestsPage()
    expect(screen.getByText('Quest created.')).toBeInTheDocument()
    const rows = listedQuests().map((row) => row.textContent)
    expect(rows).toContainEqual(expect.stringContaining('Read 10 pages'))
    expect(rows.find((row) => row?.includes('Read 10 pages'))).toContain('Difficulty B · +55 EXP · Knowledge')
    const stored = (await readTemplates(factory)).find((template) => template.title === 'Read 10 pages')
    expect(stored).toMatchObject({ difficulty: 'B', category: 'knowledge', recurrence: { kind: 'daily' }, role: 'standard', seedKey: null })
  })

  it('creates a selected-weekday quest', async () => {
    const factory = newFactory()
    await openCreateForm({ factory })

    fillTitle('Backtesting')
    choose('radio', 'Scheduled')
    choose('checkbox', 'Friday')
    choose('checkbox', 'Monday')
    choose('checkbox', 'Wednesday')
    choose('radio', 'Trading')
    submit('Create Quest')

    await waitForQuestsPage()
    const row = listedQuests().find((item) => item.textContent?.includes('Backtesting'))
    expect(row).toHaveTextContent('Scheduled · Mon, Wed, Fri')
    expect((await readTemplates(factory)).find((t) => t.title === 'Backtesting')?.recurrence).toEqual({
      kind: 'weekdays',
      weekdays: [1, 3, 5],
    })
  })

  it('creates an interval quest', async () => {
    const factory = newFactory()
    await openCreateForm({ factory })

    fillTitle('Gym')
    choose('radio', 'Scheduled')
    choose('radio', 'Interval')
    fireEvent.change(screen.getByLabelText('Every (days)'), { target: { value: '3' } })
    setDate('Starting', '2026-10-08')
    submit('Create Quest')

    await waitForQuestsPage()
    expect(listedQuests().find((item) => item.textContent?.includes('Gym'))).toHaveTextContent('Scheduled · Every 3 days')
    expect((await readTemplates(factory)).find((t) => t.title === 'Gym')?.recurrence).toEqual({
      kind: 'interval',
      everyNDays: 3,
      anchor: '2026-10-08',
    })
  })

  it('creates a one-time quest', async () => {
    const factory = newFactory()
    await openCreateForm({ factory })

    fillTitle('Dentist')
    choose('radio', 'One-Time')
    setDate('Quest date', '2026-10-20')
    submit('Create Quest')

    await waitForQuestsPage()
    expect(listedQuests().find((item) => item.textContent?.includes('Dentist'))).toHaveTextContent('One-time · Oct 20, 2026')
    expect((await readTemplates(factory)).find((t) => t.title === 'Dentist')?.recurrence).toEqual({
      kind: 'one_time',
      date: '2026-10-20',
    })
  })

  it('keeps only one quest when Save is tapped twice quickly', async () => {
    const factory = newFactory()
    await openCreateForm({ factory })
    fillTitle('Tap twice')

    const button = screen.getByRole('button', { name: 'Create Quest' })
    fireEvent.click(button)
    fireEvent.click(button)

    await waitForQuestsPage()
    await waitFor(async () => {
      expect((await readTemplates(factory)).filter((template) => template.title === 'Tap twice')).toHaveLength(1)
    })
  })

  it('Cancel returns to the list without creating anything', async () => {
    const factory = newFactory()
    await openCreateForm({ factory })
    fillTitle('Never saved')

    fireEvent.click(screen.getByRole('link', { name: 'Cancel' }))

    await waitForQuestsPage()
    expect((await readTemplates(factory)).map((template) => template.title)).not.toContain('Never saved')
  })
})

describe('Create quest form — validation', () => {
  it('shows an associated error for an empty title and moves focus to the summary', async () => {
    const factory = newFactory()
    await openCreateForm({ factory })

    submit('Create Quest')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Title: Enter a title.')
    await waitFor(() => expect(alert).toHaveFocus())
    expect(titleField()).toHaveAttribute('aria-invalid', 'true')
    const describedBy = titleField().getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent('Enter a title.')
    expect(screen.getByRole('heading', { name: 'NEW QUEST' })).toBeInTheDocument()
    expect(await readTemplates(factory)).toHaveLength(6)
  })

  it('does not rely on a disabled submit button to communicate validation', async () => {
    await openCreateForm()

    const button = screen.getByRole('button', { name: 'Create Quest' })

    expect(button).toBeEnabled()
  })

  it('requires at least one weekday', async () => {
    await openCreateForm()
    fillTitle('No days')
    choose('radio', 'Scheduled')

    submit('Create Quest')

    expect(await screen.findByRole('alert')).toHaveTextContent('Days: Choose at least one day.')
    expect(screen.getByText('Choose at least one day.', { selector: 'p#weekdays-error' })).toBeInTheDocument()
  })

  it.each([
    ['1', 'Use 2 or more days. For every day, choose Daily.'],
    ['0', 'Use 2 or more days. For every day, choose Daily.'],
    ['', 'Enter how many days.'],
    ['2.5', 'Use a whole number of days, digits only.'],
    ['abc', 'Use a whole number of days, digits only.'],
    ['-2', 'Use a whole number of days, digits only.'],
  ])('rejects an interval of %j', async (value, message) => {
    await openCreateForm()
    fillTitle('Interval')
    choose('radio', 'Scheduled')
    choose('radio', 'Interval')
    fireEvent.change(screen.getByLabelText('Every (days)'), { target: { value } })

    submit('Create Quest')

    expect(await screen.findByRole('alert')).toHaveTextContent(`Every (days): ${message}`)
    expect(screen.getByLabelText('Every (days)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('rejects a start date in the past and a missing one-time date', async () => {
    await openCreateForm()
    fillTitle('Dates')
    setDate('Start date', '2026-10-04')
    submit('Create Quest')
    expect(await screen.findByRole('alert')).toHaveTextContent('Start date: The date cannot be in the past.')

    choose('radio', 'One-Time')
    setDate('Quest date', '')
    submit('Create Quest')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Quest date: Choose a date.'))
  })

  it('lists every problem at once', async () => {
    await openCreateForm()
    choose('radio', 'Scheduled')
    setDate('Start date', '')

    submit('Create Quest')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Title: Enter a title.')
    expect(alert).toHaveTextContent('Days: Choose at least one day.')
    expect(alert).toHaveTextContent('Start date: Choose a date.')
  })

  it('gives every form control a real label', async () => {
    await openCreateForm()
    choose('radio', 'Scheduled')
    choose('radio', 'Interval')

    for (const control of [titleField(), screen.getByLabelText('Every (days)'), screen.getByLabelText('Starting')]) {
      expect(control).toHaveAccessibleName()
    }
    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAccessibleName()
  })
})

describe('Create quest form — failure', () => {
  it('stays on the form, keeps what was typed, shows a safe message, and works once saving recovers', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { factory, state } = writeFailingFactory(newFactory())
    await openCreateForm({ factory })
    fillTitle('Typed carefully')
    choose('radio', 'A — Very Hard')
    choose('radio', 'Business')
    state.failWrites = true

    submit('Create Quest')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('That quest could not be saved. Nothing was created. Please try again.')
    expect(document.body).not.toHaveTextContent('Raw internal failure')
    expect(document.body).not.toHaveTextContent('disk exploded')
    expect(screen.getByRole('heading', { name: 'NEW QUEST' })).toBeInTheDocument()
    expect(titleField()).toHaveValue('Typed carefully')
    expect(screen.getByRole('radio', { name: 'A — Very Hard' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Business' })).toBeChecked()
    expect(consoleError).toHaveBeenCalled()
    state.failWrites = false
    expect((await readTemplates(factory)).map((template) => template.title)).not.toContain('Typed carefully')

    submit('Create Quest')

    await waitForQuestsPage()
    expect(screen.getByText('Quest created.')).toBeInTheDocument()
    expect((await readTemplates(factory)).filter((t) => t.title === 'Typed carefully')).toHaveLength(1)
  })
})
