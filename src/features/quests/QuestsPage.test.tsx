import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { archiveQuest, createQuest } from '@/application'
import { buildFormValues, buildTemplate, createSequentialIds, createTestClock, d, newFactory, noonOn } from '@/application/test-utils/helpers'
import { createTemplate, openDatabase } from '@/persistence'
import { renderApp } from '@/test/renderApp'
import { listedQuests, readTemplate, waitForQuestsPage, writeFailingFactory } from '@/test/questUi'

afterEach(() => {
  vi.restoreAllMocks()
})

const MONDAY = '2026-10-05'

async function withDatabase<T>(factory: IDBFactory, work: (context: Parameters<typeof createQuest>[0]) => Promise<T>) {
  const database = await openDatabase({ factory })
  try {
    return await work({ database, clock: createTestClock(noonOn(MONDAY)), ids: createSequentialIds() })
  } finally {
    database.close()
  }
}

const row = (title: string) => {
  const found = listedQuests().find((item) => within(item).queryByText(title) !== null)
  if (found === undefined) throw new Error(`no row titled ${title}`)
  return found
}

async function openQuests(factory = newFactory(), options: Parameters<typeof renderApp>[0] = {}) {
  const view = renderApp({ path: '/quests', factory, ...options })
  await waitForQuestsPage()
  return view
}

