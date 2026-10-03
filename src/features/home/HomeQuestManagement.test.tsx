import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, newFactory, noonOn } from '@/application/test-utils/helpers'
import { renderApp } from '@/test/renderApp'
import { choose, fillTitle, setDate, submit, waitForQuestsPage } from '@/test/questUi'

afterEach(() => {
  vi.restoreAllMocks()
})

const nav = () => screen.getByRole('navigation', { name: 'Primary' })
const goTo = (name: 'Home' | 'Quests' | 'Status') => fireEvent.click(within(nav()).getByRole('link', { name }))
const homeReady = () => screen.findByRole('heading', { name: 'SYSTEM' })
const questList = () => screen.getByRole('list', { name: 'Today’s quests' })
const todayTitles = () =>
  within(questList())
    .getAllByRole('listitem')
    .map((item) => within(item).getByText((_, element) => element?.classList.contains('break-words') === true).textContent)

async function createFromHome(build: () => void) {
  fireEvent.click(screen.getByRole('link', { name: 'Add Quest' }))
  await screen.findByRole('heading', { name: 'NEW QUEST' })
  build()
  submit('Create Quest')
  await waitForQuestsPage()
}

describe('Home — Add Quest action', () => {
  it('is a large, labelled link that opens the create form', async () => {
    renderApp()
    await homeReady()

    const add = screen.getByRole('link', { name: 'Add Quest' })

    expect(add).toHaveAttribute('href', '/quests/new')
    expect(add.className).toMatch(/\bsize-12\b/) // 48 px: comfortably tappable
    fireEvent.click(add)
    expect(await screen.findByRole('heading', { name: 'NEW QUEST' })).toBeInTheDocument()
  })
})

describe('Home — newly created quests', () => {
  it('shows a newly created quest that is eligible today, and counts it in today’s total', async () => {
    renderApp()
    await homeReady()
    expect(screen.getByText('0 / 6')).toBeInTheDocument()

    await createFromHome(() => {
      fillTitle('Backtesting')
      choose('radio', 'B — Hard')
      choose('radio', 'Trading')
    })
    goTo('Home')

    await homeReady()
    expect(todayTitles()).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00', 'Backtesting'])
    expect(screen.getByRole('button', { name: /^Complete Backtesting\b/ })).toHaveTextContent('Difficulty B · Trading')
    expect(screen.getByRole('button', { name: /^Complete Backtesting\b/ })).toHaveTextContent('+55 EXP')
    expect(screen.getByText('0 / 7')).toBeInTheDocument()
  })

  it('does not show a new quest that is not eligible today, and leaves today’s total alone', async () => {
    renderApp() // a Monday
    await homeReady()

    await createFromHome(() => {
      fillTitle('Tuesdays only')
      choose('radio', 'Scheduled')
      choose('checkbox', 'Tuesday')
    })
    goTo('Home')

    await homeReady()
    expect(todayTitles()).not.toContain('Tuesdays only')
    expect(screen.getByText('0 / 6')).toBeInTheDocument()
  })

  it('shows a one-time quest for tomorrow only once tomorrow comes', async () => {
    const factory = newFactory()
    const first = renderApp({ factory })
    await homeReady()
    await createFromHome(() => {
      fillTitle('Tomorrow thing')
      choose('radio', 'One-Time')
      setDate('Quest date', '2026-10-06')
    })
    goTo('Home')
    await homeReady()
    expect(todayTitles()).not.toContain('Tomorrow thing')
    first.unmount()

    renderApp({ factory, clock: createTestClock(noonOn('2026-10-06')) })
    await homeReady()

    expect(todayTitles()).toContain('Tomorrow thing')
    expect(screen.getByText('0 / 7')).toBeInTheDocument()
  })

  it('a new quest can be completed from Home and awards its EXP once', async () => {
    renderApp()
    await homeReady()
    await createFromHome(() => {
      fillTitle('Quick win')
      choose('radio', 'D — Easy')
    })
    goTo('Home')
    await homeReady()

    fireEvent.click(screen.getByRole('button', { name: /^Complete Quick win\b/ }))

    await waitFor(() => expect(screen.getByText('1 / 7')).toBeInTheDocument())
    goTo('Status')
    const sheet = await screen.findByRole('region', { name: 'Player status' })
    expect(within(sheet).getByText('20')).toBeInTheDocument() // lifetime EXP
  })
})

