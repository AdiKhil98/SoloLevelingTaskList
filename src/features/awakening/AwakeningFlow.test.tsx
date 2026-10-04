import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSequentialIds, createTestClock, newFactory, noonOn } from '@/application/test-utils/helpers'
import { startApplication } from '@/application'
import { NORMAL_TIMINGS, REDUCED_TIMINGS, type AwakeningTimings } from '@/effects/timings'
import { getPlayerProfile, listTemplates, openDatabase } from '@/persistence'
import { DATABASE_NAME } from '@/persistence/config'
import { openVersionedDatabase } from '@/persistence/database/connection'
import { MIGRATIONS } from '@/persistence/migrations'
import { flakyWrites } from '@/test/flakyWrites'
import { memorySettings } from '@/test/presentationUi'
import { TEST_AWAKENING_TIMINGS, TEST_TIMINGS } from '@/test/presentationTimings'
import { renderApp, type RenderAppOptions } from '@/test/renderApp'

afterEach(() => {
  vi.restoreAllMocks()
})

const timingsWith = (awakening: Partial<AwakeningTimings>): RenderAppOptions['presentation'] => ({
  timings: { ...TEST_TIMINGS, awakening: { ...TEST_AWAKENING_TIMINGS, ...awakening } },
})

/** A brand-new install: a fresh factory, and the harness leaves it alone, so the real first launch plays. */
const firstLaunch = (options: RenderAppOptions = {}) => renderApp({ awakened: false, ...options })

const accept = () => screen.findByRole('button', { name: 'ACCEPT' })

/**
 * The screen attaches its document-level key listener in an effect, which can run a moment after the heading is on screen.
 * A test that sends a key event right away first lets pending effects run (a precondition, not a retry).
 */
const effectsSettled = () => act(async () => undefined)
const homeReady = () => screen.findByRole('region', { name: 'TODAY' })
const isHome = () => screen.queryByRole('region', { name: 'TODAY' }) !== null

/** What storage holds, read through a second connection (nothing the app owns). */
async function stored(factory: IDBFactory) {
  const database = await openDatabase({ factory })
  try {
    return { profile: await getPlayerProfile(database), templates: (await listTemplates(database)).length }
  } finally {
    database.close()
  }
}

async function toIdentify() {
  fireEvent.click(await accept())
  return screen.findByRole('heading', { name: 'IDENTIFY YOURSELF' })
}

function typeName(value: string) {
  fireEvent.change(screen.getByLabelText('PLAYER NAME'), { target: { value } })
}

