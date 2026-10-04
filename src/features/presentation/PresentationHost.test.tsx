import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { asDateKey, asWeekKey } from '@/domain'
import { achievementUnlocked, awardBetweenLevels, awardEvents, weeklyFinalized } from '@/test/events'
import { renderHost } from '@/test/presentationUi'

afterEach(() => {
  vi.restoreAllMocks()
})

const dialog = (name: string | RegExp) => screen.findByRole('dialog', { name })
const noDialog = () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

describe('Level Up', () => {
  it('shows one level as LV. a → LV. b in a named, described dialog, and a tap closes it', async () => {
    const host = renderHost()
    host.present(awardBetweenLevels(14, 15))
    const overlay = await dialog('LEVEL UP')
    expect(overlay).toHaveAttribute('aria-modal', 'true')
    expect(overlay).toHaveAccessibleDescription(/LV\. 14 to LV\. 15/)
    expect(within(overlay).getByText('LV. 14')).toBeInTheDocument()
    expect(within(overlay).getByText('LV. 15')).toBeInTheDocument()
    expect(within(overlay).getByText(/^\+\d[\d,]* EXP$/)).toBeInTheDocument()

    fireEvent.click(overlay)
    await waitFor(noDialog)
  })

  it('shows several levels from one award as ONE overlay: LV. 11 → LV. 14 with the count, never one per level', async () => {
    const host = renderHost()
    host.present(awardBetweenLevels(11, 14, 3))
    const overlay = await dialog('LEVEL UP')
    expect(overlay).toHaveAccessibleDescription(/LV\. 11 to LV\. 14\. \+3 LEVELS/)
    expect(within(overlay).getByText('+3 LEVELS')).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(overlay)
    await waitFor(noDialog) // and no second overlay for the other crossed levels
    await new Promise((resolve) => setTimeout(resolve, 30))
    noDialog()
  })

  it('LV. 9 → LV. 12 plays the level phase, then the D-rank transition in the same overlay, then closes', async () => {
    const host = renderHost()
    host.present(awardBetweenLevels(9, 12, 1))
    const overlay = await dialog('LEVEL UP')
    expect(overlay).toHaveAccessibleDescription(/LV\. 9 to LV\. 12.*RANK ADVANCEMENT\. E-RANK to D-RANK/)
    expect(within(overlay).getByText('LV. 12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'TAP TO CONTINUE' })).toBeInTheDocument()

    fireEvent.click(overlay)
    const rank = await dialog('RANK ADVANCEMENT')
    expect(within(rank).getByText('E-RANK')).toBeInTheDocument()
    expect(within(rank).getByText('D-RANK')).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1) // the same overlay moved on; it did not stack a second one

    fireEvent.click(rank)
    await waitFor(noDialog)
  })

  it('the Level 100 milestone shows the new rank as ??? and invents no name', async () => {
    const host = renderHost()
    host.present(awardBetweenLevels(99, 100))
    fireEvent.click(await dialog('LEVEL UP'))
    const rank = await dialog('RANK ADVANCEMENT')
    expect(within(rank).getByText('S-RANK')).toBeInTheDocument()
    expect(within(rank).getByText('???')).toBeInTheDocument()
    expect(rank).toHaveTextContent('RANK UNKNOWN.')
    expect(rank.textContent).not.toMatch(/special|100\+/i)
  })

  it('Level 101 is an ordinary Level Up: no rank phase, the rank stays ???', async () => {
    const host = renderHost()
    host.present(awardBetweenLevels(100, 101))
    const overlay = await dialog('LEVEL UP')
    expect(screen.getByRole('button', { name: 'TAP TO CLOSE' })).toBeInTheDocument()
    fireEvent.click(overlay)
    await waitFor(noDialog)
  })
})

describe('dialog behaviour', () => {
  it('moves focus into the dialog, makes the page behind it inert, and restores both on close (Escape works)', async () => {
    const host = renderHost()
    const behind = screen.getByRole('button', { name: 'Behind the overlay' })
    behind.focus()
    host.present(awardBetweenLevels(14, 15))
    const overlay = await dialog('LEVEL UP')

    expect(within(overlay).getByRole('button', { name: 'TAP TO CLOSE' })).toHaveFocus()
    expect(host.container).toHaveAttribute('inert')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(noDialog)
    expect(host.container).not.toHaveAttribute('inert')
    expect(behind).toHaveFocus()
  })

  it('ignores taps and Escape during the input guard, so the tap that caused it cannot dismiss it', async () => {
    const host = renderHost({ timings: { inputGuardMs: 60_000 } })
    host.present(awardBetweenLevels(14, 15))
    const overlay = await dialog('LEVEL UP')
    fireEvent.click(overlay)
    fireEvent.keyDown(document, { key: 'Escape' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.getByRole('dialog', { name: 'LEVEL UP' })).toBeInTheDocument()
  })

  it('closes itself after its time, so the player is never trapped', async () => {
    const host = renderHost({ timings: { visibleMs: () => 60 } })
    host.present(awardBetweenLevels(14, 15))
    await dialog('LEVEL UP')
    await waitFor(noDialog)
  })

  it('does not time out while the page is hidden, and does not start anything until it is visible again', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const host = renderHost({ timings: { visibleMs: () => 60 } })
    host.present(awardBetweenLevels(14, 15))
    await new Promise((resolve) => setTimeout(resolve, 80))
    noDialog() // nothing starts while hidden

    visibility.mockReturnValue('visible')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    await dialog('LEVEL UP')
    await waitFor(noDialog) // and then runs its (visible) time
  })

  it('a reconciliation overlay waits while a form is open and shows when the player leaves it', async () => {
    const host = renderHost({ path: '/quests/new' })
    host.present([weeklyFinalized(8, 225)], 'lifecycle')
    await new Promise((resolve) => setTimeout(resolve, 60))
    noDialog()

    await act(async () => {
      await host.router.navigate('/quests')
    })
    await dialog('STRONG WEEK')
  })

  it('an action overlay is not held back by a form route (the player just caused it)', async () => {
    const host = renderHost({ path: '/quests/new' })
    host.present(awardBetweenLevels(14, 15), 'action')
    await dialog('LEVEL UP')
  })
})

describe('the queue in the host', () => {
  it('reveals Level Up BEFORE the achievements it unlocked, then shows the achievement popup', async () => {
    const host = renderHost()
    host.present([...awardBetweenLevels(9, 10), achievementUnlocked('rank_d', 'Reach D Rank')])
    const overlay = await dialog('LEVEL UP')
    expect(screen.queryByRole('status')).not.toBeInTheDocument() // an achievement cannot spoil the reveal
    fireEvent.click(overlay)
    fireEvent.click(await dialog('RANK ADVANCEMENT'))
    await waitFor(noDialog)

    const popup = await screen.findByRole('status')
    expect(popup).toHaveTextContent('ACHIEVEMENT UNLOCKED')
    expect(popup).toHaveTextContent('REACH D RANK')
  })

  it('shows a weekly result first and the level its bonus caused after it, one overlay at a time', async () => {
    const host = renderHost()
    host.present([weeklyFinalized(10, 500), ...awardBetweenLevels(9, 10, 300)], 'lifecycle')
    const result = await dialog('PERFECT WEEK')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(result)
    await dialog('LEVEL UP')
  })

  it('the same moment delivered twice is shown once, and is not replayed after it was shown', async () => {
    const host = renderHost()
    const events = awardEvents(0, 5_000, 'same-tx') // one award, one transaction
    host.present(events)
    host.present(events) // a double emission (a repeated callback, a StrictMode replay)
    fireEvent.click(await dialog('LEVEL UP'))
    await waitFor(noDialog)

    host.present(events) // later, after it was shown: still nothing
    await new Promise((resolve) => setTimeout(resolve, 40))
    noDialog()

    host.present(awardEvents(0, 9_000, 'another-tx')) // a different award is a different moment
    await dialog('LEVEL UP')
  })

  it('never shows a stale overlay after the app is reloaded: a fresh queue starts empty', async () => {
    const first = renderHost()
    first.present(awardBetweenLevels(14, 15))
    await dialog('LEVEL UP')
    first.unmount()
    renderHost() // a reload: the queue lives in memory only
    await new Promise((resolve) => setTimeout(resolve, 40))
    noDialog()
  })
})

describe('SYSTEM popups', () => {
  it('a live Perfect Day says ALL DAILY QUESTS COMPLETE and never claims a finalized day; the close button dismisses it', async () => {
    const host = renderHost()
    host.present([{ type: 'PerfectDayReached', dateKey: asDateKey('2026-10-05'), completedCount: 6, eligibleCount: 6 }])
    const popup = await screen.findByRole('status')
    expect(popup).toHaveTextContent('PERFECT DAY')
    expect(popup).toHaveTextContent('ALL DAILY QUESTS COMPLETE')
    expect(popup).not.toHaveTextContent(/finalized|streak/i)
    fireEvent.click(within(popup).getByRole('button', { name: 'Dismiss notification' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('several achievements from one action are ONE popup, in order', async () => {
    const host = renderHost()
    host.present([achievementUnlocked('a', 'First Quest'), achievementUnlocked('b', '10 Quests')])
    const popup = await screen.findByRole('status')
    expect(popup).toHaveTextContent('ACHIEVEMENTS UNLOCKED')
    expect(popup.textContent?.indexOf('FIRST QUEST')).toBeLessThan(popup.textContent?.indexOf('10 QUESTS') ?? -1)
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('a single achievement shows its title and what it asked for', async () => {
    const host = renderHost()
    host.present([achievementUnlocked('seven', '7 Day Streak')])
    const popup = await screen.findByRole('status')
    expect(popup).toHaveTextContent('ACHIEVEMENT UNLOCKED')
    expect(popup).toHaveTextContent('7 DAY STREAK')
    expect(popup).toHaveTextContent('7 Day Streak description')
  })

  it('all ten weekly goals while the week is open is a notice, not a result', async () => {
    const host = renderHost()
    host.present([{ type: 'WeeklyGoalCompleted', weekKey: asWeekKey('2026-10-05'), goalId: 'g', earnedPoints: 4, scoreNow: 10 }])
    const popup = await screen.findByRole('status')
    expect(popup).toHaveTextContent('ALL GOALS COMPLETE')
    expect(popup).toHaveTextContent('THE RESULT IS FINAL AFTER SUNDAY')
    expect(popup).not.toHaveTextContent('PERFECT WEEK')
  })

  it('a weekly goal reached while open is a small visual toast, not a dialog or popup', async () => {
    const host = renderHost()
    host.present([{ type: 'WeeklyGoalCompleted', weekKey: asWeekKey('2026-10-05'), goalId: 'g', earnedPoints: 2, scoreNow: 3 }])
    const toast = await screen.findByText('GOAL COMPLETE · SCORE 3 / 10')
    expect(toast.parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows one popup at a time and queues the rest', async () => {
    const host = renderHost()
    host.present([{ type: 'PerfectDayReached', dateKey: asDateKey('2026-10-05'), completedCount: 2, eligibleCount: 2 }, achievementUnlocked('x', 'X ACH')])
    const first = await screen.findByRole('status')
    expect(first).toHaveTextContent('PERFECT DAY')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    fireEvent.click(within(first).getByRole('button', { name: 'Dismiss notification' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ACHIEVEMENT UNLOCKED'))
  })
})

describe('Weekly Goal Crusher result (OD-20)', () => {
  it('0–5 is a restrained popup with the score and no bonus, not an overlay', async () => {
    const host = renderHost()
    host.present([weeklyFinalized(3, 0)], 'lifecycle')
    const popup = await screen.findByRole('status')
    expect(popup).toHaveTextContent('WEEKLY RESULT')
    expect(popup).toHaveTextContent('SCORE 3 / 10')
    expect(popup).toHaveTextContent('NO BONUS THIS WEEK')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    [6, 100, 'WEEK COMPLETE', '6+'],
    [7, 150, 'WEEK COMPLETE', '7+'],
    [8, 225, 'STRONG WEEK', '8+'],
    [9, 325, 'STRONG WEEK', '9+'],
    [10, 500, 'PERFECT WEEK', '10'],
  ])('a score of %i pays %i EXP and is shown as %s, with the reward tier %s and a way to claim it', async (score, bonus, heading, tier) => {
    const host = renderHost()
    host.present([weeklyFinalized(score, bonus)], 'lifecycle')
    const overlay = await dialog(heading)
    expect(overlay).toHaveAccessibleDescription(new RegExp(`SCORE ${score} / 10\\. \\+${bonus} EXP\\. REWARD TIER ${tier.replace('+', '\\+')} UNLOCKED`))
    expect(within(overlay).getByText(`SCORE ${score} / 10`)).toBeInTheDocument()
    expect(within(overlay).getByText(`+${bonus} EXP`)).toBeInTheDocument()
    expect(within(overlay).getByRole('link', { name: 'CLAIM IN WEEKLY' })).toHaveAttribute('href', '/weekly')
  })

  it('shows no reward line and no claim link when no tier was configured or earned', async () => {
    const host = renderHost()
    host.present([weeklyFinalized(7, 150, '2026-09-28', null)], 'lifecycle')
    const overlay = await dialog('WEEK COMPLETE')
    expect(within(overlay).queryByRole('link', { name: 'CLAIM IN WEEKLY' })).not.toBeInTheDocument()
    expect(overlay.textContent).not.toMatch(/REWARD TIER/)
  })
})

describe('reduced motion (OD-08)', () => {
  const fakeContext = {
    setTransform: () => undefined,
    clearRect: () => undefined,
    drawImage: () => undefined,
    fillRect: () => undefined,
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
  }

  it('NORMAL mounts the particle canvas for a rank reveal and removes it when the overlay closes', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext as unknown as CanvasRenderingContext2D)
    const host = renderHost()
    host.present(awardBetweenLevels(9, 10))
    const overlay = await dialog('LEVEL UP')
    expect(overlay.querySelector('canvas')).not.toBeNull()
    expect(overlay).toHaveAttribute('data-fx', 'normal')

    fireEvent.click(overlay)
    fireEvent.click(await dialog('RANK ADVANCEMENT'))
    await waitFor(noDialog)
    expect(document.querySelector('canvas')).toBeNull()
  })

  it.each([
    ['the player chose REDUCED', { settings: { effects: 'reduced' as const }, osReduced: false }],
    ['the device asks for reduced motion', { settings: {}, osReduced: true }],
  ])('has no particles and no scramble when %s, and keeps every word', async (_label, options) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext as unknown as CanvasRenderingContext2D)
    const host = renderHost({ ...options, timings: { scrambleMs: 5_000, typeMs: 5_000 } }) // normal-length effects would still be running
    host.present(awardBetweenLevels(14, 15))
    const overlay = await dialog('LEVEL UP')
    expect(overlay).toHaveAttribute('data-fx', 'reduced')
    expect(overlay.querySelector('canvas')).toBeNull()
    // The animated layer shows the final text immediately (no glyphs, no half-typed line).
    const heading = within(overlay).getByRole('heading', { name: 'LEVEL UP' })
    expect(heading.querySelector('[aria-hidden="true"]')?.textContent).toBe('LEVEL UP')
    expect(overlay).toHaveTextContent('YOUR LEVEL HAS INCREASED.')
    expect(overlay).toHaveAccessibleDescription(/LV\. 14 to LV\. 15/)
  })

  it('switching to REDUCED applies live, and a device setting wins over a NORMAL choice', async () => {
    const host = renderHost({ settings: { effects: 'normal' } })
    host.settings.setOsReduced(true)
    host.present(awardBetweenLevels(14, 15))
    expect(await dialog('LEVEL UP')).toHaveAttribute('data-fx', 'reduced')
  })

  it('reduced popups and the information they carry are the same as normal ones', async () => {
    const host = renderHost({ settings: { effects: 'reduced' } })
    host.present([achievementUnlocked('a', 'First Quest')])
    const popup = await screen.findByRole('status')
    expect(popup).toHaveAttribute('data-fx', 'reduced')
    expect(popup).toHaveTextContent('FIRST QUEST')
  })
})

describe('text effects keep the final text for assistive technology', () => {
  it('in NORMAL mode the animated layer is hidden from assistive technology and the full text is read once', async () => {
    const host = renderHost({ timings: { scrambleMs: 5_000, typeMs: 5_000 } })
    host.present(awardBetweenLevels(14, 15))
    const overlay = await dialog('LEVEL UP')
    const heading = within(overlay).getByRole('heading', { name: 'LEVEL UP' })
    expect(heading.querySelector('.sr-only')?.textContent).toBe('LEVEL UP')
    expect(heading.querySelector('[aria-hidden="true"]')).not.toBeNull()
    const typed = overlay.querySelector('.system-fx-caret')
    expect(typed?.previousElementSibling?.textContent).toBe('YOUR LEVEL HAS INCREASED.') // the complete line, already there for screen readers
    expect(typed?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('cues: haptics and sound', () => {
  it('plays the haptic pattern and sound of each moment once, when it starts showing', async () => {
    const host = renderHost({ settings: { sound: true } })
    host.present(awardBetweenLevels(14, 15))
    await dialog('LEVEL UP')
    expect(host.vibrate).toHaveBeenCalledTimes(1)
    expect(host.vibrate).toHaveBeenCalledWith([40, 60, 40])
    expect(host.playSound).toHaveBeenCalledTimes(1)
    expect(host.playSound).toHaveBeenCalledWith('level_up')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(host.vibrate).toHaveBeenCalledTimes(1)
  })

  it('uses the stronger patterns for a rank reveal and a Perfect Week', async () => {
    const host = renderHost()
    host.present(awardBetweenLevels(9, 10))
    await dialog('LEVEL UP')
    expect(host.vibrate).toHaveBeenLastCalledWith([60, 80, 60, 80, 120])
    fireEvent.click(await dialog('LEVEL UP'))
    fireEvent.click(await dialog('RANK ADVANCEMENT'))
    await waitFor(noDialog)

    host.present([weeklyFinalized(10, 500)], 'lifecycle')
    await dialog('PERFECT WEEK')
    expect(host.vibrate).toHaveBeenLastCalledWith([60, 70, 60, 70, 60, 70, 160])
  })

  it('sound is OFF by default; haptics are ON by default', async () => {
    const host = renderHost()
    host.present(awardBetweenLevels(14, 15))
    await dialog('LEVEL UP')
    expect(host.vibrate).toHaveBeenCalled()
    expect(host.playSound).not.toHaveBeenCalled()
  })

  it('does nothing when haptics are switched off, and a restrained weekly result has no cue at all', async () => {
    const host = renderHost({ settings: { haptics: false } })
    host.present(awardBetweenLevels(14, 15))
    await dialog('LEVEL UP')
    expect(host.vibrate).not.toHaveBeenCalled()

    const quiet = renderHost()
    quiet.present([weeklyFinalized(3, 0)], 'lifecycle')
    await screen.findAllByRole('status')
    expect(quiet.vibrate).not.toHaveBeenCalled()
    expect(quiet.playSound).not.toHaveBeenCalled()
  })

  it('a haptic or sound failure never breaks the presentation', async () => {
    const host = renderHost({ settings: { sound: true } })
    host.vibrate.mockImplementation(() => {
      throw new Error('no motor')
    })
    host.playSound.mockImplementation(() => {
      throw new Error('no audio')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    host.present(awardBetweenLevels(14, 15))
    await dialog('LEVEL UP')
    expect(warn).toHaveBeenCalled()
  })
})

describe('when the overlay chunk is part of the app', () => {
  it('renders nothing at all while the queue is empty (no canvas, no dialog, no live region)', () => {
    renderHost()
    expect(document.querySelector('canvas')).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
