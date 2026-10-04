import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuest } from '@/application'
import { buildFormValues, createSequentialIds, createTestClock, newFactory, noonOn } from '@/application/test-utils/helpers'
import { asDateKey, sortTemplatesByOrder } from '@/domain'
import { listCompletionsByDate, listXpTransactions, openDatabase } from '@/persistence'
import { renderApp } from '@/test/renderApp'
import { listedQuests, readTemplates, waitForQuestsPage, writeFailingFactory } from '@/test/questUi'
import { DRAG_THRESHOLD_PX } from './useSortableList'

const MONDAY = '2026-10-05'
const SEEDED = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00']

const ROW_HEIGHT = 100
const ROW_GAP = 10

/** jsdom has no layout: give each quest row a fixed box (100 px tall, 10 px apart) by its position in the list. */
function stubLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = this.matches('li[data-quest-id]') && this.parentElement ? [...this.parentElement.children].indexOf(this) : 0
    const top = this.matches('li[data-quest-id]') ? index * (ROW_HEIGHT + ROW_GAP) : 0
    const height = this.matches('li[data-quest-id]') ? ROW_HEIGHT : 0
    return { top, bottom: top + height, height, left: 0, right: 300, width: 300, x: 0, y: top, toJSON: () => ({}) }
  })
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value: () => true })
}

const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')

beforeEach(stubLayout)

afterEach(() => {
  vi.restoreAllMocks()
  if (originalScrollY !== undefined) Object.defineProperty(window, 'scrollY', originalScrollY)
  document.body.style.removeProperty('user-select')
})

const titlesShown = () => listedQuests().map((item) => within(item).getAllByText(/./)[0]?.textContent)
const rowFor = (title: string) => {
  const found = listedQuests().find((item) => within(item).queryByText(title) !== null)
  if (found === undefined) throw new Error(`no row titled ${title}`)
  return found
}
const handleOf = (title: string) => {
  const handle = rowFor(title).querySelector('[data-drag-handle]')
  if (handle === null) throw new Error(`no drag handle on ${title}`)
  return handle
}

async function storedTitles(factory: IDBFactory): Promise<string[]> {
  const templates = await readTemplates(factory)
  return sortTemplatesByOrder(templates.filter((template) => template.status === 'active')).map((template) => template.title)
}

async function openQuests(factory = newFactory()) {
  const view = renderApp({ path: '/quests', factory })
  await waitForQuestsPage()
  return { ...view, factory }
}

/** Press, move to `startY + dy` in several steps, and (optionally) release. Row i's centre is at 50 + 110 i. */
function drag(title: string, dy: number, { release = true }: { release?: boolean } = {}) {
  const handle = handleOf(title)
  const startY = 50 + 110 * titlesShown().indexOf(title)
  const pointer = { pointerId: 7, isPrimary: true, button: 0 }
  fireEvent.pointerDown(handle, { ...pointer, clientY: startY })
  const steps = 8
  for (let step = 1; step <= steps; step += 1) fireEvent.pointerMove(handle, { ...pointer, clientY: startY + (dy * step) / steps })
  if (release) fireEvent.pointerUp(handle, { ...pointer, clientY: startY + dy })
  return { handle, pointer, startY }
}

const moveButton = (title: string, direction: 'up' | 'down') => screen.getByRole('button', { name: `Move ${title} ${direction}` })

/** Counts read-write transactions, so "nothing is stored while dragging" can be asserted. */
function countingFactory(base: IDBFactory) {
  const state = { writes: 0 }
  const factory = {
    open(name: string, version?: number) {
      const request = base.open(name, version)
      request.addEventListener('success', () => {
        const connection = request.result
        const original = connection.transaction.bind(connection)
        connection.transaction = ((stores: string | string[], mode?: IDBTransactionMode, options?: IDBTransactionOptions) => {
          if (mode === 'readwrite') state.writes += 1
          return original(stores, mode, options)
        }) as typeof connection.transaction
      })
      return request
    },
  } as unknown as IDBFactory
  return { factory, state }
}