describe('Home — editing never changes today’s frozen quest', () => {
  it('keeps today’s title, difficulty and reward after the template is edited', async () => {
    renderApp()
    await homeReady()
    await createFromHome(() => {
      fillTitle('Original')
      choose('radio', 'D — Easy')
    })
    fireEvent.click(screen.getByRole('link', { name: 'Edit Original' }))
    await screen.findByRole('heading', { name: 'EDIT QUEST' })
    fillTitle('Renamed')
    choose('radio', 'S — Major')
    submit('Save Changes')
    await waitForQuestsPage()
    expect(screen.getByText('Renamed')).toBeInTheDocument() // the template is renamed…

    goTo('Home')

    await homeReady()
    expect(todayTitles()).toContain('Original') // …today's frozen quest is not
    expect(todayTitles()).not.toContain('Renamed')
    expect(screen.getByRole('button', { name: /^Complete Original\b/ })).toHaveTextContent('Difficulty D')
    expect(screen.getByRole('button', { name: /^Complete Original\b/ })).toHaveTextContent('+20 EXP')
  })

  it('uses the edited values on the next day', async () => {
    const factory = newFactory()
    const first = renderApp({ factory })
    await homeReady()
    await createFromHome(() => {
      fillTitle('Original')
      choose('radio', 'D — Easy')
    })
    fireEvent.click(screen.getByRole('link', { name: 'Edit Original' }))
    await screen.findByRole('heading', { name: 'EDIT QUEST' })
    fillTitle('Renamed')
    choose('radio', 'S — Major')
    submit('Save Changes')
    await waitForQuestsPage()
    first.unmount()

    renderApp({ factory, clock: createTestClock(noonOn('2026-10-06')) })
    await homeReady()

    expect(todayTitles()).toContain('Renamed')
    expect(todayTitles()).not.toContain('Original')
    expect(screen.getByRole('button', { name: /^Complete Renamed\b/ })).toHaveTextContent('+120 EXP')
  })

  it('keeps a completed quest completed, and its EXP, after the template is edited', async () => {
    renderApp()
    await homeReady()
    fireEvent.click(screen.getByRole('button', { name: /^Complete Fajr/ }))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())

    goTo('Quests')
    await waitForQuestsPage()
    fireEvent.click(screen.getByRole('link', { name: 'Edit Fajr' }))
    await screen.findByRole('heading', { name: 'EDIT QUEST' })
    choose('radio', 'S — Major')
    submit('Save Changes')
    await waitForQuestsPage()
    goTo('Home')

    await homeReady()
    expect(screen.getByText('1 / 6')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Complete Fajr/ })).not.toBeInTheDocument()
    expect(within(questList()).getByRole('img', { name: 'Completed' })).toBeInTheDocument()
    goTo('Status')
    expect(within(await screen.findByRole('region', { name: 'Player status' })).getByText('10')).toBeInTheDocument()
  })
})

describe('Home — archiving never removes today’s quest', () => {
  async function archive(title: string) {
    goTo('Quests')
    await waitForQuestsPage()
    fireEvent.click(screen.getByRole('button', { name: `Archive ${title}` }))
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Quest' }))
    await screen.findByText('Quest archived.')
  }

  it('keeps an uncompleted archived quest on today’s list, completable and counted', async () => {
    renderApp()
    await homeReady()

    await archive('Fajr')
    goTo('Home')

    await homeReady()
    expect(todayTitles()).toContain('Fajr')
    expect(screen.getByText('0 / 6')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Complete Fajr/ }))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())
    expect(within(questList()).getByRole('img', { name: 'Completed' })).toBeInTheDocument()
  })

  it('keeps a completed archived quest visible as completed, with the total unchanged', async () => {
    renderApp()
    await homeReady()
    fireEvent.click(screen.getByRole('button', { name: /^Complete Fajr/ }))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())

    await archive('Fajr')
    goTo('Home')

    await homeReady()
    expect(todayTitles()).toContain('Fajr')
    expect(screen.getByText('1 / 6')).toBeInTheDocument()
  })

  it('keeps it after a reload, and stops showing it on a later day', async () => {
    const factory = newFactory()
    const first = renderApp({ factory })
    await homeReady()
    await archive('Fajr')
    first.unmount()

    const sameDay = renderApp({ factory })
    await homeReady()
    expect(todayTitles()).toContain('Fajr')
    sameDay.unmount()

    renderApp({ factory, clock: createTestClock(noonOn('2026-10-06')) })
    await homeReady()
    expect(todayTitles()).not.toContain('Fajr')
    expect(screen.getByText('0 / 5')).toBeInTheDocument()
  })

  it('shows the quest again on later days after it is restored', async () => {
    const factory = newFactory()
    const first = renderApp({ factory })
    await homeReady()
    await archive('Fajr')
    fireEvent.click(await screen.findByRole('button', { name: 'Archived (1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore Fajr' }))
    await screen.findByText('Quest restored.')
    first.unmount()

    renderApp({ factory, clock: createTestClock(noonOn('2026-10-06')) })
    await homeReady()

    expect(todayTitles()).toContain('Fajr')
    expect(screen.getByText('0 / 6')).toBeInTheDocument()
  })
})
