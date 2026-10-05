import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/renderApp'

/**
 * Phase 12: the app asks the browser (once, silently) to protect its stored data from eviction, after it has reached
 * `ready`. The answer is never shown and nothing depends on it.
 */
function stubStorage(persist: () => Promise<boolean>, persisted: () => Promise<boolean> = async () => false) {
  const manager = { persist: vi.fn(persist), persisted: vi.fn(persisted) }
  Object.defineProperty(navigator, 'storage', { configurable: true, value: manager })
  return manager
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage')
  vi.restoreAllMocks()
})

const homeReady = () => screen.findByRole('heading', { name: 'SYSTEM' })

describe('persistent storage request', () => {
  it('is made once after Home is ready, however much the player navigates', async () => {
    const storage = stubStorage(async () => true)
    renderApp()
    await homeReady()
    await waitFor(() => expect(storage.persist).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('link', { name: 'Status' }))
    await screen.findByRole('heading', { name: 'STATUS' })
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    await homeReady()

    expect(storage.persist).toHaveBeenCalledOnce()
  })

  it('is still made only once under StrictMode', async () => {
    const storage = stubStorage(async () => true)
    renderApp({ strictMode: true })
    await homeReady()
    await waitFor(() => expect(storage.persist).toHaveBeenCalled())
    expect(storage.persist).toHaveBeenCalledOnce()
  })

  it('is not asked again when the storage is already persistent', async () => {
    const storage = stubStorage(async () => true, async () => true)
    renderApp()
    await homeReady()
    await waitFor(() => expect(storage.persisted).toHaveBeenCalledOnce())
    expect(storage.persist).not.toHaveBeenCalled()
  })

  it('is NOT made during a first launch, and is made once the player reaches the app', async () => {
    const storage = stubStorage(async () => true)
    renderApp({ awakened: false })
    fireEvent.click(await screen.findByRole('button', { name: 'ACCEPT' }))
    await screen.findByRole('heading', { name: 'IDENTIFY YOURSELF' })
    fireEvent.change(screen.getByLabelText('PLAYER NAME'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
    await screen.findByRole('heading', { name: 'AWAKENING COMPLETE' })
    expect(storage.persist).not.toHaveBeenCalled() // the identity is saved, but the app has not started yet

    fireEvent.click(screen.getByRole('button', { name: 'BEGIN' }))
    await homeReady()

    await waitFor(() => expect(storage.persist).toHaveBeenCalledOnce())
  })

  it('a refusal is invisible: no message, no notice, no log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const storage = stubStorage(async () => false)
    renderApp()
    await homeReady()
    await waitFor(() => expect(storage.persist).toHaveBeenCalledOnce())

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    for (const status of screen.queryAllByRole('status')) expect(status).toHaveTextContent(/^$/) // Home's own status line stays empty
    expect(document.body).not.toHaveTextContent(/storage|persist|protected/i)
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('a failing or throwing API is harmless: the app starts and works normally', async () => {
    const storage = stubStorage(() => Promise.reject(new Error('NotAllowedError')))
    renderApp()
    await homeReady()
    await waitFor(() => expect(storage.persist).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: /^Complete Fajr/ }))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())
  })

  it('is simply skipped where the API does not exist (plain HTTP, old browsers)', async () => {
    expect(navigator.storage).toBeUndefined()
    renderApp()
    await homeReady()
    expect(screen.getByRole('button', { name: /^Complete Fajr/ })).toBeEnabled()
  })

  it('shows nothing about storage anywhere in Settings (Phase 12 keeps it invisible)', async () => {
    stubStorage(async () => true)
    renderApp({ path: '/status' })
    await screen.findByRole('heading', { name: 'STATUS' })
    expect(document.body).not.toHaveTextContent(/PROTECTED|STORAGE:|STANDARD/)
  })
})