describe('the drag handle', () => {
  it('every active quest has one; archived quests have none', async () => {
    await openQuests()
    expect(listedQuests()).toHaveLength(6)
    for (const item of listedQuests()) expect(item.querySelectorAll('[data-drag-handle]')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Archive Asr' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive Quest' }))
    await screen.findByText('Quest archived.')
    fireEvent.click(await screen.findByRole('button', { name: 'Archived (1)' }))
    expect(listedQuests()).toHaveLength(1)
    expect(document.querySelectorAll('[data-drag-handle]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull()
  })

  it('is decoration for assistive technology (the Move buttons are the accessible path) and a 44 px pointer target', async () => {
    await openQuests()
    const handle = handleOf('Fajr')
    expect(handle).toHaveAttribute('aria-hidden', 'true')
    expect(handle.className).toContain('touch-none')
    expect(handle.className).toContain('size-11')
  })

  it('shows each quest’s place in the order', async () => {
    await openQuests()
    expect(within(rowFor('Fajr')).getByText('Position 1 of 6')).toBeInTheDocument()
    expect(within(rowFor('Sleep before 00:00')).getByText('Position 6 of 6')).toBeInTheDocument()
  })
})

describe('dragging', () => {
  it('moves a quest down one slot and stores the new order once, only when released', async () => {
    const counted = countingFactory(newFactory())
    await openQuests(counted.factory)
    const writesAtRest = counted.state.writes

    const { handle, pointer, startY } = drag('Fajr', 120, { release: false })
    expect(counted.state.writes).toBe(writesAtRest) // nothing is stored while the pointer moves
    expect(titlesShown()).toEqual(SEEDED) // and the list has not been re-rendered

    fireEvent.pointerUp(handle, { ...pointer, clientY: startY + 120 })

    expect(titlesShown()).toEqual(['Dhuhr', 'Fajr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00'])
    await waitFor(async () => expect(await storedTitles(counted.factory)).toEqual(titlesShown()))
    expect(screen.getByRole('status')).toHaveTextContent('Fajr moved to position 2 of 6.')
  })

  it.each([
    ['the last quest to the very top', 'Sleep before 00:00', -900, ['Sleep before 00:00', ...SEEDED.slice(0, 5)]],
    ['the first quest to the very bottom', 'Fajr', 900, [...SEEDED.slice(1), 'Fajr']],
    ['a middle quest up two places', 'Maghrib', -230, ['Fajr', 'Maghrib', 'Dhuhr', 'Asr', 'Isha', 'Sleep before 00:00']],
  ])('moves %s and stores it', async (_label, title, dy, expected) => {
    const { factory } = await openQuests()
    drag(title, dy)
    expect(titlesShown()).toEqual(expected)
    await waitFor(async () => expect(await storedTitles(factory)).toEqual(expected))
  })

  it('shows the dragged row following the pointer and the rows it passes making room, then clears it all on release', async () => {
    await openQuests()
    const { handle, pointer, startY } = drag('Fajr', 250, { release: false })

    expect(rowFor('Fajr')).toHaveAttribute('data-dragging')
    expect(rowFor('Fajr').style.transform).toBe('translateY(250px)')
    expect(rowFor('Dhuhr').style.transform).toBe('translateY(-110px)') // passed: one slot up
    expect(rowFor('Asr').style.transform).toBe('translateY(-110px)') // passed (centre 270 < 300)
    expect(rowFor('Maghrib').style.transform).toBe('') // not reached
    expect(document.body.style.userSelect).toBe('none')

    fireEvent.pointerUp(handle, { ...pointer, clientY: startY + 250 })
    await waitFor(() => expect(titlesShown().slice(0, 3)).toEqual(['Dhuhr', 'Asr', 'Fajr']))
    for (const item of listedQuests()) expect(item.style.transform).toBe('')
    expect(listedQuests().some((item) => item.hasAttribute('data-dragging'))).toBe(false)
    expect(document.body.style.userSelect).toBe('')
  })

  it('a drag that does not reach a neighbour changes nothing and writes nothing', async () => {
    const counted = countingFactory(newFactory())
    await openQuests(counted.factory)
    const writesAtRest = counted.state.writes

    drag('Dhuhr', 40)

    expect(titlesShown()).toEqual(SEEDED)
    expect(counted.state.writes).toBe(writesAtRest)
    for (const item of listedQuests()) expect(item.style.transform).toBe('')
  })

  it('a tap on the handle (no real movement) is not a drag', async () => {
    const counted = countingFactory(newFactory())
    await openQuests(counted.factory)
    const writesAtRest = counted.state.writes

    drag('Asr', DRAG_THRESHOLD_PX - 1)

    expect(titlesShown()).toEqual(SEEDED)
    expect(counted.state.writes).toBe(writesAtRest)
    expect(listedQuests().some((item) => item.hasAttribute('data-dragging'))).toBe(false)
  })

  it('ignores a secondary pointer and any press that is not the primary button', async () => {
    await openQuests()
    const handle = handleOf('Fajr')
    fireEvent.pointerDown(handle, { pointerId: 3, isPrimary: false, button: 0, clientY: 50 })
    fireEvent.pointerMove(handle, { pointerId: 3, isPrimary: false, clientY: 400 })
    fireEvent.pointerUp(handle, { pointerId: 3, isPrimary: false, clientY: 400 })
    fireEvent.pointerDown(handle, { pointerId: 4, isPrimary: true, button: 2, clientY: 50 })
    fireEvent.pointerMove(handle, { pointerId: 4, isPrimary: true, clientY: 400 })
    fireEvent.pointerUp(handle, { pointerId: 4, isPrimary: true, clientY: 400 })
    expect(titlesShown()).toEqual(SEEDED)
  })

  it('scrolls the page by itself while the pointer is held near the bottom or top edge, keeps the row under the pointer, and stops when the drag ends', async () => {
    let scrollTop = 0
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollTop })
    const scrollBy = vi.fn((_x: number, y: number) => {
      scrollTop = Math.max(0, scrollTop + y)
    })
    vi.spyOn(window, 'scrollBy').mockImplementation(scrollBy as unknown as typeof window.scrollBy)
    await openQuests()

    const handle = handleOf('Fajr')
    const pointer = { pointerId: 9, isPrimary: true, button: 0 }
    fireEvent.pointerDown(handle, { ...pointer, clientY: 50 })
    fireEvent.pointerMove(handle, { ...pointer, clientY: 70 }) // past the threshold: the drag starts
    const nearBottom = window.innerHeight - 70
    fireEvent.pointerMove(handle, { ...pointer, clientY: nearBottom })

    await waitFor(() => expect(scrollBy.mock.calls.length).toBeGreaterThan(2))
    expect(scrollBy.mock.calls.every(([, y]) => y > 0)).toBe(true) // downwards
    // The dragged row follows the pointer plus everything the page has scrolled.
    expect(rowFor('Fajr').style.transform).toBe(`translateY(${nearBottom - 50 + scrollTop}px)`)

    fireEvent.pointerMove(handle, { ...pointer, clientY: 10 }) // now near the top: scrolls back up
    await waitFor(() => expect(scrollTop).toBeLessThan(scrollBy.mock.calls.length * 16))
    const lastDirection = scrollBy.mock.calls.at(-1)?.[1] ?? 0
    expect(lastDirection).toBeLessThan(0)

    fireEvent.pointerCancel(handle, { ...pointer, clientY: 10 })
    const callsAtEnd = scrollBy.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(scrollBy.mock.calls.length).toBe(callsAtEnd) // no more scrolling once the drag is over
    expect(titlesShown()).toEqual(SEEDED)
  })

  it('suppresses the context menu on the handle (a long press on a phone must not open it)', async () => {
    await openQuests()
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    handleOf('Fajr').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not trigger Edit, Archive or navigation, and awards nothing', async () => {
    const factory = newFactory()
    const { router } = await openQuests(factory)

    drag('Fajr', 250)
    await waitFor(async () => expect(await storedTitles(factory)).toEqual(titlesShown()))

    expect(router.state.location.pathname).toBe('/quests')
    expect(screen.queryByRole('group', { name: /^Archive/ })).toBeNull()
    for (const button of screen.getAllByRole('button', { name: /^Archive / })) expect(button).toHaveAttribute('aria-expanded', 'false')
    const database = await openDatabase({ factory })
    try {
      expect(await listXpTransactions(database)).toEqual([])
      expect(await listCompletionsByDate(database, asDateKey(MONDAY))).toEqual([])
    } finally {
      database.close()
    }
  })
})

