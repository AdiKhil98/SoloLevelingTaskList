import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTemplate,
  createTestClock,
  d,
  newFactory,
  noonOn,
} from '@/application/test-utils/helpers'
import { selectDailyMessage } from '@/application'
import { createTemplate, openDatabase } from '@/persistence'
import { renderApp } from '@/test/renderApp'

const TODAY = '2026-10-05'

async function homeReady() {
  await screen.findByRole('heading', { name: 'SYSTEM' })
}

const questList = () => screen.getByRole('list', { name: 'Today’s quests' })
const questButton = (title: string) => screen.getByRole('button', { name: new RegExp(`^Complete ${title}\\b`) })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Home — loading and loaded', () => {
  it('shows a loading state first and never a placeholder of zeros', async () => {
    renderApp()

    expect(screen.getByText('SYSTEM INITIALIZING...')).toBeInTheDocument()
    expect(screen.queryByText(/LV\./)).not.toBeInTheDocument()
    expect(screen.queryByText(/EXP/)).not.toBeInTheDocument()

    await homeReady()
    expect(screen.queryByText('SYSTEM INITIALIZING...')).not.toBeInTheDocument()
  })

  it('renders the six seeded quests in their natural order with difficulty, category and EXP', async () => {
    renderApp()
    await homeReady()

    const items = within(questList()).getAllByRole('listitem')
    expect(items.map((item) => within(item).getByText(/^(Fajr|Dhuhr|Asr|Maghrib|Isha|Sleep before 00:00)$/).textContent)).toEqual([
      'Fajr',
      'Dhuhr',
      'Asr',
      'Maghrib',
      'Isha',
      'Sleep before 00:00',
    ])
    expect(within(items[0]!).getByText('+10 EXP')).toBeInTheDocument()
    expect(within(items[0]!).getByText('Difficulty E · Discipline')).toBeInTheDocument()
    expect(within(items[5]!).getByText('+20 EXP')).toBeInTheDocument()
    expect(within(items[5]!).getByText('Difficulty D · Discipline')).toBeInTheDocument()
  })

  it('shows the generic player label, level and rank', async () => {
    renderApp()
    await homeReady()

    const player = screen.getByRole('region', { name: 'PLAYER' })
    expect(within(player).getByText('LV. 1')).toBeInTheDocument()
    expect(within(player).getByText('E-RANK')).toBeInTheDocument()
  })

  it('shows current-level EXP progress with progress semantics', async () => {
    renderApp()
    await homeReady()

    const bar = screen.getByRole('progressbar', { name: /EXP progress/ })
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-valuetext', '0 of 100 EXP')
    expect(screen.getByText('0 / 100')).toBeInTheDocument()
  })

  it('shows the deterministic Daily Message for today’s date', async () => {
    renderApp()
    await homeReady()

    const message = screen.getByRole('region', { name: 'DAILY MESSAGE' })
    expect(message).toHaveTextContent(selectDailyMessage(d(TODAY)).text)
  })

  it('shows today’s completion count, floored percentage and status', async () => {
    renderApp()
    await homeReady()

    const today = screen.getByRole('region', { name: 'TODAY' })
    expect(within(today).getByText('0 / 6')).toBeInTheDocument()
    expect(within(today).getByText('0%')).toBeInTheDocument()
    expect(within(today).getByText('Incomplete')).toBeInTheDocument()
  })

  it('shows the real Daily Streak: 0 days before any day has been finalized', async () => {
    renderApp()
    await homeReady()

    const streak = screen.getByRole('region', { name: 'DAILY STREAK' })
    expect(streak).toHaveTextContent('0 days')
    expect(screen.queryByText('STREAK SECURED')).not.toBeInTheDocument()
  })

  it('works under React StrictMode without duplicating anything', async () => {
    renderApp({ strictMode: true })
    await homeReady()

    expect(within(questList()).getAllByRole('listitem')).toHaveLength(6)
  })
})

