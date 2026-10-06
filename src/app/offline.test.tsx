import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, d, newFactory, noonOn } from '@/application/test-utils/helpers'
import { getPlayerProfile, listDailySummaries, listTemplates, listXpTransactions, openDatabase } from '@/persistence'
import { choose, fillTitle, readTemplates, submit, waitForQuestsPage } from '@/test/questUi'
import { renderApp } from '@/test/renderApp'
import { resumeApp } from '@/test/resume'
import { editorReady, fillGoal, readBoards, save } from '@/test/weeklyUi'

/**
 * Phase 12: the whole application works with no network. The service worker only makes the SHELL available offline;
 * everything the player does is local (IndexedDB), so with the network gone and `navigator.onLine` false these are
 * the same flows as online. The network is made to FAIL LOUDLY here: any attempt to use it is a test failure.
 */
const MONDAY = '2026-10-05'
const TUESDAY = '2026-10-06'

let network: { fetch: ReturnType<typeof vi.fn>; xhr: ReturnType<typeof vi.fn>; beacon: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const unavailable = () => {
    throw new Error('The network is unavailable')
  }
  network = { fetch: vi.fn(unavailable), xhr: vi.fn(unavailable), beacon: vi.fn(unavailable) }
  vi.stubGlobal('fetch', network.fetch)
  vi.stubGlobal('XMLHttpRequest', network.xhr)
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: network.beacon })
})

afterEach(() => {
  // The application never reaches for the network, online or offline.
  expect(network.fetch).not.toHaveBeenCalled()
  expect(network.xhr).not.toHaveBeenCalled()
  expect(network.beacon).not.toHaveBeenCalled()
  Reflect.deleteProperty(navigator, 'sendBeacon')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const homeReady = () => screen.findByRole('heading', { name: 'SYSTEM' })
const questButton = (title: string) => screen.getByRole('button', { name: new RegExp(`^Complete ${title}\\b`) })

async function withDatabase<T>(factory: IDBFactory, read: (database: Awaited<ReturnType<typeof openDatabase>>) => Promise<T>): Promise<T> {
  const database = await openDatabase({ factory })
  try {
    return await read(database)
  } finally {
    database.close()
  }
}

describe('an existing player opens the app offline', () => {
  it('goes straight to Home (no Awakening), shows the small OFFLINE marker, and disables nothing', async () => {
    renderApp()
    await homeReady()

    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'CONNECTION ESTABLISHED' })).not.toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: /^Complete / })
    expect(buttons).toHaveLength(6)
    for (const button of buttons) expect(button).toBeEnabled()
    for (const link of screen.getAllByRole('link')) expect(link).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('never shows a frame of Awakening on the way in', async () => {
    const sightings: string[] = []
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('CONNECTION ESTABLISHED')) sightings.push(document.body.textContent)
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    try {
      renderApp()
      await homeReady()
    } finally {
      observer.disconnect()
    }
    expect(sightings).toEqual([])
  })

  it.each([
    ['/status', 'STATUS'],
    ['/achievements', 'ACHIEVEMENTS'],
    ['/status/history', 'DAILY HISTORY'],
    ['/weekly', 'SET THIS WEEK’S GOAL CRUSHERS'],
    ['/weekly/history', 'WEEKLY HISTORY'],
    ['/quests/new', 'NEW QUEST'],
  ])('%s opens and works', async (path, heading) => {
    renderApp({ path })
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
  })

  it('/quests lists the quests', async () => {
    renderApp({ path: '/quests' })
    await waitForQuestsPage()
    expect(screen.getByText('Fajr')).toBeInTheDocument()
  })
})

