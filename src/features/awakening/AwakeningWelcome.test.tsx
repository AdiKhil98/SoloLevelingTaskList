import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newFactory } from '@/application/test-utils/helpers'
import { REDUCED_TIMINGS, type AwakeningTimings } from '@/effects/timings'
import { getPlayerProfile, openDatabase } from '@/persistence'
import { memorySettings } from '@/test/presentationUi'
import { TEST_AWAKENING_TIMINGS, TEST_TIMINGS } from '@/test/presentationTimings'
import { renderApp, type RenderAppOptions } from '@/test/renderApp'

/**
 * Regression: the COMPLETE welcome line used to be ONE string ("WELCOME, <name>") under a
 * single dir="auto". Its first strong character is the Latin W, so the paragraph resolved
 * left-to-right and a Hebrew or Arabic name (and its punctuation) could be reordered. The
 * name now sits alone in its own <bdi dir="auto">, apart from the static label.
 */

const timingsWith = (awakening: Partial<AwakeningTimings>): RenderAppOptions['presentation'] => ({
  timings: { ...TEST_TIMINGS, awakening: { ...TEST_AWAKENING_TIMINGS, ...awakening } },
})

/** Plays a first launch through to the COMPLETE stage with `name` (null = Skip). */
async function reachComplete(name: string | null, options: RenderAppOptions = {}) {
  const view = renderApp({ awakened: false, ...options })
  fireEvent.click(await screen.findByRole('button', { name: 'ACCEPT' }))
  await screen.findByRole('heading', { name: 'IDENTIFY YOURSELF' })
  if (name === null) {
    fireEvent.click(screen.getByRole('button', { name: 'SKIP' }))
  } else {
    fireEvent.change(screen.getByLabelText('PLAYER NAME'), { target: { value: name } })
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
  }
  await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })
  return view
}

const welcome = () => document.getElementById('awakening-welcome') as HTMLElement
/** The typed (visible) layers of the line, in order: the label, then the name. */
const typedLayers = () => Array.from(welcome().querySelectorAll('span[aria-hidden="true"] span[aria-hidden="true"]'))
/** The isolated name element(s) of the visible layer. */
const visibleNameIsolates = () => Array.from(welcome().querySelectorAll('span[aria-hidden="true"] bdi'))

/** Every text node of the paragraph that contains `text`, with the closest <bdi> around it (or null). */
function textNodesContaining(text: string) {
  const found: Array<{ node: Text; bdi: Element | null }> = []
  const walker = document.createTreeWalker(welcome(), NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.textContent ?? '').includes(text)) found.push({ node: node as Text, bdi: node.parentElement?.closest('bdi') ?? null })
  }
  return found
}

