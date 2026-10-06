import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { berlinSummerTime, createTestClock, d, newFactory, noonOn } from '@/application/test-utils/helpers'
import { selectDailyMessage } from '@/application'
import { listDailySummaries, listXpTransactions, openDatabase } from '@/persistence'
import { renderApp } from '@/test/renderApp'
import { appIsListeningForResume, resumeApp } from '@/test/resume'

const MONDAY = '2026-10-05'
const TUESDAY = '2026-10-06'
const WEDNESDAY = '2026-10-07'
const THURSDAY = '2026-10-08'

const homeReady = () => screen.findByRole('heading', { name: 'SYSTEM' })
const questList = () => screen.getByRole('list', { name: 'Today’s quests' })
const questButton = (title: string) => screen.getByRole('button', { name: new RegExp(`^Complete ${title}\\b`) })
const streakCard = () => screen.getByRole('region', { name: 'DAILY STREAK' })

async function completeQuests(titles: readonly string[]) {
  for (const title of titles) {
    fireEvent.click(questButton(title))
    await waitFor(() => expect(screen.queryByRole('button', { name: new RegExp(`^Complete ${title}\\b`) })).not.toBeInTheDocument())
  }
}

const FIVE_PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']

async function readSummaries(factory: IDBFactory) {
  const database = await openDatabase({ factory })
  try {
    return await listDailySummaries(database)
  } finally {
    database.close()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Daily Streak on Home', () => {
  it('shows the finalized streak after a day closes, and STREAK SECURED while today is at 70 % or more', async () => {
    const clock = createTestClock(noonOn(MONDAY))
    const first = renderApp({ clock })
    await homeReady()
    await completeQuests(FIVE_PRAYERS) // 5 of 6: Completed (≥70 %)
    expect(streakCard()).toHaveTextContent('0 days') // today is not in the persisted streak
    expect(within(streakCard()).getByText('STREAK SECURED')).toBeInTheDocument()
    first.unmount()

    clock.set(noonOn(TUESDAY))
    renderApp({ clock, factory: first.factory })
    await homeReady()
    expect(streakCard()).toHaveTextContent('1 day')
    expect(screen.queryByText('STREAK SECURED')).not.toBeInTheDocument() // the new day has done nothing yet
  })

  it('shows no flame, glow or celebration: only the number', async () => {
    renderApp()
    await homeReady()
    expect(within(streakCard()).queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('Sleep quest and the Daily Report', () => {
  it('completing Sleep opens the live report, awards its normal EXP and does not finalize the day', async () => {
    const factory = newFactory()
    renderApp({ factory })
    await homeReady()
    await completeQuests(FIVE_PRAYERS)

    fireEvent.click(questButton('Sleep before 00:00'))

    expect(await screen.findByRole('heading', { name: 'DAILY REPORT' })).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
    expect(screen.getByText(/Provisional/)).toHaveTextContent('It becomes final at midnight')
    expect(screen.getByText('Quests completed').nextSibling).toHaveTextContent('6 / 6')
    expect(screen.getByText('Completion').nextSibling).toHaveTextContent('100%')
    expect(screen.getByText('Day status').nextSibling).toHaveTextContent('Perfect')
    expect(screen.getByText('EXP earned today').nextSibling).toHaveTextContent('70') // 5×10 + 20
    expect(screen.getByText('Daily Streak').nextSibling).toHaveTextContent('0 days')
    expect(screen.getByText('If the day closed now').nextSibling).toHaveTextContent('1 day')
    expect(screen.getByText('STREAK SECURED')).toBeInTheDocument()
    expect(screen.queryByText(/finalized/i)).not.toBeInTheDocument()

    expect(await readSummaries(factory)).toEqual([]) // nothing was finalized by Sleep
  })

  it('completing an ordinary quest does not open the report', async () => {
    renderApp()
    await homeReady()
    await completeQuests(['Fajr'])
    expect(screen.queryByRole('heading', { name: 'DAILY REPORT' })).not.toBeInTheDocument()
  })

  it('the report is also reachable from Home and returns to the quests', async () => {
    renderApp()
    await homeReady()
    fireEvent.click(screen.getByRole('link', { name: 'Daily Report' }))
    expect(await screen.findByRole('heading', { name: 'DAILY REPORT' })).toBeInTheDocument()
    expect(screen.getByText('Quests completed').nextSibling).toHaveTextContent('0 / 6')
    expect(screen.getByText('If the day closed now').nextSibling).toHaveTextContent('0 days') // at risk
    expect(screen.queryByText('STREAK SECURED')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Back to quests' }))
    await homeReady()
  })
})

describe('midnight while the app is open', () => {
  it('the midnight timer finalizes the day and shows the new one without any tap', async () => {
    // 0.3 s before local midnight: the timer is armed for just after it.
    const clock = createTestClock(berlinSummerTime(TUESDAY, 0) - 300)
    const factory = newFactory()
    renderApp({ clock, factory })
    await homeReady()
    const mondayMessage = selectDailyMessage(d(MONDAY)).text
    expect(screen.getByRole('region', { name: 'DAILY MESSAGE' })).toHaveTextContent(mondayMessage)
    // The midnight timer is armed from the clock as it is WHEN ARMED, by the same effect pass that attaches the resume
    // listeners. Moving the clock before that pass would arm it for the next midnight (about 12 h away), so wait for it.
    await appIsListeningForResume()

    clock.set(noonOn(TUESDAY)) // the device clock crosses midnight

    await waitFor(
      () => expect(screen.getByRole('region', { name: 'DAILY MESSAGE' })).toHaveTextContent(selectDailyMessage(d(TUESDAY)).text),
      { timeout: 3_000 },
    )
    expect(within(questList()).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('0 / 6')).toBeInTheDocument()

    const summaries = await readSummaries(factory)
    expect(summaries.map((summary) => summary.dateKey)).toEqual([MONDAY])
    expect(summaries[0]).toMatchObject({ finalizedLate: false, quality: 'incomplete' })
    expect(screen.queryByText(/days reconciled/)).not.toBeInTheDocument()
  })

  it('returning to the page after midnight reconciles before anything else (resume)', async () => {
    const clock = createTestClock(noonOn(MONDAY))
    const factory = newFactory()
    renderApp({ clock, factory })
    await homeReady()

    clock.set(noonOn(TUESDAY))
    await resumeApp()

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'DAILY MESSAGE' })).toHaveTextContent(selectDailyMessage(d(TUESDAY)).text),
    )
    const summaries = await readSummaries(factory)
    expect(summaries.map((summary) => summary.dateKey)).toEqual([MONDAY])
    expect(summaries[0]).toMatchObject({ finalizedLate: true }) // resume is catch-up, not the in-app midnight
  })

  it('a same-day resume changes nothing', async () => {
    const clock = createTestClock(noonOn(MONDAY))
    const factory = newFactory()
    renderApp({ clock, factory })
    await homeReady()
    await completeQuests(['Fajr'])

    clock.set(noonOn(MONDAY) + 4 * 3_600_000)
    await resumeApp({ withVisibilityChange: true }) // waits until the app is listening, so "nothing changed" is a real result

    expect(screen.getByText('1 / 6')).toBeInTheDocument()
    expect(await readSummaries(factory)).toEqual([])
  })
})

describe('catch-up after days away (OD-21)', () => {
  async function awayUntil(date: string) {
    const clock = createTestClock(noonOn(MONDAY))
    const first = renderApp({ clock })
    await homeReady()
    first.unmount()
    clock.set(noonOn(date))
    return renderApp({ clock, factory: first.factory })
  }

  it('shows exactly one restrained notice for several days, and it can be dismissed', async () => {
    const second = await awayUntil(THURSDAY)
    await homeReady()

    const notice = await screen.findByText('3 days reconciled.')
    expect(screen.getAllByText(/days reconciled/)).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // no popup, no per-day report
    expect(screen.queryByText(/level up|perfect day/i)).not.toBeInTheDocument()

    fireEvent.click(within(notice.parentElement!).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('3 days reconciled.')).not.toBeInTheDocument()

    const summaries = await readSummaries(second.factory)
    expect(summaries.map((summary) => summary.dateKey)).toEqual([MONDAY, TUESDAY, WEDNESDAY])
    const database = await openDatabase({ factory: second.factory })
    try {
      expect(await listXpTransactions(database)).toEqual([]) // finalization awards nothing
    } finally {
      database.close()
    }
  })

  it('shows no notice for the ordinary single overnight day', async () => {
    await awayUntil(TUESDAY)
    await homeReady()
    expect(screen.queryByText(/days reconciled/)).not.toBeInTheDocument()
  })
})

describe('device clock moving backwards (OD-22)', () => {
  async function historyUntilWednesday() {
    const clock = createTestClock(noonOn(MONDAY))
    const first = renderApp({ clock })
    await homeReady()
    first.unmount()
    clock.set(noonOn(WEDNESDAY))
    const second = renderApp({ clock, factory: first.factory })
    await homeReady()
    return { clock, factory: second.factory, view: second }
  }

  it('pauses changes, shows a notice and leaves all history untouched', async () => {
    const { clock, factory, view } = await historyUntilWednesday()
    const before = await readSummaries(factory)
    view.unmount()

    clock.set(noonOn(MONDAY)) // the device date moves back past two finalized days
    renderApp({ clock, factory })
    await homeReady()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Clock appears to have moved backwards')
    expect(alert).toHaveTextContent(`last recorded day is ${WEDNESDAY}`)
    expect(screen.queryByRole('list', { name: 'Today’s quests' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add Quest' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Complete / })).not.toBeInTheDocument()
    expect(await readSummaries(factory)).toEqual(before)
  })

  it('returns to normal use by itself once the clock catches up', async () => {
    const { clock, factory, view } = await historyUntilWednesday()
    view.unmount()
    clock.set(noonOn(MONDAY))
    renderApp({ clock, factory })
    await screen.findByRole('alert')

    clock.set(noonOn(WEDNESDAY))
    await resumeApp()

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(within(questList()).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getAllByRole('button', { name: /^Complete / })).toHaveLength(6)
  })

  it('still shows the player status while paused', async () => {
    const { clock, factory, view } = await historyUntilWednesday()
    view.unmount()
    clock.set(noonOn(MONDAY))
    renderApp({ clock, factory, path: '/status' })
    expect(await screen.findByRole('heading', { name: 'STATUS' })).toBeInTheDocument()
    expect(screen.getByText('Total Perfect Days')).toBeInTheDocument()
  })
})

describe('Status streaks', () => {
  it('shows the finalized Best Streak, Perfect Day Streak and total Perfect Days', async () => {
    const clock = createTestClock(noonOn(MONDAY))
    const first = renderApp({ clock })
    await homeReady()
    await completeQuests([...FIVE_PRAYERS, 'Sleep before 00:00']) // opens the report on the last one
    first.unmount()
    clock.set(noonOn(TUESDAY))
    renderApp({ clock, factory: first.factory, path: '/status' })

    expect(await screen.findByRole('heading', { name: 'STATUS' })).toBeInTheDocument()
    const streaks = screen.getByRole('region', { name: 'Streaks' })
    expect(within(streaks).getByText('Daily Streak').nextSibling).toHaveTextContent('1 day')
    expect(within(streaks).getByText('Best Streak').nextSibling).toHaveTextContent('1 day')
    expect(within(streaks).getByText('Perfect Day Streak').nextSibling).toHaveTextContent('1 day')
    expect(within(streaks).getByText('Total Perfect Days').nextSibling).toHaveTextContent('1')
  })
})