describe('Quest list', () => {
  it('lists the six default quests with recurrence, difficulty, reward and category', async () => {
    await openQuests()

    expect(listedQuests().map((item) => within(item).getAllByText(/./)[0]?.textContent)).toEqual([
      'Fajr',
      'Dhuhr',
      'Asr',
      'Maghrib',
      'Isha',
      'Sleep before 00:00',
    ])
    expect(row('Fajr')).toHaveTextContent('Daily')
    expect(row('Fajr')).toHaveTextContent('Difficulty E · +10 EXP · Discipline')
    expect(row('Sleep before 00:00')).toHaveTextContent('Difficulty D · +20 EXP · Discipline')
    expect(screen.getByRole('button', { name: 'Active (6)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Archived (0)' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows recurrence summaries for each kind', async () => {
    const factory = newFactory()
    await withDatabase(factory, async (context) => {
      await createQuest(context, buildFormValues({ title: 'Gym', recurrence: 'weekdays', weekdays: [1, 3, 5], difficulty: 'B', category: 'fitness' }, MONDAY))
      await createQuest(context, buildFormValues({ title: 'Every other', recurrence: 'interval', intervalDays: '2', startDate: '2026-10-05' }, MONDAY))
      await createQuest(context, buildFormValues({ title: 'Appointment', recurrence: 'one_time', questDate: '2026-10-08' }, MONDAY))
    })

    await openQuests(factory)

    expect(row('Gym')).toHaveTextContent('Scheduled · Mon, Wed, Fri')
    expect(row('Gym')).toHaveTextContent('Difficulty B · +55 EXP · Fitness')
    expect(row('Every other')).toHaveTextContent('Scheduled · Every 2 days')
    expect(row('Appointment')).toHaveTextContent('One-time · Oct 8, 2026')
    expect(row('Fajr')).not.toHaveTextContent('Scheduled')
  })

  it('has an obvious Add Quest action that opens the create form', async () => {
    await openQuests()

    const add = screen.getByRole('link', { name: 'Add Quest' })
    expect(add).toHaveAttribute('href', '/quests/new')
    fireEvent.click(add)

    expect(await screen.findByRole('heading', { name: 'NEW QUEST' })).toBeInTheDocument()
  })

  it('labels a past one-time quest', async () => {
    const factory = newFactory()
    await withDatabase(factory, (context) =>
      createTemplate(
        context.database,
        buildTemplate({ id: 'tpl_old', title: 'Old appointment', recurrence: { kind: 'one_time', date: d('2026-10-01') }, activeFrom: d('2026-09-30') }),
      ),
    )

    await openQuests(factory)

    expect(row('Old appointment')).toHaveTextContent('Date passed')
  })

  it('shows a helpful empty state when every quest is archived', async () => {
    const factory = newFactory()
    await openQuests(factory)
    for (const title of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00']) {
      fireEvent.click(screen.getByRole('button', { name: `Archive ${title}` }))
      fireEvent.click(await screen.findByRole('button', { name: 'Archive Quest' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: `Archive ${title}` })).not.toBeInTheDocument())
    }

    expect(screen.getByText('No active quests. Add one to get started.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archived (6)' })).toBeInTheDocument()
  })
})

describe('Archive confirmation', () => {
  it('appears on Archive, says what will and will not happen, and focuses the safe choice', async () => {
    await openQuests()

    fireEvent.click(screen.getByRole('button', { name: 'Archive Fajr' }))

    const confirmation = await screen.findByRole('group', { name: 'Archive “Fajr”?' })
    expect(confirmation).toHaveTextContent('It will stop appearing on future days.')
    expect(confirmation).toHaveTextContent('Your history and earned EXP stay as they are.')
    expect(confirmation).toHaveTextContent('If it is already on today’s list, it stays there until the day ends.')
    expect(within(confirmation).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Archive Fajr' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('Cancel archives nothing and returns focus to the Archive button', async () => {
    const factory = newFactory()
    await openQuests(factory)
    fireEvent.click(screen.getByRole('button', { name: 'Archive Fajr' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('group', { name: /^Archive/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive Fajr' })).toHaveFocus()
    expect(listedQuests()).toHaveLength(6)
    expect((await readTemplate(factory, 'tpl_seed_prayer_fajr'))?.status).toBe('active')
  })

  it('Escape cancels the confirmation without archiving', async () => {
    const factory = newFactory()
    await openQuests(factory)
    fireEvent.click(screen.getByRole('button', { name: 'Archive Fajr' }))
    const confirmation = await screen.findByRole('group', { name: 'Archive “Fajr”?' })

    fireEvent.keyDown(within(confirmation).getByRole('button', { name: 'Cancel' }), { key: 'Escape' })

    expect(screen.queryByRole('group', { name: /^Archive/ })).not.toBeInTheDocument()
    expect((await readTemplate(factory, 'tpl_seed_prayer_fajr'))?.status).toBe('active')
  })

  it('opens one confirmation at a time', async () => {
    await openQuests()

    fireEvent.click(screen.getByRole('button', { name: 'Archive Fajr' }))
    await screen.findByRole('group', { name: 'Archive “Fajr”?' })
    fireEvent.click(screen.getByRole('button', { name: 'Archive Dhuhr' }))

    expect(await screen.findByRole('group', { name: 'Archive “Dhuhr”?' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Archive “Fajr”?' })).not.toBeInTheDocument()
  })

  it('Archive Quest archives it, confirms, and moves it to the Archived view', async () => {
    const factory = newFactory()
    await openQuests(factory)
    fireEvent.click(screen.getByRole('button', { name: 'Archive Fajr' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Archive Quest' }))

    expect(await screen.findByText('Quest archived.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Active (5)' })).toBeInTheDocument())
    expect(listedQuests().map((item) => item.textContent).join()).not.toContain('Fajr')
    expect(await readTemplate(factory, 'tpl_seed_prayer_fajr')).toMatchObject({ status: 'archived', seedKey: 'prayer.fajr' })

    fireEvent.click(screen.getByRole('button', { name: 'Archived (1)' }))
    expect(row('Fajr')).toHaveTextContent('Daily')
  })

  it('keeps the quest active and listed, with a recoverable message, when archiving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { factory, state } = writeFailingFactory(newFactory())
    await openQuests(factory)
    fireEvent.click(screen.getByRole('button', { name: 'Archive Fajr' }))
    state.failWrites = true

    fireEvent.click(await screen.findByRole('button', { name: 'Archive Quest' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('That quest could not be archived. It is still active. Please try again.')
    expect(document.body).not.toHaveTextContent('disk exploded')
    expect(listedQuests()).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Active (6)' })).toBeInTheDocument()
    expect(screen.queryByText('Quest archived.')).not.toBeInTheDocument()
    state.failWrites = false

    fireEvent.click(screen.getByRole('button', { name: 'Archive Quest' }))
    expect(await screen.findByText('Quest archived.')).toBeInTheDocument()
  })
})

describe('Archived view and restore', () => {
  it('shows archived quests separately, with Restore and no Edit', async () => {
    const factory = newFactory()
    await withDatabase(factory, async (context) => {
      const created = await createQuest(context, buildFormValues({ title: 'Shelved' }, MONDAY))
      if (created.status !== 'created') throw new Error('seed failed')
      await archiveQuest(context, created.templateId)
    })
    await openQuests(factory)
    expect(listedQuests().map((item) => item.textContent).join()).not.toContain('Shelved')

    fireEvent.click(screen.getByRole('button', { name: 'Archived (1)' }))

    expect(row('Shelved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore Shelved' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit Shelved' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive Shelved' })).not.toBeInTheDocument()
  })

  it('Restore makes the quest active again and confirms', async () => {
    const factory = newFactory()
    const id = await withDatabase(factory, async (context) => {
      const created = await createQuest(context, buildFormValues({ title: 'Shelved' }, MONDAY))
      if (created.status !== 'created') throw new Error('seed failed')
      await archiveQuest(context, created.templateId)
      return created.templateId
    })
    await openQuests(factory)
    fireEvent.click(screen.getByRole('button', { name: 'Archived (1)' }))

    fireEvent.click(screen.getByRole('button', { name: 'Restore Shelved' }))

    expect(await screen.findByText('Quest restored.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archived (0)' })).toBeInTheDocument())
    expect(screen.getByText('No archived quests.')).toBeInTheDocument()
    expect(await readTemplate(factory, id)).toMatchObject({ status: 'active', activeUntil: null })
  })

  it('does not offer to restore a one-time quest whose date has passed', async () => {
    const factory = newFactory()
    await withDatabase(factory, async (context) => {
      const created = await createQuest(context, buildFormValues({ title: 'Last week', recurrence: 'one_time', questDate: MONDAY }, MONDAY))
      if (created.status !== 'created') throw new Error('seed failed')
      await archiveQuest(context, created.templateId)
    })
    await openQuests(factory, { clock: createTestClock(noonOn('2026-10-08')) })

    fireEvent.click(screen.getByRole('button', { name: 'Archived (1)' }))

    expect(row('Last week')).toHaveTextContent('Date passed')
    expect(row('Last week')).toHaveTextContent('cannot be restored')
    expect(screen.queryByRole('button', { name: 'Restore Last week' })).not.toBeInTheDocument()
  })

  it('shows an empty archived view', async () => {
    await openQuests()

    fireEvent.click(screen.getByRole('button', { name: 'Archived (0)' }))

    expect(screen.getByText('No archived quests.')).toBeInTheDocument()
  })
})

describe('Quest list errors', () => {
  it('shows a recoverable error with Retry when the list cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { factory, state } = writeFailingFactory(newFactory())
    renderApp({ path: '/', factory })
    await screen.findByRole('heading', { name: 'SYSTEM' })
    state.failReads = true

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Quests' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your quests could not be loaded.')
    expect(document.body).not.toHaveTextContent('Raw internal failure')
    state.failReads = false

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitForQuestsPage()
    expect(listedQuests()).toHaveLength(6)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
