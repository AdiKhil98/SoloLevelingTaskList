import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EFFECTS_SETTINGS_KEY } from '@/effects/settings'
import { TEST_TIMINGS } from '@/test/presentationTimings'
import { renderApp } from '@/test/renderApp'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const panel = async () => within(await screen.findByRole('region', { name: 'SYSTEM SETTINGS' }))
const stored = () => JSON.parse(window.localStorage.getItem(EFFECTS_SETTINGS_KEY) ?? 'null') as Record<string, unknown> | null

describe('System Settings (effects, haptics, sound)', () => {
  it('lives on the Status page with the approved defaults: effects NORMAL, haptics ON, sound OFF', async () => {
    renderApp({ path: '/status' })
    const settings = await panel()
    expect(settings.getByRole('radio', { name: 'NORMAL' })).toBeChecked()
    expect(settings.getByRole('radio', { name: 'REDUCED' })).not.toBeChecked()
    expect(settings.getByRole('switch', { name: /Haptics/ })).toBeChecked()
    expect(settings.getByRole('switch', { name: /Sound/ })).not.toBeChecked()
    expect(settings.getByText('Saved on this device only. Not part of backups.')).toBeInTheDocument()
    expect(stored()).toBeNull() // nothing is written until the player changes something
  })

  it('saves a choice in localStorage and keeps it after a restart', async () => {
    const first = renderApp({ path: '/status' })
    fireEvent.click((await panel()).getByRole('radio', { name: 'REDUCED' }))
    expect(stored()).toEqual({ effects: 'reduced', haptics: true, sound: false })
    first.unmount()

    renderApp({ path: '/status' })
    expect((await panel()).getByRole('radio', { name: 'REDUCED' })).toBeChecked()
  })

  it('turning sound on is a user gesture that unlocks audio and confirms with a soft cue', async () => {
    const playSound = vi.fn()
    const unlockSound = vi.fn(async () => true)
    renderApp({ path: '/status', presentation: { timings: TEST_TIMINGS, playSound, unlockSound, vibrate: () => true } })
    fireEvent.click((await panel()).getByRole('switch', { name: /Sound/ }))
    expect(stored()).toMatchObject({ sound: true })
    expect(unlockSound).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(playSound).toHaveBeenCalledWith('quest'))
  })

  it('says so, and stays quiet, when the browser cannot play sound', async () => {
    const playSound = vi.fn()
    renderApp({ path: '/status', presentation: { timings: TEST_TIMINGS, playSound, unlockSound: async () => false, vibrate: () => true } })
    fireEvent.click((await panel()).getByRole('switch', { name: /Sound/ }))
    expect(await screen.findByText('Sound is not available in this browser.')).toBeInTheDocument()
    expect(playSound).not.toHaveBeenCalled()
  })

  it('haptics: switching on gives a light confirmation, switching off stores the choice and is silent', async () => {
    const vibrate = vi.fn(() => true)
    renderApp({ path: '/status', presentation: { timings: TEST_TIMINGS, vibrate, playSound: vi.fn(), unlockSound: async () => true } })
    const switchEl = (await panel()).getByRole('switch', { name: /Haptics/ })
    fireEvent.click(switchEl) // off
    expect(stored()).toMatchObject({ haptics: false })
    expect(vibrate).not.toHaveBeenCalled()
    fireEvent.click(switchEl) // on again
    expect(stored()).toMatchObject({ haptics: true })
    expect(vibrate).toHaveBeenCalledWith([15])
  })

  it('tells the player when the device itself asks for reduced motion', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined })))
    renderApp({ path: '/status' })
    expect(await screen.findByText('This device asks for reduced motion, so effects are reduced whatever you choose here.')).toBeInTheDocument()
  })

  it('is keyboard operable (native radios and switches)', async () => {
    renderApp({ path: '/status' })
    const settings = await panel()
    expect(settings.getByRole('radio', { name: 'NORMAL' }).tagName).toBe('INPUT')
    expect(settings.getByRole('switch', { name: /Sound/ }).tagName).toBe('INPUT')
    expect(settings.getByRole('group', { name: 'Effects' })).toBeInTheDocument()
  })

  it('never reaches progression: changing every setting writes nothing to the database', async () => {
    const { factory } = renderApp({ path: '/status' })
    const settings = await panel()
    fireEvent.click(settings.getByRole('radio', { name: 'REDUCED' }))
    fireEvent.click(settings.getByRole('switch', { name: /Haptics/ }))
    const { openDatabase, listXpTransactions } = await import('@/persistence')
    const database = await openDatabase({ factory })
    try {
      expect(await listXpTransactions(database)).toEqual([])
    } finally {
      database.close()
    }
  })
})