describe('Awakening COMPLETE: the welcome line isolates the player name bidirectionally', () => {
  it.each([
    ['a Hebrew name', 'אדי'],
    ['an Arabic name', 'علي'],
    ['a name that mixes Hebrew and Latin', 'דני Cohen'],
    ['an RTL name with trailing punctuation', 'אדי!'],
  ])('%s sits alone in its own bdi dir="auto", apart from the static label', async (_label, name) => {
    await reachComplete(name)

    // The paragraph itself no longer decides direction from the first strong character (the W).
    expect(welcome()).not.toHaveAttribute('dir')

    // The visible line: the label, then the name inside exactly one isolate.
    const [label, typedName] = typedLayers()
    expect(label).toHaveTextContent(/^WELCOME,$/)
    expect(typedName).toHaveTextContent(name)
    const isolates = visibleNameIsolates()
    expect(isolates).toHaveLength(1)
    expect(isolates[0]).toHaveAttribute('dir', 'auto')
    expect(isolates[0]).toContainElement(typedName as HTMLElement)
    expect(isolates[0]).not.toContainElement(label as HTMLElement) // the label is outside the isolate

    // Every piece of the user's text, visible or hidden, is inside a bdi; the label and the name never share a text node.
    const holders = textNodesContaining(name)
    expect(holders.length).toBeGreaterThan(0)
    for (const { node, bdi } of holders) {
      expect(bdi).not.toBeNull()
      expect(bdi).toHaveAttribute('dir', 'auto')
      expect(node.textContent).not.toContain('WELCOME')
    }
  })

  it('screen readers still get the complete natural message, once, with the name in order', async () => {
    await reachComplete('אדי')

    const begin = screen.getByRole('button', { name: 'BEGIN' })
    expect(begin).toHaveAccessibleDescription('WELCOME, אדי LV. 1 · E-RANK')
    // The typed layer is hidden from assistive technology, so the message is not read twice.
    expect(welcome().querySelectorAll('.sr-only')).toHaveLength(3) // the natural message, plus the label's and the name's own copies, which sit inside the hidden typed layer
    for (const typed of typedLayers()) expect(typed.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('a normal Latin name renders correctly: label, then the name in its own isolate', async () => {
    await reachComplete('Ada Lovelace')

    const [label, typedName] = typedLayers()
    expect(label).toHaveTextContent(/^WELCOME,$/)
    expect(typedName).toHaveTextContent(/^Ada Lovelace$/)
    expect(visibleNameIsolates()).toHaveLength(1)
    expect(visibleNameIsolates()[0]).toHaveAttribute('dir', 'auto')
    expect(screen.getByRole('button', { name: 'BEGIN' })).toHaveAccessibleDescription('WELCOME, Ada Lovelace LV. 1 · E-RANK')
  })

  it('the generic PLAYER (Skip) is isolated the same way', async () => {
    await reachComplete(null)
    expect(typedLayers()[1]).toHaveTextContent(/^PLAYER$/)
    expect(visibleNameIsolates()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'BEGIN' })).toHaveAccessibleDescription(/^WELCOME, PLAYER/)
  })

  it('markup characters in a name stay plain text inside the isolate', async () => {
    await reachComplete('<b>A</b>&"x"')
    expect(welcome().querySelector('b')).toBeNull()
    expect(typedLayers()[1]).toHaveTextContent('<b>A</b>&"x"')
    expect(visibleNameIsolates()[0]).toContainElement(typedLayers()[1] as HTMLElement)
  })

  it('does not alter the stored name or its validation: the name is stored exactly as before', async () => {
    const factory = newFactory()
    await reachComplete('  אדי  ', { factory })
    const database = await openDatabase({ factory })
    try {
      expect(await getPlayerProfile(database)).toMatchObject({ status: 'valid', profile: { name: 'אדי' } }) // trimmed by the same rules, nothing added for display
    } finally {
      database.close()
    }
  })
})

describe('Awakening COMPLETE: the typing presentation is preserved', () => {
  it('is still typed in NORMAL (not shown instantly) while the full message is already readable', async () => {
    // A typing time far longer than any test, so nothing here depends on a clock: both pieces are in their typing state and the name has not started.
    await reachComplete('Ada', { presentation: timingsWith({ typeMs: 60_000, welcomeDelayMs: 0, completeAutoMs: 600_000 }) })

    expect(screen.getByRole('button', { name: 'BEGIN' })).toHaveAccessibleDescription(/^WELCOME, Ada/)
    for (const layer of typedLayers()) expect(layer).toHaveAttribute('data-typing', 'true')
    expect(typedLayers()[1]).toHaveTextContent(/^$/) // the name waits for the label (its delay is the whole label's typing time)
  })

  it('REDUCED shows the whole line at once, still as label plus isolated name', async () => {
    await reachComplete('אדי', {
      presentation: {
        settings: memorySettings({ effects: 'reduced' }).store,
        timings: { ...TEST_TIMINGS, awakening: { ...REDUCED_TIMINGS.awakening, acceptGuardMs: 0, completeGuardMs: 0, exitMs: 0 } },
      },
    })
    expect(typedLayers().map((node) => node.textContent)).toEqual(['WELCOME,', 'אדי'])
    expect(visibleNameIsolates()).toHaveLength(1)
    expect(visibleNameIsolates()[0]).toHaveAttribute('dir', 'auto')
  })
})
