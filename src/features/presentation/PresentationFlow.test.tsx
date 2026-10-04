import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeTodayQuest, loadHome, startApplication } from '@/application'
import { buildTemplate, createSequentialIds, createTestClock, d, newFactory, noonOn } from '@/application/test-utils/helpers'
import { createTemplate, listXpTransactions, openDatabase } from '@/persistence'
import { TEST_TIMINGS } from '@/test/presentationTimings'
import { renderApp } from '@/test/renderApp'
import { plantBoard, scoringDefinition } from '@/test/weeklyUi'

/** The earned-event presentation, end to end through the real app (runtime, application services, fake IndexedDB). */

const MONDAY = '2026-10-05'
const SUNDAY = '2026-10-11'
const NEXT_MONDAY = '2026-10-12'

afterEach(() => {
  vi.restoreAllMocks()
})

const homeReady = () => screen.findByRole('heading', { name: 'SYSTEM' })
const button = (title: string) => screen.getByRole('button', { name: new RegExp(`^Complete ${title}\\b`) })
const hud = () => screen.getByRole('region', { name: 'PLAYER' })
const popupWith = (text: string | RegExp) => screen.findByText(text, { selector: '[role=status] *' })
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Short-lived popups, so a queue of several drains quickly. */
const QUICK = { timings: { ...TEST_TIMINGS, visibleMs: () => 80 } }

async function plantBigQuest(factory: IDBFactory) {
  const database = await openDatabase({ factory })
  await createTemplate(database, buildTemplate({ id: 'tpl_big', title: 'Big quest', difficulty: 'S', createdAt: 9, activeFrom: d(MONDAY) }))
  database.close()
}

/** Plays `date` on a fresh database through the application (all six quests by default) WITHOUT letting the next day be reconciled. */
async function playDay(factory: IDBFactory, count = 6, date = MONDAY) {
  const database = await openDatabase({ factory })
  const context = { database, clock: createTestClock(noonOn(date)), ids: createSequentialIds() }
  try {
    await startApplication(context)
    for (const quest of (await loadHome(context)).today.quests.slice(0, count)) {
      const result = await completeTodayQuest(context, quest.occurrenceId)
      if (result.status !== 'completed') throw new Error(`completion was ${result.status}`)
    }
  } finally {
    database.close()
  }
}

describe('completing a quest', () => {
  it('pulses the completed row with +EXP, keeps the text status line, and announces nothing twice', async () => {
    renderApp()
    await homeReady()
    fireEvent.click(button('Fajr'))

    const completed = await screen.findByRole('img', { name: 'Completed' })
    await waitFor(() => expect(completed.closest('div')?.className).toContain('system-fx-complete'))
    expect(screen.getByText('+10 EXP', { selector: '.system-fx-chip' })).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Fajr completed. +10 EXP.')).toHaveAttribute('role', 'status') // the screen-reader channel is unchanged
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // no full-screen popup for an ordinary quest
  })

  it('a rapid double tap awards and presents once: one feedback, one EXP row', async () => {
    const { factory } = renderApp()
    await homeReady()
    const fajr = button('Fajr')
    fireEvent.click(fajr)
    fireEvent.click(fajr)

    await waitFor(() => expect(screen.getByText('10 / 100')).toBeInTheDocument())
    await wait(60)
    expect(document.querySelectorAll('.system-fx-chip')).toHaveLength(1)
    const database = await openDatabase({ factory })
    try {
      expect(await listXpTransactions(database)).toHaveLength(1)
    } finally {
      database.close()
    }
  })

  it('the first quest unlocks First Quest: a medium popup that awards nothing', async () => {
    renderApp()
    await homeReady()
    fireEvent.click(button('Fajr'))
    expect(await popupWith('ACHIEVEMENT UNLOCKED')).toBeInTheDocument()
    expect(await popupWith('FIRST QUEST')).toBeInTheDocument()
    expect(screen.getByText('10 / 100')).toBeInTheDocument() // EXP is the quest's alone
  })

  it('a second quest does not announce First Quest again', async () => {
    renderApp({ presentation: QUICK })
    await homeReady()
    fireEvent.click(button('Fajr'))
    await popupWith('FIRST QUEST')
    await waitFor(() => expect(screen.queryByText('FIRST QUEST')).not.toBeInTheDocument())

    fireEvent.click(button('Dhuhr'))
    await waitFor(() => expect(screen.getByText('20 / 100')).toBeInTheDocument())
    await wait(120)
    expect(screen.queryByText('FIRST QUEST')).not.toBeInTheDocument()
    expect(screen.queryByText('ACHIEVEMENT UNLOCKED')).not.toBeInTheDocument()
  })

  it('does not replay any celebration after a reload', async () => {
    const factory = newFactory()
    const clock = createTestClock(noonOn(MONDAY))
    const first = renderApp({ factory, clock })
    await homeReady()
    fireEvent.click(button('Fajr'))
    await popupWith('FIRST QUEST')
    first.unmount()

    renderApp({ factory, clock })
    await homeReady()
    await wait(120)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('ACHIEVEMENT UNLOCKED')).not.toBeInTheDocument()
    expect(document.querySelector('.system-fx-complete')).toBeNull() // a completed row that is merely shown never animates
    expect(document.querySelector('.system-fx-chip')).toBeNull()
  })
})