describe('first launch: a new player is awakened, not dropped into Home', () => {
  it('shows Awakening and never Home, and creates nothing yet', async () => {
    const { factory } = firstLaunch()

    expect(await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })).toBeInTheDocument()
    expect(isHome()).toBe(false)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument() // no bottom navigation either
    expect(await stored(factory)).toEqual({ profile: { status: 'absent' }, templates: 0 })
  })

  it('never renders a frame of Home before Awakening is finished', async () => {
    const homeSightings: string[] = []
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('TODAY')) homeSightings.push(document.body.textContent)
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    try {
      firstLaunch()
      fireEvent.click(await accept())
      await screen.findByRole('heading', { name: 'IDENTIFY YOURSELF' })
      typeName('Ada')
      fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
      await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })
      expect(homeSightings).toEqual([]) // nothing of Home so far, not even loading underneath
      fireEvent.click(screen.getByRole('button', { name: 'BEGIN' }))
      await homeReady()
      expect(homeSightings.length).toBeGreaterThan(0) // ... and then it does appear
    } finally {
      observer.disconnect()
    }
  })

  it('plays the stages in order: notice → identify → complete → Home with the chosen name', async () => {
    const { factory } = firstLaunch()

    expect(await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })).toBeInTheDocument()
    expect(screen.getByText('PLAYER DETECTED', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.getByText('AWAKENING AVAILABLE', { selector: '.sr-only' })).toBeInTheDocument()

    expect(await toIdentify()).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'CONNECTION ESTABLISHED' })).not.toBeInTheDocument()
    typeName('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))

    expect(await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BEGIN' })).toHaveAccessibleDescription(/^WELCOME, Ada/)
    expect(screen.getByText('LV. 1 · E-RANK')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'BEGIN' }))
    await homeReady()
    expect(screen.getByRole('region', { name: 'Ada' })).toBeInTheDocument() // the Home player window carries the name
    expect(screen.queryByRole('heading', { name: 'AWAKENING COMPLETE' })).not.toBeInTheDocument()
    expect(await stored(factory)).toMatchObject({ profile: { status: 'valid', profile: { name: 'Ada' } }, templates: 6 })
  })

  it('persists the identity BEFORE Home: while AWAKENING COMPLETE is on screen the profile is already stored (and Home is not shown)', async () => {
    const { factory } = firstLaunch()
    await toIdentify()
    typeName('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })

    expect(isHome()).toBe(false)
    const profile = (await stored(factory)).profile
    expect(profile).toMatchObject({ status: 'valid', profile: { name: 'Ada' } })
    if (profile.status === 'valid') expect(profile.profile.awakenedAt).not.toBeNull() // a real Awakening has a real timestamp
  })

  it('Skip stores no name and Home shows the generic PLAYER', async () => {
    const { factory } = firstLaunch()
    await toIdentify()
    fireEvent.click(screen.getByRole('button', { name: 'SKIP' }))

    expect(await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BEGIN' })).toHaveAccessibleDescription(/^WELCOME, PLAYER/)
    fireEvent.click(screen.getByRole('button', { name: 'BEGIN' }))
    await homeReady()
    expect(screen.getByRole('region', { name: 'PLAYER' })).toBeInTheDocument()
    expect(await stored(factory)).toMatchObject({ profile: { status: 'valid', profile: { name: null } } })
  })

  it('the exit does not need a tap: AWAKENING COMPLETE continues into Home by itself', async () => {
    firstLaunch({ presentation: timingsWith({ completeAutoMs: 40 }) })
    await toIdentify()
    typeName('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    await homeReady()
  })
})

describe('first launch: restart, refresh and closing halfway', () => {
  it('a refresh during onboarding starts Awakening again and nothing was stored', async () => {
    const factory = newFactory()
    const first = firstLaunch({ factory })
    await toIdentify()
    typeName('Half way')
    first.unmount() // the page is reloaded

    firstLaunch({ factory })
    expect(await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })).toBeInTheDocument()
    expect(isHome()).toBe(false)
    expect(await stored(factory)).toEqual({ profile: { status: 'absent' }, templates: 0 })
  })

  it('closing the app after the name is saved but before Home: the next launch is a normal one with that name, no replay', async () => {
    const factory = newFactory()
    const first = firstLaunch({ factory })
    await toIdentify()
    typeName('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })
    first.unmount() // closed on the reveal

    firstLaunch({ factory })
    await homeReady()
    expect(screen.getByRole('region', { name: 'Ada' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ACCEPT' })).not.toBeInTheDocument()
  })

  it('never replays after completion: every later launch goes straight to the app', async () => {
    const factory = newFactory()
    const first = firstLaunch({ factory })
    await toIdentify()
    fireEvent.click(screen.getByRole('button', { name: 'SKIP' }))
    fireEvent.click(await screen.findByRole('button', { name: 'BEGIN' }))
    await homeReady()
    first.unmount()

    for (let launch = 0; launch < 3; launch += 1) {
      const next = firstLaunch({ factory })
      await homeReady()
      expect(screen.queryByRole('heading', { name: 'CONNECTION ESTABLISHED' })).not.toBeInTheDocument()
      next.unmount()
    }
  })

  it('works under StrictMode without saving or starting twice', async () => {
    const factory = newFactory()
    firstLaunch({ factory, strictMode: true })
    await toIdentify()
    typeName('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    fireEvent.click(await screen.findByRole('button', { name: 'BEGIN' }))
    await homeReady()
    expect(within(screen.getByRole('list', { name: /quests/i })).getAllByRole('listitem')).toHaveLength(6)
    expect(await stored(factory)).toMatchObject({ templates: 6 })
  })
})

describe('first launch: an existing installation is not made to awaken', () => {
  it('a Phase 10 (schema v4) database goes straight to the app, is called PLAYER, and can be renamed from Status', async () => {
    const factory = newFactory()
    // A real schema-4 database with the player's quests, exactly as Phase 10 left it.
    const v4 = await openVersionedDatabase({ name: DATABASE_NAME, factory, version: 4, migrations: { 1: MIGRATIONS[1]!, 2: MIGRATIONS[2]!, 3: MIGRATIONS[3]!, 4: MIGRATIONS[4]! } })
    await startApplication({ database: v4, clock: createTestClock(noonOn('2026-10-05')), ids: createSequentialIds() })
    v4.close()

    firstLaunch({ factory })
    await homeReady()
    expect(screen.queryByRole('button', { name: 'ACCEPT' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'PLAYER' })).toBeInTheDocument()
    expect(await stored(factory)).toMatchObject({ profile: { status: 'valid', profile: { name: null, awakenedAt: null } }, templates: 6 })

    fireEvent.click(screen.getByRole('link', { name: 'Status' }))
    fireEvent.click(await screen.findByRole('button', { name: /Edit name/ }))
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    await screen.findByText('Name saved.')
    expect(await stored(factory)).toMatchObject({ profile: { status: 'valid', profile: { name: 'Ada', awakenedAt: null } } })
  })
})

describe('the name', () => {
  it('trims whitespace, accepts Unicode and shows the stored name', async () => {
    firstLaunch()
    await toIdentify()
    typeName('   אדי   ')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    expect(await screen.findByRole('button', { name: 'BEGIN' })).toHaveAccessibleDescription(/^WELCOME, אדי/)
  })

  it('refuses a name that is too long: it says so, saves nothing and stays on the name stage', async () => {
    const { factory } = firstLaunch()
    await toIdentify()
    typeName('a'.repeat(21))

    expect(screen.getByText('Use 20 characters or fewer.')).toBeInTheDocument()
    expect(screen.getByLabelText('PLAYER NAME')).toBeInvalid()
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    expect(screen.getByRole('heading', { name: 'IDENTIFY YOURSELF' })).toBeInTheDocument()
    expect(await stored(factory)).toMatchObject({ profile: { status: 'absent' } })
  })

  it('refuses invisible and control characters', async () => {
    firstLaunch()
    await toIdentify()
    typeName('Ad​a')
    expect(screen.getByText(/characters that cannot be used/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    expect(screen.getByRole('heading', { name: 'IDENTIFY YOURSELF' })).toBeInTheDocument()
  })

  it('a blank name never confirms: it asks for a name or an explicit Skip, and saves nothing', async () => {
    const { factory } = firstLaunch()
    await toIdentify()
    typeName('   ')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name, or choose SKIP')
    expect(screen.getByRole('heading', { name: 'IDENTIFY YOURSELF' })).toBeInTheDocument()
    expect(await stored(factory)).toMatchObject({ profile: { status: 'absent' } })
    typeName('Ada') // typing clears the reminder
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the name as text only: markup in a name is never interpreted', async () => {
    firstLaunch()
    await toIdentify()
    typeName('<img onerror=a()>')
    expect(screen.getByLabelText('PLAYER NAME')).toHaveValue('<img onerror=a()>')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('saving: a failure never pretends onboarding completed', () => {
  it('stays on the name stage with an alert, saves nothing, and works once storage recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const base = newFactory()
    const { factory, control } = flakyWrites(base)
    firstLaunch({ factory })
    await toIdentify()
    typeName('Ada')

    control.failStores.add('playerProfile')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(screen.getByRole('heading', { name: 'IDENTIFY YOURSELF' })).toBeInTheDocument() // did not advance
    expect(screen.queryByRole('heading', { name: 'AWAKENING COMPLETE' })).not.toBeInTheDocument()
    expect(isHome()).toBe(false)
    expect(screen.getByLabelText('PLAYER NAME')).toHaveValue('Ada') // the typed name is kept
    expect(await stored(base)).toEqual({ profile: { status: 'absent' }, templates: 0 })

    control.failStores.clear()
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    expect(await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })).toBeInTheDocument()
    expect(await stored(base)).toMatchObject({ profile: { status: 'valid', profile: { name: 'Ada' } } })
  })

  it('a failed Skip does not advance either', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { factory, control } = flakyWrites(newFactory())
    firstLaunch({ factory })
    await toIdentify()
    control.failStores.add('playerProfile')
    fireEvent.click(screen.getByRole('button', { name: 'SKIP' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(screen.getByRole('heading', { name: 'IDENTIFY YOURSELF' })).toBeInTheDocument()
  })

  it('if the app cannot start AFTER the name was saved, Retry goes straight in: Awakening is never replayed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const base = newFactory()
    const { factory, control } = flakyWrites(base)
    firstLaunch({ factory })
    await toIdentify()
    typeName('Ada')

    control.failStores.add('questTemplates') // the profile saves, but the default quests cannot be created
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    fireEvent.click(await screen.findByRole('button', { name: 'BEGIN' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Local data could not be loaded')
    expect(await stored(base)).toMatchObject({ profile: { status: 'valid', profile: { name: 'Ada' } } })

    control.failStores.clear()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await homeReady()
    expect(screen.queryByRole('button', { name: 'ACCEPT' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ada' })).toBeInTheDocument()
  })
})

describe('the notice: a tap finishes the text, only ACCEPT accepts', () => {
  const slow = () => ({ presentation: timingsWith({ noticeDoneMs: 60_000, bootMs: 0 }) })

  it('before the lines finish there is no ACCEPT; a tap finishes them and shows it, and stays on the notice', async () => {
    firstLaunch(slow())
    await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })
    expect(screen.queryByRole('button', { name: 'ACCEPT' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('main')) // the tap that skips the animation

    expect(await accept()).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'CONNECTION ESTABLISHED' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'IDENTIFY YOURSELF' })).not.toBeInTheDocument()
  })

  it('once ACCEPT is shown, further taps, Enter, Space and Escape on the screen do NOT accept', async () => {
    firstLaunch(slow())
    await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })
    fireEvent.click(screen.getByRole('main'))
    await accept()

    fireEvent.click(screen.getByRole('main'))
    fireEvent.click(screen.getByRole('main'))
    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: ' ' })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.getByRole('heading', { name: 'CONNECTION ESTABLISHED' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'IDENTIFY YOURSELF' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT' })) // the explicit activation
    expect(await screen.findByRole('heading', { name: 'IDENTIFY YOURSELF' })).toBeInTheDocument()
  })

  it('a key may finish the text too, and still does not accept', async () => {
    firstLaunch(slow())
    await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })
    await effectsSettled()
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(await accept()).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'IDENTIFY YOURSELF' })).not.toBeInTheDocument()
  })

  it('a key that is held down (repeating) finishes nothing', async () => {
    firstLaunch(slow())
    await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })
    await effectsSettled() // so the listener really is attached and the repeat is what is ignored
    fireEvent.keyDown(document, { key: 'Enter', repeat: true })
    expect(screen.queryByRole('button', { name: 'ACCEPT' })).not.toBeInTheDocument()
  })

  it('ACCEPT ignores a stray double-tap right after it appears, then works', async () => {
    // A wide guard, so a busy machine cannot let the 'stray' tap outlive it.
    firstLaunch({ presentation: timingsWith({ noticeDoneMs: 60_000, bootMs: 0, acceptGuardMs: 800 }) })
    await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })
    fireEvent.click(screen.getByRole('main')) // skip...
    const button = await accept()
    fireEvent.click(button) // ...and the second tap of a double tap lands on ACCEPT

    expect(screen.queryByRole('heading', { name: 'IDENTIFY YOURSELF' })).not.toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 900))
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT' }))
    expect(await screen.findByRole('heading', { name: 'IDENTIFY YOURSELF' })).toBeInTheDocument()
  })

  it('the lines finish by themselves after their time, and ACCEPT still has to be pressed', async () => {
    firstLaunch({ presentation: timingsWith({ noticeDoneMs: 40, bootMs: 0 }) })
    expect(await accept()).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'IDENTIFY YOURSELF' })).not.toBeInTheDocument()
  })

  it('a dark boot beat comes first when effects are NORMAL', async () => {
    firstLaunch({ presentation: timingsWith({ bootMs: 80, noticeDoneMs: 0 }) })
    expect(screen.getByRole('status')).toHaveTextContent('SYSTEM INITIALIZING')
    expect(screen.queryByRole('heading', { name: 'CONNECTION ESTABLISHED' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })).toBeInTheDocument()
  })
})