describe('Home — completing quests', () => {
  it('completes a quest and updates the quest, daily progress and EXP from stored state', async () => {
    renderApp()
    await homeReady()

    fireEvent.click(questButton('Fajr'))

    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())
    const today = screen.getByRole('region', { name: 'TODAY' })
    expect(within(today).getByText('16%')).toBeInTheDocument()
    expect(within(today).getByText('Incomplete')).toBeInTheDocument()
    expect(screen.getByText('10 / 100')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /EXP progress/ })).toHaveAttribute('aria-valuenow', '10')
    expect(screen.getAllByRole('img', { name: 'Completed' })).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Fajr completed. +10 EXP.')
  })

  it('does not let a completed quest be completed again', async () => {
    renderApp()
    await homeReady()
    fireEvent.click(questButton('Fajr'))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /Fajr/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Complete / })).toHaveLength(5)
  })

  it('awards EXP once for a rapid double tap', async () => {
    renderApp()
    await homeReady()
    const button = questButton('Fajr')

    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())
    expect(screen.getByText('10 / 100')).toBeInTheDocument()
  })

  it('shows the Sleep quest like the others and awards its 20 EXP', async () => {
    renderApp()
    await homeReady()

    fireEvent.click(questButton('Sleep before 00:00'))

    await waitFor(() => expect(screen.getByText('20 / 100')).toBeInTheDocument())
    expect(screen.getByText('1 / 6')).toBeInTheDocument()
  })

  it('keeps completion and EXP after a restart', async () => {
    const factory = newFactory()
    const clock = createTestClock(noonOn(TODAY))
    const first = renderApp({ factory, clock })
    await homeReady()
    fireEvent.click(questButton('Asr'))
    await waitFor(() => expect(screen.getByText('10 / 100')).toBeInTheDocument())
    first.unmount()

    renderApp({ factory, clock })
    await homeReady()

    expect(screen.getByText('10 / 100')).toBeInTheDocument()
    expect(screen.getByText('1 / 6')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Asr/ })).not.toBeInTheDocument()
    expect(within(questList()).getAllByRole('listitem')).toHaveLength(6)
  })

  it('reports a level up and shows the new level from stored state', async () => {
    const factory = newFactory()
    const database = await openDatabase({ factory })
    await createTemplate(
      database,
      buildTemplate({ id: 'tpl_big', title: 'Big quest', difficulty: 'S', createdAt: 9, activeFrom: d(TODAY) }),
    )
    database.close()
    renderApp({ factory })
    await homeReady()

    fireEvent.click(questButton('Big quest'))

    await waitFor(() => expect(screen.getByText('LV. 2')).toBeInTheDocument())
    expect(screen.getByText('20 / 135')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Big quest completed. +120 EXP. LEVEL UP — LV. 2.')
  })

  it('a tap on a stale screen after midnight reconciles first, shows the new day and completes nothing', async () => {
    const clock = createTestClock(noonOn(TODAY))
    renderApp({ clock })
    await homeReady()
    clock.set(noonOn('2026-10-06')) // midnight passed while the screen stayed open

    fireEvent.click(questButton('Fajr'))

    // Lifecycle first: the new day, its message and its quests are loaded…
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'DAILY MESSAGE' })).toHaveTextContent(
        selectDailyMessage(d('2026-10-06')).text,
      ),
    )
    // …and the stale tap is refused with a safe message instead of writing into yesterday.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('That day has ended')
    expect(screen.getByText('0 / 6')).toBeInTheDocument()
    expect(screen.getByText('0 / 100')).toBeInTheDocument() // no EXP awarded
    expect(screen.queryByRole('img', { name: 'Completed' })).not.toBeInTheDocument()
    expect(within(questList()).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getAllByRole('button', { name: /^Complete / })).toHaveLength(6)
  })
})

describe('Home — empty day', () => {
  it('shows a calm No Active Quests state', async () => {
    // All six seeds already exist but start in the future, so nothing is eligible today.
    const factory = newFactory()
    const database = await openDatabase({ factory })
    for (const [index, key] of ['prayer.fajr', 'prayer.dhuhr', 'prayer.asr', 'prayer.maghrib', 'prayer.isha', 'sleep'].entries()) {
      await createTemplate(
        database,
        buildTemplate({ id: `tpl_${index}`, title: key, seedKey: key, activeFrom: d('2026-12-01') }),
      )
    }
    database.close()

    renderApp({ factory })
    await homeReady()

    const today = screen.getByRole('region', { name: 'TODAY' })
    expect(within(today).getByText('No Active Quests')).toBeInTheDocument()
    expect(screen.getByText('Nothing is scheduled for today.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Today’s quests' })).not.toBeInTheDocument()
  })
})
