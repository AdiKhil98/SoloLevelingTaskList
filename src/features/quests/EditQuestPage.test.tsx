import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { archiveQuest, createQuest } from '@/application'
import { buildFormValues, createSequentialIds, createTestClock, newFactory, noonOn } from '@/application/test-utils/helpers'
import { openDatabase } from '@/persistence'
import { renderApp } from '@/test/renderApp'
import {
  choose,
  fillTitle,
  listedQuests,
  readTemplate,
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

const MONDAY = '2026-10-05'

/** Creates a quest in a fresh database through the application layer (as a previous session would have), then closes it. */
async function seedQuest(factory: IDBFactory, overrides: Parameters<typeof buildFormValues>[0] = {}, archive = false) {
  const database = await openDatabase({ factory })
  const context = { database, clock: createTestClock(noonOn(MONDAY)), ids: createSequentialIds() }
  try {
    const created = await createQuest(context, buildFormValues({ title: 'Existing quest', ...overrides }, MONDAY))
    if (created.status !== 'created') throw new Error('seed failed')
    if (archive) await archiveQuest(context, created.templateId)
    return created.templateId
  } finally {
    database.close()
  }
}

async function openEditForm(path: string, factory: IDBFactory) {
  const view = renderApp({ path, factory })
  await screen.findByRole('heading', { name: 'EDIT QUEST' })
  return view
}

describe('Edit quest form', () => {
  it('loads the existing values', async () => {
    const factory = newFactory()
    const id = await seedQuest(factory, {
      title: 'Backtesting',
      recurrence: 'weekdays',
      weekdays: [1, 3, 5],
      difficulty: 'B',
      category: 'trading',
    })

    await openEditForm(`/quests/${id}/edit`, factory)

    expect(titleField()).toHaveValue('Backtesting')
    expect(screen.getByRole('radio', { name: 'Scheduled' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Selected weekdays' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Tuesday' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Wednesday' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Friday' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'B — Hard' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Trading' })).toBeChecked()
    expect(screen.getByText('+55 EXP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Quest' })).not.toBeInTheDocument()
  })

  it('does not expose seed, id or role for a seeded quest', async () => {
    const factory = newFactory()
    // Start the app once so the six defaults are seeded.
    const first = renderApp({ factory })
    await screen.findByRole('heading', { name: 'SYSTEM' })
    first.unmount()

    const { container } = await openEditForm('/quests/tpl_seed_sleep/edit', factory)

    expect(titleField()).toHaveValue('Sleep before 00:00')
    const names = [...container.querySelectorAll('input')].map((input) => `${input.name}|${input.id}|${input.value}`)
    expect(names.filter((name) => /seed|role|tpl_|sleep(?!\s)/i.test(name.replace('Sleep before 00:00', '')))).toEqual([])
    expect(document.body.textContent).not.toMatch(/tpl_seed|seedKey/)
  })

  it('saves edits, keeps the quest’s identity and returns to the list with a confirmation', async () => {
    const factory = newFactory()
    const id = await seedQuest(factory, { title: 'Before', difficulty: 'C', category: 'discipline' })
    const before = await readTemplate(factory, id)
    await openEditForm(`/quests/${id}/edit`, factory)

    fillTitle('After')
    choose('radio', 'A — Very Hard')
    choose('radio', 'Fitness')
    submit('Save Changes')

    await waitForQuestsPage()
    expect(screen.getByText('Quest updated.')).toBeInTheDocument()
    expect(listedQuests().find((row) => row.textContent?.includes('After'))).toHaveTextContent('Difficulty A · +80 EXP · Fitness')
    expect(listedQuests().filter((row) => row.textContent?.includes('Before'))).toHaveLength(0)
    const templates = await readTemplates(factory)
    expect(templates.filter((template) => template.title === 'After')).toHaveLength(1)
    expect(await readTemplate(factory, id)).toMatchObject({
      id,
      title: 'After',
      difficulty: 'A',
      category: 'fitness',
      createdAt: before?.createdAt,
      seedKey: null,
      role: 'standard',
      revision: 2,
    })
  })

  it('keeps a seeded quest’s id, seed key and role when it is edited', async () => {
    const factory = newFactory()
    const first = renderApp({ factory })
    await screen.findByRole('heading', { name: 'SYSTEM' })
    first.unmount()
    await openEditForm('/quests/tpl_seed_prayer_fajr/edit', factory)

    fillTitle('Fajr (before sunrise)')
    submit('Save Changes')

    await waitForQuestsPage()
    expect(await readTemplate(factory, 'tpl_seed_prayer_fajr')).toMatchObject({
      id: 'tpl_seed_prayer_fajr',
      seedKey: 'prayer.fajr',
      role: 'standard',
      title: 'Fajr (before sunrise)',
    })
    expect(await readTemplates(factory)).toHaveLength(6)
  })

  it('can change the quest type on edit', async () => {
    const factory = newFactory()
    const id = await seedQuest(factory, { title: 'Was daily' })
    await openEditForm(`/quests/${id}/edit`, factory)

    choose('radio', 'One-Time')
    setDate('Quest date', '2026-10-30')
    submit('Save Changes')

    await waitForQuestsPage()
    expect(listedQuests().find((row) => row.textContent?.includes('Was daily'))).toHaveTextContent('One-time · Oct 30, 2026')
  })

  it('validates like the create form and changes nothing when invalid', async () => {
    const factory = newFactory()
    const id = await seedQuest(factory, { title: 'Stays as is' })
    await openEditForm(`/quests/${id}/edit`, factory)

    fillTitle('   ')
    submit('Save Changes')

    expect(await screen.findByRole('alert')).toHaveTextContent('Title: Enter a title.')
    expect((await readTemplate(factory, id))?.title).toBe('Stays as is')
  })

  it('accepts an unchanged start date that is already in the past', async () => {
    const factory = newFactory()
    const id = await seedQuest(factory, { title: 'Old daily' })
    // Reopen the app a few days later: the stored start date (Oct 5) is now in the past.
    renderApp({ path: `/quests/${id}/edit`, factory, clock: createTestClock(noonOn('2026-10-12')) })
    await screen.findByRole('heading', { name: 'EDIT QUEST' })
    expect(screen.getByLabelText('Start date')).toHaveValue(MONDAY)

    fillTitle('Old daily (renamed)')
    submit('Save Changes')

    await waitForQuestsPage()
    expect((await readTemplate(factory, id))?.title).toBe('Old daily (renamed)')
  })

  it('stays on the form with its values and a safe message when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const base = newFactory()
    const id = await seedQuest(base, { title: 'Original' })
    const { factory, state } = writeFailingFactory(base)
    await openEditForm(`/quests/${id}/edit`, factory)
    fillTitle('Edited but not saved')
    state.failWrites = true

    submit('Save Changes')

    expect(await screen.findByRole('alert')).toHaveTextContent('That quest could not be saved. Nothing was changed. Please try again.')
    expect(document.body).not.toHaveTextContent('disk exploded')
    expect(titleField()).toHaveValue('Edited but not saved')
    expect(screen.getByRole('heading', { name: 'EDIT QUEST' })).toBeInTheDocument()
    expect((await readTemplate(base, id))?.title).toBe('Original')
  })
})

describe('Edit quest route safety', () => {
  it('shows a safe not-found state for an unknown id, with no form that could create a quest', async () => {
    const factory = newFactory()

    renderApp({ path: '/quests/tpl_missing/edit', factory })

    expect(await screen.findByRole('heading', { name: 'Quest not found' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Quest|Save Changes/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Quests' })).toHaveAttribute('href', '/quests')
    expect(await readTemplates(factory)).toHaveLength(6) // only the seeds; nothing new
  })

  it('tells the player an archived quest must be restored first', async () => {
    const factory = newFactory()
    const id = await seedQuest(factory, { title: 'Archived one' }, true)

    renderApp({ path: `/quests/${id}/edit`, factory })

    expect(await screen.findByRole('heading', { name: 'Quest archived' })).toBeInTheDocument()
    expect(screen.getByText(/Restore it from the Archived list/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
  })

  it('reloads cleanly when the page is opened directly (refresh)', async () => {
    const factory = newFactory()
    const id = await seedQuest(factory, { title: 'Direct link' })

    const view = await openEditForm(`/quests/${id}/edit`, factory)
    view.unmount()
    await openEditForm(`/quests/${id}/edit`, factory)

    expect(within(document.body).getByRole('textbox', { name: 'Title' })).toHaveValue('Direct link')
  })

  it('reaches the edit form from the list', async () => {
    const factory = newFactory()
    await seedQuest(factory, { title: 'From the list' })
    renderApp({ path: '/quests', factory })
    await waitForQuestsPage()

    fireEvent.click(screen.getByRole('link', { name: 'Edit From the list' }))

    expect(await screen.findByRole('heading', { name: 'EDIT QUEST' })).toBeInTheDocument()
    expect(titleField()).toHaveValue('From the list')
  })
})