describe('cancelling a drag writes nothing', () => {
  async function setupCancel() {
    const counted = countingFactory(newFactory())
    const view = await openQuests(counted.factory)
    return { counted, view, writesAtRest: counted.state.writes }
  }

  const expectUntouched = async (counted: ReturnType<typeof countingFactory>, writesAtRest: number) => {
    expect(titlesShown()).toEqual(SEEDED)
    for (const item of listedQuests()) {
      expect(item.style.transform).toBe('')
      expect(item.hasAttribute('data-dragging')).toBe(false)
    }
    expect(document.body.style.userSelect).toBe('')
    // Give any (wrongly) queued store time to happen, then check nothing was written or reordered.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(counted.state.writes).toBe(writesAtRest)
    expect(await storedTitles(counted.factory)).toEqual(SEEDED)
  }

  it('pointer cancel', async () => {
    const { counted, writesAtRest } = await setupCancel()
    const { handle, pointer, startY } = drag('Fajr', 250, { release: false })
    expect(rowFor('Fajr')).toHaveAttribute('data-dragging')

    fireEvent.pointerCancel(handle, { ...pointer, clientY: startY + 250 })

    await expectUntouched(counted, writesAtRest)
  })

  it('the pointer capture being lost', async () => {
    const { counted, writesAtRest } = await setupCancel()
    const { handle, pointer, startY } = drag('Dhuhr', -120, { release: false })
    fireEvent.lostPointerCapture(handle, { ...pointer, clientY: startY - 120 })
    await expectUntouched(counted, writesAtRest)
  })

  it('Escape', async () => {
    const { counted, writesAtRest } = await setupCancel()
    drag('Asr', 300, { release: false })
    fireEvent.keyDown(window, { key: 'Escape' })
    await expectUntouched(counted, writesAtRest)
  })

  it('the page being hidden', async () => {
    const { counted, writesAtRest } = await setupCancel()
    drag('Isha', -300, { release: false })
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    hidden.mockRestore()
    await expectUntouched(counted, writesAtRest)
  })

  it('leaving the screen in the middle of a drag leaves nothing behind', async () => {
    const { counted, view, writesAtRest } = await setupCancel()
    drag('Fajr', 250, { release: false })
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Home' }))
    await screen.findByRole('heading', { name: 'SYSTEM' })
    view.unmount()
    expect(document.body.style.userSelect).toBe('')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(counted.state.writes).toBe(writesAtRest)
    expect(await storedTitles(counted.factory)).toEqual(SEEDED)
  })

  it('after a cancelled drag a fresh drag still works', async () => {
    await openQuests()
    const { handle, pointer, startY } = drag('Fajr', 250, { release: false })
    fireEvent.pointerCancel(handle, { ...pointer, clientY: startY + 250 })
    expect(titlesShown()).toEqual(SEEDED)

    drag('Fajr', 120)

    expect(titlesShown()).toEqual(['Dhuhr', 'Fajr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00'])
  })
})