describe('local actions work, and persist, while offline', () => {
  it('completing a quest saves exactly one EXP row and survives a reload', async () => {
    const factory = newFactory()
    const first = renderApp({ factory })
    await homeReady()

    fireEvent.click(questButton('Fajr'))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())
    first.unmount()

    renderApp({ factory }) // the reload
    await homeReady()
    expect(screen.getByText('1 / 6')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Complete Fajr/ })).not.toBeInTheDocument()
    expect(await withDatabase(factory, listXpTransactions)).toHaveLength(1)
  })

  it('a double tap offline still awards the EXP once', async () => {
    const factory = newFactory()
    renderApp({ factory })
    await homeReady()

    const fajr = questButton('Fajr')
    fireEvent.click(fajr)
    fireEvent.click(fajr)
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())

    expect(await withDatabase(factory, listXpTransactions)).toHaveLength(1)
  })

  it('renaming the player persists across a reload', async () => {
    const factory = newFactory()
    const first = renderApp({ factory, path: '/status' })
    await screen.findByRole('heading', { name: 'STATUS' })
    fireEvent.click(within(screen.getByRole('region', { name: 'IDENTITY' })).getByRole('button', { name: /Edit name/ }))
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(await screen.findByText('Name saved.')).toBeInTheDocument()
    first.unmount()

    renderApp({ factory, path: '/status' })
    await screen.findByRole('heading', { name: 'STATUS' })
    expect(within(screen.getByRole('region', { name: 'IDENTITY' })).getByText('Ada')).toBeInTheDocument()
    expect(await withDatabase(factory, getPlayerProfile)).toMatchObject({ status: 'valid', profile: { name: 'Ada' } })
  })

  it('creating a quest offline saves it', async () => {
    const factory = newFactory()
    renderApp({ factory, path: '/quests/new' })
    await screen.findByRole('heading', { name: 'NEW QUEST' })

    fillTitle('Read a chapter')
    choose('radio', /Daily/)
    submit('Create Quest')

    await waitFor(async () => expect((await readTemplates(factory)).map((template) => template.title)).toContain('Read a chapter'))
  })

  it('editing a quest offline saves the change', async () => {
    const factory = newFactory()
    const started = renderApp({ factory })
    await homeReady() // starting the app seeds the six default quests
    started.unmount()
    const fajr = (await readTemplates(factory)).find((template) => template.title === 'Fajr')
    expect(fajr).toBeDefined()

    renderApp({ factory, path: `/quests/${fajr!.id}/edit` })
    await screen.findByRole('heading', { name: 'EDIT QUEST' })
    fillTitle('Fajr prayer')
    submit('Save Changes')

    await waitForQuestsPage()
    expect(screen.getByText('Quest updated.')).toBeInTheDocument()
    expect((await readTemplates(factory)).map((template) => template.title)).toContain('Fajr prayer')
  })

  it('archiving a quest offline saves it as archived', async () => {
    const factory = newFactory()
    renderApp({ factory, path: '/quests' })
    await waitForQuestsPage()

    fireEvent.click(screen.getByRole('button', { name: 'Archive Fajr' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Quest' }))

    await waitFor(async () => expect((await readTemplates(factory)).find((template) => template.title === 'Fajr')?.status).toBe('archived'))
  })

  it('a Weekly Goal Crusher board can be created offline and is shown on Weekly, also after a reload', async () => {
    const factory = newFactory()
    const first = renderApp({ factory, path: '/weekly/edit' })
    await editorReady('SET WEEKLY GOALS')
    fillGoal(0, { title: 'Read pages', target: '5', points: 10 })

    save()

    await waitFor(async () => expect(await readBoards(factory)).toHaveLength(1))
    first.unmount()
    renderApp({ factory, path: '/weekly' })
    expect(await screen.findByText('Read pages')).toBeInTheDocument()
  })

  it('the day lifecycle still runs: returning after midnight reconciles the missed day', async () => {
    const clock = createTestClock(noonOn(MONDAY))
    const factory = newFactory()
    renderApp({ clock, factory })
    await homeReady()

    clock.set(noonOn(TUESDAY))
    await resumeApp()

    await waitFor(async () => {
      const summaries = await withDatabase(factory, listDailySummaries)
      expect(summaries.map((summary) => summary.dateKey)).toEqual([d(MONDAY)])
    })
  })
})

describe('a brand-new install, once the shell is on the device, still starts with Awakening (offline)', () => {
  it('shows Awakening, not Home, and creates nothing until the identity is saved', async () => {
    const { factory } = renderApp({ awakened: false })

    expect(await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'SYSTEM' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(await withDatabase(factory, getPlayerProfile)).toEqual({ status: 'absent' })
    expect(await withDatabase(factory, listTemplates)).toHaveLength(0)
  })

  it('a reload of the unfinished first launch starts Awakening again and still creates nothing', async () => {
    const factory = newFactory()
    const first = renderApp({ factory, awakened: false })
    await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })
    first.unmount()

    renderApp({ factory, awakened: false })

    expect(await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })).toBeInTheDocument()
    expect(await withDatabase(factory, getPlayerProfile)).toEqual({ status: 'absent' })
  })
})
