import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DOCUMENT_TITLE, documentTitleFor, documentTitleOf } from '@/components/layout/pageChrome'
import { renderApp } from '@/test/renderApp'

const scrollTo = () => vi.mocked(window.scrollTo)

describe('documentTitleOf', () => {
  it('is the deepest route that names itself, written as "Screen — SYSTEM"', () => {
    expect(documentTitleOf([{ handle: { title: 'Outer' } }, { handle: { title: 'Quests' } }])).toBe('Quests — SYSTEM')
    expect(documentTitleOf([{ handle: { title: 'Quests' } }, { handle: undefined }])).toBe('Quests — SYSTEM')
    expect(documentTitleFor('Weekly')).toBe('Weekly — SYSTEM')
  })

  it('falls back to the default when no route names itself or a handle is malformed', () => {
    expect(documentTitleOf([])).toBe(DEFAULT_DOCUMENT_TITLE)
    expect(documentTitleOf([{ handle: undefined }, { handle: null }, { handle: 'Quests' }, { handle: { title: 3 } }])).toBe(
      DEFAULT_DOCUMENT_TITLE,
    )
  })
})

describe('the page title follows the screen', () => {
  it('names every screen, and the not-found screen too', async () => {
    const { router } = renderApp()
    await screen.findByRole('heading', { name: 'SYSTEM' })
    await waitFor(() => expect(document.title).toBe('Home — SYSTEM'))

    const screens: readonly (readonly [string, string])[] = [
      ['/quests', 'Quests — SYSTEM'],
      ['/quests/new', 'New Quest — SYSTEM'],
      ['/quests/tpl_none/edit', 'Edit Quest — SYSTEM'],
      ['/weekly', 'Weekly — SYSTEM'],
      ['/weekly/edit', 'Weekly Goals — SYSTEM'],
      ['/weekly/history', 'Weekly History — SYSTEM'],
      ['/report', 'Daily Report — SYSTEM'],
      ['/status', 'Status — SYSTEM'],
      ['/status/history', 'Daily History — SYSTEM'],
      ['/achievements', 'Achievements — SYSTEM'],
      ['/nowhere', 'Page not found — SYSTEM'],
      ['/', 'Home — SYSTEM'],
    ]
    for (const [path, title] of screens) {
      await act(() => router.navigate(path))
      await waitFor(() => expect(document.title).toBe(title))
    }
  })
})

describe('a new screen starts at the top', () => {
  beforeEach(() => {
    scrollTo().mockClear()
  })

  it('puts the page back at the top when the path changes', async () => {
    const { router } = renderApp({ path: '/status' })
    await screen.findByRole('heading', { name: 'STATUS' })
    expect(scrollTo()).not.toHaveBeenCalled() // opening the app leaves the scroll position alone

    await act(() => router.navigate('/quests'))
    await screen.findByRole('heading', { name: 'QUESTS' })
    expect(scrollTo()).toHaveBeenCalledTimes(1)
    expect(scrollTo()).toHaveBeenLastCalledWith(0, 0)

    await act(() => router.navigate(-1)) // going back is a new screen too
    await screen.findByRole('heading', { name: 'STATUS' })
    expect(scrollTo()).toHaveBeenCalledTimes(2)
  })

  it("turns off the browser's own scroll restoring, which landed Back part-way down a half-loaded screen", async () => {
    // jsdom has no such property (real browsers do, and start at 'auto'), so give it one for this test.
    Object.defineProperty(window.history, 'scrollRestoration', { configurable: true, writable: true, value: 'auto' })
    try {
      renderApp()
      await screen.findByRole('heading', { name: 'SYSTEM' })
      await waitFor(() => expect(window.history.scrollRestoration).toBe('manual'))
    } finally {
      Reflect.deleteProperty(window.history, 'scrollRestoration')
    }
  })

  it('leaves the scroll position alone when only the query changes or the same path is opened again', async () => {
    const { router } = renderApp({ path: '/quests' })
    await screen.findByRole('heading', { name: 'QUESTS' })

    await act(() => router.navigate('/quests?view=archived'))
    await act(() => router.navigate('/quests'))
    expect(scrollTo()).not.toHaveBeenCalled()
  })
})