describe('Level Up through the real app', () => {
  it('holds the old level, reveals LV. 1 → LV. 2 in a dialog, then shows the new level; the achievement waits until it is closed', async () => {
    const factory = newFactory()
    await plantBigQuest(factory)
    renderApp({ factory, presentation: { timings: { ...TEST_TIMINGS, startDelayMs: { ...TEST_TIMINGS.startDelayMs!, progression: 120 } } } })
    await homeReady()
    fireEvent.click(button('Big quest'))

    // The HUD keeps LV. 1 until the reveal (the bar is full), then the dialog opens over the new level.
    await waitFor(() => expect(within(hud()).getByText('LV. 1')).toBeInTheDocument())
    const dialog = await screen.findByRole('dialog', { name: 'LEVEL UP' })
    expect(dialog).toHaveAccessibleDescription(/LV\. 1 to LV\. 2\. \+120 EXP/)
    await waitFor(() => expect(within(hud()).getByText('LV. 2')).toBeInTheDocument()) // released as the overlay opened
    expect(screen.getByText('20 / 135')).toBeInTheDocument()
    expect(screen.queryByText('ACHIEVEMENT UNLOCKED')).not.toBeInTheDocument() // no spoiler while the reveal is on screen

    fireEvent.click(dialog)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await popupWith('ACHIEVEMENT UNLOCKED')).toBeInTheDocument()
    expect(within(hud()).getByText('LV. 2')).toBeInTheDocument()
  })

  it('REDUCED shows the same information with no motion', async () => {
    window.localStorage.setItem('sltl.effects-settings.v1', JSON.stringify({ effects: 'reduced', haptics: false, sound: false }))
    const factory = newFactory()
    await plantBigQuest(factory)
    renderApp({ factory })
    await homeReady()
    fireEvent.click(button('Big quest'))
    const dialog = await screen.findByRole('dialog', { name: 'LEVEL UP' })
    expect(dialog).toHaveAttribute('data-fx', 'reduced')
    expect(dialog.querySelector('canvas')).toBeNull()
    expect(dialog).toHaveAccessibleDescription(/LV\. 1 to LV\. 2/)
  })
})

