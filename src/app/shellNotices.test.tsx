import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as shellModule from '@/platform/shellUpdates'
import type { createFakeShellUpdates } from '@/test/fakeShellUpdates'
import { renderApp } from '@/test/renderApp'

// The application's service-worker update store is replaced by a controllable fake, so the REAL AppShell, routes
// and screens can be exercised with an update waiting.
vi.mock('@/platform/shellUpdates', async () => {
  const actual = await vi.importActual<typeof import('@/platform/shellUpdates')>('@/platform/shellUpdates')
  const { createFakeShellUpdates } = await import('@/test/fakeShellUpdates')
  const fake = createFakeShellUpdates()
  return { ...actual, shellUpdates: fake.updates, __fake: fake }
})

const fake = (shellModule as unknown as { __fake: ReturnType<typeof createFakeShellUpdates> }).__fake

beforeEach(() => {
  fake.set({ updateReady: false, applying: false, blocked: false, dismissed: false })
  fake.restart.mockClear()
  fake.later.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const homeReady = () => screen.findByRole('heading', { name: 'SYSTEM' })
const notice = () => screen.queryByText('SYSTEM UPDATE AVAILABLE')

describe('the update notice inside the real app shell', () => {
  it('appears on Home when an update is waiting, and the app keeps working underneath it', async () => {
    fake.set({ updateReady: true })
    renderApp()
    await homeReady()

    expect(notice()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Complete Fajr/ }))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())
    expect(fake.restart).not.toHaveBeenCalled() // playing never restarts anything
  })

  it('shows up while the player is using the app, without moving anything', async () => {
    renderApp()
    await homeReady()
    expect(notice()).not.toBeInTheDocument()

    act(() => fake.set({ updateReady: true }))

    // The notice follows the update store through a subscription that attaches in an effect; wait until it shows.
    await waitFor(() => expect(notice()).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Quests' })).toBeInTheDocument() // navigation is still there and usable
  })

  it('LATER lasts for the session: it stays hidden while the player moves between screens', async () => {
    fake.set({ updateReady: true })
    renderApp()
    await homeReady()

    fireEvent.click(screen.getByRole('button', { name: 'LATER' }))
    // Hiding follows the store through that subscription too: wait until it is gone, then check it stays gone.
    await waitFor(() => expect(notice()).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('link', { name: 'Status' }))
    await screen.findByRole('heading', { name: 'STATUS' })
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    await homeReady()
    expect(notice()).not.toBeInTheDocument()
  })

  it('RESTART is only ever the player’s tap', async () => {
    fake.set({ updateReady: true })
    renderApp()
    await homeReady()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fake.restart).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'RESTART' }))

    expect(fake.restart).toHaveBeenCalledOnce()
  })

  it.each(['/quests/new', '/weekly/edit'])('stays hidden on the form route %s, then shows when the player leaves it', async (path) => {
    fake.set({ updateReady: true })
    const { router } = renderApp({ path })
    await screen.findByRole('heading', { name: path === '/weekly/edit' ? /GOAL CRUSHERS|WEEKLY/ : 'NEW QUEST' })
    expect(notice()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'RESTART' })).not.toBeInTheDocument()

    await act(() => router.navigate('/status'))

    await screen.findByRole('heading', { name: 'STATUS' })
    expect(notice()).toBeInTheDocument()
    expect(fake.restart).not.toHaveBeenCalled()
  })

  it('when another app window blocks the restart it says so, keeps the app usable, and RESTART can be pressed again', async () => {
    fake.set({ updateReady: true, blocked: true })
    renderApp()
    await homeReady()

    expect(screen.getByText('OTHER SYSTEM WINDOW OPEN')).toBeInTheDocument()
    expect(screen.getByText('CLOSE IT TO RESTART')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Complete Fajr/ }))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument()) // playing is unaffected

    fireEvent.click(screen.getByRole('button', { name: 'RESTART' }))

    expect(fake.restart).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole('button', { name: 'RESTARTING...' })).toBeDisabled())
  })

  it('is hidden on the edit form of an existing quest too', async () => {
    fake.set({ updateReady: true })
    const { router } = renderApp({ path: '/quests' })
    await screen.findByRole('heading', { name: 'QUESTS' })
    expect(notice()).toBeInTheDocument()

    await act(() => router.navigate('/quests/00000000-0000-4000-8000-000000000001/edit'))

    expect(notice()).not.toBeInTheDocument()
  })

  it('never appears during a first launch (the Awakening screen replaces the whole app)', async () => {
    fake.set({ updateReady: true })
    renderApp({ awakened: false })
    await screen.findByRole('heading', { name: 'CONNECTION ESTABLISHED' })
    expect(notice()).not.toBeInTheDocument()
  })
})