describe('accessibility', () => {
  it('moves focus to the control that matters on every stage', async () => {
    firstLaunch()
    expect(await accept()).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT' }))
    expect(await screen.findByLabelText('PLAYER NAME')).toHaveFocus()
    typeName('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    expect(await screen.findByRole('button', { name: 'BEGIN' })).toHaveFocus()
  })

  it('every control is a real, reachable button or input with a name; nothing is hidden from the keyboard', async () => {
    firstLaunch()
    const first = await accept()
    expect(first).not.toBeDisabled()
    expect(first).toHaveAccessibleDescription('PLAYER DETECTED AWAKENING AVAILABLE')
    fireEvent.click(first)
    await screen.findByRole('heading', { name: 'IDENTIFY YOURSELF' })
    const form = screen.getByLabelText('PLAYER NAME').closest('form')!
    expect(within(form).getAllByRole('button').map((button) => button.textContent)).toEqual(['CONFIRM', 'SKIP'])
    for (const control of [...within(form).getAllByRole('button'), screen.getByLabelText('PLAYER NAME')]) {
      expect(control).not.toHaveAttribute('tabindex', '-1')
      expect(control).not.toBeDisabled()
    }
    expect(screen.getByLabelText('PLAYER NAME')).toHaveAccessibleDescription(/Up to 20 characters/)
  })

  it('submitting the form with Enter works like pressing CONFIRM', async () => {
    firstLaunch()
    await toIdentify()
    typeName('Ada')
    fireEvent.submit(screen.getByLabelText('PLAYER NAME').closest('form')!)
    expect(await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })).toBeInTheDocument()
  })

  it('the screen is the page main landmark, with one h1 per stage', async () => {
    firstLaunch()
    await accept()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('screen readers get the complete text of every stage even while it is still being animated', async () => {
    // Real NORMAL timings: the visual layer is still scrambling / typing, the readable text is already whole.
    firstLaunch({ presentation: { timings: { ...TEST_TIMINGS, awakening: { ...NORMAL_TIMINGS.awakening, bootMs: 0, acceptGuardMs: 0, noticeDoneMs: 60_000, completeGuardMs: 0 } } } })
    const heading = await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })
    expect(heading).toBeInTheDocument()
    expect(screen.getByText('PLAYER DETECTED', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.getByText('AWAKENING AVAILABLE', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('the stage animations are decoration: the particles are hidden from assistive technology', async () => {
    firstLaunch()
    await accept()
    for (const canvas of Array.from(document.querySelectorAll('canvas'))) expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('main').querySelector('.system-fx-aura')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('reduced motion', () => {
  const reducedTimings = (): RenderAppOptions['presentation'] => ({
    settings: memorySettings({ effects: 'reduced' }).store,
    timings: {
      ...TEST_TIMINGS,
      awakening: { ...REDUCED_TIMINGS.awakening, acceptGuardMs: 0, completeGuardMs: 0, exitMs: 0 },
    },
  })

  it('shows every message at once: no boot beat, the whole notice and ACCEPT immediately, and no particles', async () => {
    firstLaunch({ presentation: reducedTimings() })

    expect(await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })).toBeInTheDocument()
    // The VISIBLE text (not just the screen-reader copy) is already complete.
    const visible = screen.getByRole('main').querySelectorAll('[aria-hidden="true"]')
    const visibleText = Array.from(visible).map((node) => node.textContent)
    expect(visibleText).toEqual(expect.arrayContaining(['CONNECTION ESTABLISHED', 'PLAYER DETECTED', 'AWAKENING AVAILABLE']))
    expect(screen.getByRole('button', { name: 'ACCEPT' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('data-fx', 'reduced')
    expect(document.querySelector('canvas')).toBeNull()
    expect(screen.getByRole('main').querySelector('.system-fx-sweep')).toBeNull()
  })

  it('walks the whole sequence with the final text immediately, and still reaches Home', async () => {
    firstLaunch({ presentation: reducedTimings() })
    fireEvent.click(await accept())
    expect(await screen.findByRole('heading', { name: 'IDENTIFY YOURSELF' })).toBeInTheDocument()
    typeName('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))

    expect(await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })).toBeInTheDocument()
    // The typed layers (label, then name) are already complete: instantly, not letter by letter.
    const typed = Array.from(screen.getByRole('main').querySelectorAll('#awakening-welcome span[aria-hidden="true"] span[aria-hidden="true"]'))
    expect(typed.map((node) => node.textContent)).toEqual(['WELCOME,', 'Ada'])
    expect(document.querySelector('canvas')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'BEGIN' }))
    await homeReady()
  })

  it('the device reduced-motion setting forces it even if NORMAL is chosen', async () => {
    firstLaunch({
      presentation: {
        settings: memorySettings({ effects: 'normal' }, true).store,
        timings: { ...TEST_TIMINGS, awakening: { ...REDUCED_TIMINGS.awakening, acceptGuardMs: 0, completeGuardMs: 0, exitMs: 0 } },
      },
    })
    await accept()
    expect(screen.getByRole('main')).toHaveAttribute('data-fx', 'reduced')
  })
})

describe('NORMAL effects', () => {
  it('uses the real effects: the main element is data-fx="normal" and the stage carries its marker', async () => {
    firstLaunch()
    await accept()
    expect(screen.getByRole('main')).toHaveAttribute('data-fx', 'normal')
    expect(screen.getByRole('main')).toHaveAttribute('data-stage', 'notice')
  })

  it('plays one haptic cue when Awakening completes, and none before', async () => {
    const vibrate = vi.fn((pattern: readonly number[]) => pattern.length > 0)
    firstLaunch({ presentation: { timings: TEST_TIMINGS, vibrate } })
    await toIdentify()
    typeName('Ada')
    expect(vibrate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1))
    expect(vibrate).toHaveBeenCalledWith([40, 60, 40, 60, 140])
  })

  it('leaves nothing behind: no overlay, dialog or inert element remains after the reveal', async () => {
    firstLaunch()
    await toIdentify()
    fireEvent.click(screen.getByRole('button', { name: 'SKIP' }))
    fireEvent.click(await screen.findByRole('button', { name: 'BEGIN' }))
    await homeReady()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('[inert]')).toBeNull()
    expect(document.querySelector('[data-stage]')).toBeNull()
    expect(document.querySelector('canvas')).toBeNull()
  })
})