describe('the live Perfect Day', () => {
  it('shows ALL DAILY QUESTS COMPLETE when the last quest is done, even though Sleep also opens the Daily Report', async () => {
    renderApp({ presentation: QUICK })
    await homeReady()
    for (const name of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      fireEvent.click(button(name))
      await waitFor(() => expect(screen.queryByRole('button', { name: new RegExp(`^Complete ${name}\\b`) })).not.toBeInTheDocument())
    }
    fireEvent.click(button('Sleep before 00:00'))

    expect(await screen.findByRole('heading', { name: 'DAILY REPORT' })).toBeInTheDocument() // navigation happened…
    expect(await popupWith('ALL DAILY QUESTS COMPLETE')).toBeInTheDocument() // …and the moment survived it
    expect(screen.getByRole('heading', { name: 'DAILY REPORT' })).toBeInTheDocument()
  })

  it('does not appear for a day that is not complete', async () => {
    renderApp({ presentation: QUICK })
    await homeReady()
    fireEvent.click(button('Fajr'))
    await wait(150)
    expect(screen.queryByText('ALL DAILY QUESTS COMPLETE')).not.toBeInTheDocument()
  })
})

describe('reconciliation', () => {
  it('one overnight day: the achievements of the finalized day are presented the next morning', async () => {
    const factory = newFactory()
    await playDay(factory)
    renderApp({ factory, clock: createTestClock(noonOn('2026-10-06')) })
    await homeReady()
    expect(await popupWith('ACHIEVEMENTS UNLOCKED')).toBeInTheDocument()
    expect(await popupWith('FIRST PERFECT DAY')).toBeInTheDocument()
  })

  it('a multi-day catch-up stays silent: only the restrained notice, nothing celebrated', async () => {
    const factory = newFactory()
    await playDay(factory)
    renderApp({ factory, clock: createTestClock(noonOn('2026-10-09')) }) // Monday's day was played; four days are finalized at once
    await homeReady()
    expect(await screen.findByText(/4 days reconciled\./)).toBeInTheDocument()
    await wait(150)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('ACHIEVEMENT UNLOCKED')).not.toBeInTheDocument()
    expect(screen.queryByText('ACHIEVEMENTS UNLOCKED')).not.toBeInTheDocument()
    expect(screen.queryByText('FIRST PERFECT DAY')).not.toBeInTheDocument()
  })

  async function weekEndingOn(score: number, lastOpenDay: string) {
    const factory = newFactory()
    const database = await openDatabase({ factory })
    const context = { database, clock: createTestClock(noonOn(lastOpenDay)), ids: createSequentialIds() }
    await startApplication(context) // the app was last open on `lastOpenDay`
    database.close()
    await plantBoard(factory, scoringDefinition(score))
    return factory
  }

  it('a weekly board finalized by a strict overnight reconciliation is presented as the Goal Crusher result', async () => {
    const factory = await weekEndingOn(8, SUNDAY)
    renderApp({ factory, clock: createTestClock(noonOn(NEXT_MONDAY)) })
    await homeReady()
    const dialog = await screen.findByRole('dialog', { name: 'STRONG WEEK' })
    expect(dialog).toHaveAccessibleDescription(/SCORE 8 \/ 10\. \+225 EXP\. REWARD TIER 8\+ UNLOCKED/)
    expect(within(dialog).getByRole('link', { name: 'CLAIM IN WEEKLY' })).toHaveAttribute('href', '/weekly')

    // The 225 EXP bonus also crosses level 2: the HUD holds LV. 1 while the result is shown, the level is revealed next.
    expect(within(hud()).getByText('LV. 1')).toBeInTheDocument()
    fireEvent.click(dialog)
    const level = await screen.findByRole('dialog', { name: 'LEVEL UP' })
    expect(level).toHaveAccessibleDescription(/LV\. 1 to LV\. 2\. \+225 EXP/)
    await waitFor(() => expect(within(hud()).getByText('LV. 2')).toBeInTheDocument())
  })

  it('the same result after several days away is NOT replayed: the EXP is paid, the notice says so, no overlay', async () => {
    const factory = await weekEndingOn(8, '2026-10-07') // last open on Wednesday
    renderApp({ factory, clock: createTestClock(noonOn(NEXT_MONDAY)) })
    await homeReady()
    expect(await screen.findByText(/1 weekly board finalized \(\+225 EXP\)\./)).toBeInTheDocument()
    await wait(150)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('STRONG WEEK')).not.toBeInTheDocument()
  })
})