describe('the Move up / Move down buttons (the accessible way to reorder)', () => {
  it('are real, labelled buttons for every active quest', async () => {
    await openQuests()
    for (const title of SEEDED) {
      for (const direction of ['up', 'down'] as const) {
        const button = moveButton(title, direction)
        expect(button.tagName).toBe('BUTTON')
        expect(button).not.toHaveAttribute('tabindex', '-1')
        expect(button.className).toContain('min-h-11')
        expect(button.className).toContain('w-11')
      }
    }
  })

  it('Move down / Move up swap a quest with its neighbour, show it at once and store it', async () => {
    const { factory } = await openQuests()

    fireEvent.click(moveButton('Fajr', 'down'))
    expect(titlesShown()).toEqual(['Dhuhr', 'Fajr', 'Asr', 'Maghrib', 'Isha', 'Sleep before 00:00'])
    expect(screen.getByRole('status')).toHaveTextContent('Fajr moved to position 2 of 6.')

    fireEvent.click(moveButton('Sleep before 00:00', 'up'))
    expect(titlesShown()).toEqual(['Dhuhr', 'Fajr', 'Asr', 'Maghrib', 'Sleep before 00:00', 'Isha'])

    await waitFor(async () => expect(await storedTitles(factory)).toEqual(titlesShown()))
  })

  it('the first quest cannot move up and the last cannot move down (and pressing does nothing)', async () => {
    const counted = countingFactory(newFactory())
    await openQuests(counted.factory)
    const writesAtRest = counted.state.writes

    expect(moveButton('Fajr', 'up')).toHaveAttribute('aria-disabled', 'true')
    expect(moveButton('Sleep before 00:00', 'down')).toHaveAttribute('aria-disabled', 'true')
    expect(moveButton('Dhuhr', 'up')).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(moveButton('Fajr', 'up'))
    fireEvent.click(moveButton('Sleep before 00:00', 'down'))

    expect(titlesShown()).toEqual(SEEDED)
    expect(counted.state.writes).toBe(writesAtRest)
  })

  it('keep keyboard focus on the button that was used, even as the row moves', async () => {
    await openQuests()
    moveButton('Asr', 'up').focus()
    fireEvent.click(moveButton('Asr', 'up'))
    expect(titlesShown()).toEqual(['Fajr', 'Asr', 'Dhuhr', 'Maghrib', 'Isha', 'Sleep before 00:00'])
    expect(document.activeElement).toBe(moveButton('Asr', 'up'))

    fireEvent.click(moveButton('Asr', 'up'))
    expect(document.activeElement).toBe(moveButton('Asr', 'up')) // now first: still focused although aria-disabled
    expect(moveButton('Asr', 'up')).toHaveAttribute('aria-disabled', 'true')
  })

  it('a seeded prayer can be moved anywhere with the buttons alone', async () => {
    const { factory } = await openQuests()
    for (let press = 0; press < 5; press += 1) fireEvent.click(moveButton('Fajr', 'down'))
    expect(titlesShown()).toEqual([...SEEDED.slice(1), 'Fajr'])
    await waitFor(async () => expect(await storedTitles(factory)).toEqual(titlesShown()))
    for (let press = 0; press < 5; press += 1) fireEvent.click(moveButton('Fajr', 'up'))
    expect(titlesShown()).toEqual(SEEDED)
  })

  it('rapid presses are all applied, in order, with no error', async () => {
    const { factory } = await openQuests()
    fireEvent.click(moveButton('Fajr', 'down'))
    fireEvent.click(moveButton('Fajr', 'down'))
    fireEvent.click(moveButton('Fajr', 'down'))
    fireEvent.click(moveButton('Isha', 'up'))
    const expected = ['Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Fajr', 'Sleep before 00:00']
    expect(titlesShown()).toEqual(expected)

    await waitFor(async () => expect(await storedTitles(factory)).toEqual(expected))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('persistence and the rest of the app', () => {
  it('a new quest goes to the bottom of the list', async () => {
    const factory = newFactory()
    const seeded = renderApp({ path: '/quests', factory })
    await waitForQuestsPage() // the first start seeds the six default quests
    seeded.unmount()
    const database = await openDatabase({ factory })
    await createQuest(
      { database, clock: createTestClock(noonOn(MONDAY)), ids: createSequentialIds() },
      buildFormValues({ title: 'Backtesting' }, MONDAY),
    )
    database.close()

    renderApp({ path: '/quests', factory })
    await waitForQuestsPage()

    expect(titlesShown()).toEqual([...SEEDED, 'Backtesting'])
    expect(within(rowFor('Backtesting')).getByText('Position 7 of 7')).toBeInTheDocument()
  })

  it('the order survives a reload, and Home shows it', async () => {
    const factory = newFactory()
    const first = await openQuests(factory)
    fireEvent.click(moveButton('Sleep before 00:00', 'up'))
    fireEvent.click(moveButton('Sleep before 00:00', 'up'))
    fireEvent.click(moveButton('Sleep before 00:00', 'up'))
    fireEvent.click(moveButton('Sleep before 00:00', 'up'))
    fireEvent.click(moveButton('Sleep before 00:00', 'up'))
    const expected = ['Sleep before 00:00', ...SEEDED.slice(0, 5)]
    expect(titlesShown()).toEqual(expected)
    await waitFor(async () => expect(await storedTitles(factory)).toEqual(expected))
    first.unmount()

    renderApp({ path: '/quests', factory })
    await waitForQuestsPage()
    expect(titlesShown()).toEqual(expected)
    // The same stored order drives Home: switch tabs in the running app.
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Home' }))
    const quests = await screen.findByRole('list', { name: 'Today’s quests' })
    expect(within(quests).getAllByRole('listitem').map((item) => within(item).getByText(/^(Fajr|Dhuhr|Asr|Maghrib|Isha|Sleep before 00:00)$/).textContent)).toEqual(expected)
  })

  it('Home reflects a reorder made on the Quests screen without a reload', async () => {
    const { factory } = await openQuests()
    fireEvent.click(moveButton('Dhuhr', 'up'))
    expect(screen.getByRole('status')).toHaveTextContent('Dhuhr moved to position 1 of 6.')
    await waitFor(async () => expect((await storedTitles(factory))[0]).toBe('Dhuhr'))
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Home' }))
    const quests = await screen.findByRole('list', { name: 'Today’s quests' })
    expect(within(quests).getAllByRole('listitem')[0]).toHaveTextContent('Dhuhr')
  })
})

describe('when the list changed elsewhere, or saving fails', () => {
  it('a move made from an outdated list is refused: the list reloads and nothing is overwritten', async () => {
    const factory = newFactory()
    await openQuests(factory)

    // Another window adds a quest after this list was loaded.
    const database = await openDatabase({ factory })
    await createQuest(
      { database, clock: createTestClock(noonOn(MONDAY)), ids: createSequentialIds() },
      buildFormValues({ title: 'Added elsewhere' }, MONDAY),
    )
    database.close()

    fireEvent.click(moveButton('Fajr', 'down'))

    expect(await screen.findByRole('alert')).toHaveTextContent('changed in another tab or window')
    await waitFor(() => expect(titlesShown()).toEqual([...SEEDED, 'Added elsewhere']))
    expect(await storedTitles(factory)).toEqual([...SEEDED, 'Added elsewhere'])
  })

  it('a failed save tells the player, reloads the stored order and changes nothing', async () => {
    const { factory, state } = writeFailingFactory(newFactory())
    await openQuests(factory)

    state.failWrites = true
    fireEvent.click(moveButton('Fajr', 'down'))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    state.failWrites = false
    await waitFor(() => expect(titlesShown()).toEqual(SEEDED))
    expect(await storedTitles(factory)).toEqual(SEEDED)
  })
})
