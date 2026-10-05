import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { createFakeShellUpdates } from '@/test/fakeShellUpdates'
import { UpdateNotice } from './UpdateNotice'

function renderNotice(initial: Parameters<typeof createFakeShellUpdates>[0], path = '/') {
  const fake = createFakeShellUpdates(initial)
  const router = createMemoryRouter([{ path: '*', element: <UpdateNotice source={fake.updates} /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { ...fake, router }
}

const notice = () => screen.queryByRole('status')
const restartButton = () => screen.getByRole('button', { name: 'RESTART' })

describe('UpdateNotice', () => {
  it('renders nothing while there is no update', () => {
    renderNotice({})
    expect(notice()).not.toBeInTheDocument()
  })

  it('says SYSTEM UPDATE AVAILABLE with RESTART and LATER when an update is ready', () => {
    renderNotice({ updateReady: true })
    expect(notice()).toHaveTextContent('SYSTEM UPDATE AVAILABLE')
    expect(restartButton()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'LATER' })).toBeEnabled()
  })

  it('appears when the update becomes ready later', () => {
    const { set } = renderNotice({})
    expect(notice()).not.toBeInTheDocument()
    act(() => set({ updateReady: true }))
    expect(notice()).toHaveTextContent('SYSTEM UPDATE AVAILABLE')
  })

  it('RESTART is the player’s action: it calls restart, once per press, and nothing else happens on its own', () => {
    const { restart, later } = renderNotice({ updateReady: true })
    expect(restart).not.toHaveBeenCalled()

    fireEvent.click(restartButton())

    expect(restart).toHaveBeenCalledOnce()
    expect(later).not.toHaveBeenCalled()
  })

  it('shows a busy state and disables both buttons while the new build takes over', () => {
    renderNotice({ updateReady: true })
    fireEvent.click(restartButton())

    expect(screen.getByRole('button', { name: 'RESTARTING...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'LATER' })).toBeDisabled()
  })

  it('LATER hides the notice (for the session) without restarting', () => {
    const { restart, later } = renderNotice({ updateReady: true })

    fireEvent.click(screen.getByRole('button', { name: 'LATER' }))

    expect(later).toHaveBeenCalledOnce()
    expect(restart).not.toHaveBeenCalled()
    expect(notice()).not.toBeInTheDocument()
  })

  it('stays hidden once dismissed, even though the update is still ready', () => {
    renderNotice({ updateReady: true, dismissed: true })
    expect(notice()).not.toBeInTheDocument()
  })

  describe('on a form route (unsaved edits may exist)', () => {
    it.each(['/quests/new', '/quests/abc-123/edit', '/weekly/edit'])('shows no RESTART on %s', (path) => {
      renderNotice({ updateReady: true }, path)
      expect(notice()).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'RESTART' })).not.toBeInTheDocument()
    })

    it('remembers the update and shows the notice once the player has left the form', async () => {
      const { router, restart } = renderNotice({ updateReady: true }, '/quests/new')
      expect(notice()).not.toBeInTheDocument()

      await act(() => router.navigate('/quests'))

      expect(notice()).toHaveTextContent('SYSTEM UPDATE AVAILABLE')
      expect(restart).not.toHaveBeenCalled() // nothing reloaded while the form was open, or when it closed
    })

    it('hides again if the player goes back into a form', async () => {
      const { router } = renderNotice({ updateReady: true }, '/status')
      expect(notice()).toBeInTheDocument()

      await act(() => router.navigate('/weekly/edit'))

      expect(notice()).not.toBeInTheDocument()
    })

    it('an update that becomes ready while on a form waits for the player to leave', async () => {
      const { router, set } = renderNotice({}, '/quests/new')
      act(() => set({ updateReady: true }))
      expect(notice()).not.toBeInTheDocument()

      await act(() => router.navigate('/'))

      expect(notice()).toBeInTheDocument()
    })
  })

  describe('blocked by another open app window', () => {
    it('says so calmly, instead of the plain update line, and keeps RESTART and LATER available', () => {
      renderNotice({ updateReady: true, blocked: true })

      const status = screen.getByRole('status')
      expect(status).toHaveTextContent('OTHER SYSTEM WINDOW OPEN')
      expect(status).toHaveTextContent('CLOSE IT TO RESTART')
      expect(status).not.toHaveTextContent('SYSTEM UPDATE AVAILABLE')
      expect(restartButton()).toBeEnabled()
      expect(screen.getByRole('button', { name: 'LATER' })).toBeEnabled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument() // still a polite status, never an alarm
    })

    it('leaves the RESTARTING state when the worker says it is blocked', () => {
      const { set } = renderNotice({ updateReady: true })
      fireEvent.click(restartButton())
      expect(screen.getByRole('button', { name: 'RESTARTING...' })).toBeDisabled()

      act(() => set({ applying: false, blocked: true })) // what the store does on the worker's answer

      expect(screen.queryByRole('button', { name: 'RESTARTING...' })).not.toBeInTheDocument()
      expect(restartButton()).toBeEnabled()
      expect(screen.getByRole('button', { name: 'LATER' })).toBeEnabled()
      expect(notice()).toHaveTextContent('OTHER SYSTEM WINDOW OPEN')
    })

    it('pressing RESTART again retries: it asks again and shows RESTARTING with the plain line', () => {
      const { restart } = renderNotice({ updateReady: true, blocked: true })

      fireEvent.click(restartButton())

      expect(restart).toHaveBeenCalledOnce()
      expect(screen.getByRole('button', { name: 'RESTARTING...' })).toBeDisabled()
      expect(notice()).toHaveTextContent('SYSTEM UPDATE AVAILABLE')
      expect(notice()).not.toHaveTextContent('OTHER SYSTEM WINDOW OPEN')
    })

    it('LATER still hides it, and nothing restarts', () => {
      const { restart, later } = renderNotice({ updateReady: true, blocked: true })

      fireEvent.click(screen.getByRole('button', { name: 'LATER' }))

      expect(later).toHaveBeenCalledOnce()
      expect(restart).not.toHaveBeenCalled()
      expect(notice()).not.toBeInTheDocument()
    })

    it('still stays out of the way on a form route, and shows the blocked line once the form is left', async () => {
      const { router } = renderNotice({ updateReady: true, blocked: true }, '/quests/new')
      expect(notice()).not.toBeInTheDocument()

      await act(() => router.navigate('/quests'))

      expect(notice()).toHaveTextContent('OTHER SYSTEM WINDOW OPEN')
    })

    it('still reserves room at the bottom of the page for its (two-line) text', () => {
      renderNotice({ updateReady: true, blocked: true })
      expect(document.documentElement.style.getPropertyValue('--notice-space')).toMatch(/^\d+(\.\d+)?px$/)
    })
  })

  describe('reserved space (the last item can always be scrolled clear of the notice)', () => {
    const space = () => document.documentElement.style.getPropertyValue('--notice-space')

    it('reserves room while the notice shows and gives it back when it goes away', () => {
      const { set } = renderNotice({ updateReady: true })
      expect(space()).toMatch(/^\d+(\.\d+)?px$/)

      act(() => set({ dismissed: true }))
      expect(space()).toBe('')
    })

    it('reserves nothing while there is no notice, and nothing on a form route', async () => {
      const { router } = renderNotice({ updateReady: true }, '/quests/new')
      expect(space()).toBe('')

      await act(() => router.navigate('/quests'))
      expect(space()).not.toBe('')

      await act(() => router.navigate('/weekly/edit'))
      expect(space()).toBe('')
    })

    it('clears it when the notice unmounts', () => {
      const fake = createFakeShellUpdates({ updateReady: true })
      const router = createMemoryRouter([{ path: '*', element: <UpdateNotice source={fake.updates} /> }])
      const view = render(<RouterProvider router={router} />)
      expect(space()).not.toBe('')

      view.unmount()

      expect(space()).toBe('')
    })
  })

  describe('accessibility', () => {
    it('is a polite status region (not an alert), so it does not interrupt', () => {
      renderNotice({ updateReady: true })
      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('its controls are real buttons (keyboard operable), focusable, with touch-sized targets and a visible focus style', () => {
      renderNotice({ updateReady: true })
      for (const name of ['RESTART', 'LATER']) {
        const button = screen.getByRole('button', { name })
        expect(button.tagName).toBe('BUTTON')
        expect(button).toHaveAttribute('type', 'button')
        expect(button).toHaveClass('min-h-11', 'system-focus')
        button.focus()
        expect(button).toHaveFocus()
      }
    })

    it('RESTART is reached before LATER in the tab order', () => {
      renderNotice({ updateReady: true })
      const buttons = screen.getAllByRole('button').map((button) => button.textContent)
      expect(buttons).toEqual(['RESTART', 'LATER'])
    })

    it('never captures the page: it is pointer-transparent except for the notice itself', () => {
      renderNotice({ updateReady: true })
      expect(screen.getByRole('status')).toHaveClass('pointer-events-none')
      expect(restartButton().closest('.pointer-events-auto')).not.toBeNull()
    })
  })
})
