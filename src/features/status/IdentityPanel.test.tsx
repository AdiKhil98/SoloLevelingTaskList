import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newFactory } from '@/application/test-utils/helpers'
import { getPlayerProfile, openDatabase } from '@/persistence'
import { flakyWrites } from '@/test/flakyWrites'
import { markPlayerAwakened } from '@/test/identity'
import { renderApp } from '@/test/renderApp'

afterEach(() => {
  vi.restoreAllMocks()
})

const statusReady = () => screen.findByRole('heading', { name: 'STATUS' })
const identity = () => screen.getByRole('region', { name: 'IDENTITY' })
const playerStatus = () => screen.getByRole('region', { name: 'Player status' })

async function profileOf(factory: IDBFactory) {
  const database = await openDatabase({ factory })
  try {
    return await getPlayerProfile(database)
  } finally {
    database.close()
  }
}

async function rename(value: string) {
  fireEvent.click(within(identity()).getByRole('button', { name: /Edit name/ }))
  fireEvent.change(screen.getByLabelText('Player name'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
}

describe('Status → IDENTITY', () => {
  it('shows the generic PLAYER for a player who never chose a name', async () => {
    renderApp({ path: '/status' })
    await statusReady()
    expect(within(identity()).getByText('PLAYER')).toBeInTheDocument()
    expect(within(playerStatus()).getByText('PLAYER')).toBeInTheDocument()
  })

  it('renames in place: the new name shows at once on Status and on Home, and it is stored', async () => {
    const { factory } = renderApp({ path: '/status' })
    await statusReady()

    await rename('Ada')

    expect(await screen.findByText('Name saved.')).toBeInTheDocument()
    expect(within(identity()).getByText('Ada')).toBeInTheDocument()
    expect(within(playerStatus()).getByText('Ada')).toBeInTheDocument()
    expect(screen.queryByLabelText('Player name')).not.toBeInTheDocument() // the editor closed
    expect(await profileOf(factory)).toMatchObject({ status: 'valid', profile: { name: 'Ada' } })

    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(await screen.findByRole('region', { name: 'Ada' })).toBeInTheDocument()
  })

  it('the name survives a reload', async () => {
    const factory = newFactory()
    const first = renderApp({ factory, path: '/status' })
    await statusReady()
    await rename('אדי')
    await screen.findByText('Name saved.')
    first.unmount()

    renderApp({ factory, path: '/status' })
    await statusReady()
    expect(within(identity()).getByText('אדי')).toBeInTheDocument()
  })

  it('renaming never replays Awakening, and the player stays on Status', async () => {
    renderApp({ path: '/status' })
    await statusReady()
    await rename('Ada')
    await screen.findByText('Name saved.')
    expect(screen.queryByRole('button', { name: 'ACCEPT' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'CONNECTION ESTABLISHED' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'STATUS' })).toBeInTheDocument()
  })

  it('renaming does not touch progression: level, EXP and the quest history are identical', async () => {
    renderApp({ path: '/' })
    fireEvent.click(await screen.findByRole('button', { name: /^Complete Fajr/ }))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('link', { name: 'Status' }))
    await statusReady()
    // Every value of the PLAYER STATUS window except its first row (the name).
    const progression = () => Array.from(playerStatus().querySelectorAll('dd')).slice(1).map((value) => value.textContent)
    const before = progression()
    expect(before).toContain('10') // lifetime EXP from the one completed quest

    await rename('Ada')
    await screen.findByText('Name saved.')

    expect(progression()).toEqual(before)
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(await screen.findByText('10 / 100')).toBeInTheDocument()
  })

  it('a long name wraps inside its Status row instead of pushing the row wider than its window (a phone-width layout rule)', async () => {
    renderApp({ path: '/status' })
    await statusReady()
    await rename('W'.repeat(20))
    await screen.findByText('Name saved.')
    const value = within(playerStatus()).getByText('W'.repeat(20)).closest('dd')
    expect(value?.className).toContain('[overflow-wrap:anywhere]')
    expect(value?.className).not.toContain('shrink-0')
  })

  it('a blank name goes back to PLAYER', async () => {
    renderApp({ path: '/status' })
    await statusReady()
    await rename('Ada')
    await screen.findByText('Name saved.')

    await rename('   ')
    await waitFor(() => expect(within(identity()).getByText('PLAYER')).toBeInTheDocument())
  })

  it('trims the name and refuses one that is too long or has unusable characters, keeping the old name', async () => {
    const { factory } = renderApp({ path: '/status' })
    await statusReady()
    await rename('  Ada  ')
    await screen.findByText('Name saved.')
    expect(within(identity()).getByText('Ada')).toBeInTheDocument()

    fireEvent.click(within(identity()).getByRole('button', { name: /Edit name/ }))
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: 'a'.repeat(21) } })
    expect(screen.getByText('Use 20 characters or fewer.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(screen.getByLabelText('Player name')).toBeInTheDocument() // still editing: nothing was saved
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: 'Ad​a' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(screen.getByLabelText('Player name')).toBeInTheDocument()
    expect(await profileOf(factory)).toMatchObject({ profile: { name: 'Ada' } })
  })

  it('Cancel keeps the stored name and returns focus to the Edit button', async () => {
    renderApp({ path: '/status' })
    await statusReady()
    fireEvent.click(within(identity()).getByRole('button', { name: /Edit name/ }))
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: 'Unsaved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(within(identity()).getByText('PLAYER')).toBeInTheDocument()
    await waitFor(() => expect(within(identity()).getByRole('button', { name: /Edit name/ })).toHaveFocus())
  })

  it('the editor starts from the stored name and its field is labelled, focused-ready and described', async () => {
    renderApp({ path: '/status' })
    await statusReady()
    await rename('Ada')
    await screen.findByText('Name saved.')

    fireEvent.click(within(identity()).getByRole('button', { name: /Edit name/ }))
    const input = screen.getByLabelText('Player name')
    expect(input).toHaveValue('Ada')
    expect(input).toHaveAccessibleDescription(/Up to 20 characters.*Leave it empty to be called PLAYER/)
  })

  it('a failed save keeps the old name and the editor, and says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const base = newFactory()
    await markPlayerAwakened(base)
    const { factory, control } = flakyWrites(base)
    renderApp({ factory, path: '/status', awakened: false })
    await statusReady()

    control.failStores.add('playerProfile')
    await rename('Ada')

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(screen.getByLabelText('Player name')).toHaveValue('Ada') // the draft is kept for a retry
    expect(await profileOf(base)).toMatchObject({ profile: { name: null } })

    control.failStores.clear()
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(await screen.findByText('Name saved.')).toBeInTheDocument()
    expect(await profileOf(base)).toMatchObject({ profile: { name: 'Ada' } })
  })

  it('a double tap on SAVE saves once', async () => {
    renderApp({ path: '/status' })
    await statusReady()
    fireEvent.click(within(identity()).getByRole('button', { name: /Edit name/ }))
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: 'Ada' } })
    const save = screen.getByRole('button', { name: 'SAVE' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(await screen.findByText('Name saved.')).toBeInTheDocument()
  })

  it('repairs a database whose profile row went missing: renaming recreates it and the player is not sent to Awakening', async () => {
    const factory = newFactory()
    const first = renderApp({ factory, path: '/status' })
    await statusReady()
    first.unmount()
    // Damage: delete the profile row, leaving every quest in place.
    const database = await openDatabase({ factory })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.openTransaction(['playerProfile'], 'readwrite')
      transaction.objectStore('playerProfile').delete('player')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    renderApp({ factory, path: '/status', awakened: false })
    await statusReady() // not Awakening: the quests prove this player already started
    expect(within(identity()).getByText('PLAYER')).toBeInTheDocument()
    await rename('Ada')
    await screen.findByText('Name saved.')
    expect(await profileOf(factory)).toMatchObject({ status: 'valid', profile: { name: 'Ada' } })
  })
})
