/// <reference types="node" />
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPlayerProfile, listTemplates, openDatabase } from '@/persistence'
import { renderApp } from '@/test/renderApp'

async function stored(factory: IDBFactory) {
  const database = await openDatabase({ factory })
  try {
    return { profile: await getPlayerProfile(database), templates: (await listTemplates(database)).length }
  } finally {
    database.close()
  }
}

const lab = () => screen.findByRole('heading', { name: 'EFFECTS LAB' })
const preview = () => screen.getByRole('dialog', { name: /Awakening preview/ })

async function walkToComplete(name: string) {
  fireEvent.click(await within(preview()).findByRole('button', { name: 'ACCEPT' }))
  fireEvent.change(await screen.findByLabelText('PLAYER NAME'), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))
}

describe('the DEV Awakening preview', () => {
  it('is a section of the effects lab with an explicit "never saves" note', async () => {
    renderApp({ path: '/dev/effects' })
    await lab()
    const section = screen.getByRole('region', { name: 'AWAKENING (FIRST LAUNCH)' })
    expect(within(section).getByRole('button', { name: 'Preview Awakening' })).toBeInTheDocument()
    expect(section).toHaveTextContent('never saves')
  })

  it('plays the whole sequence on synthetic state and closes itself at the end', async () => {
    renderApp({ path: '/dev/effects' })
    await lab()
    fireEvent.click(screen.getByRole('button', { name: 'Preview Awakening' }))

    expect(await within(preview()).findByRole('heading', { name: 'CONNECTION ESTABLISHED' })).toBeInTheDocument()
    await walkToComplete('Zed')
    expect(await within(preview()).findByRole('heading', { name: 'AWAKENING COMPLETE' })).toBeInTheDocument()
    fireEvent.click(within(preview()).getByRole('button', { name: 'BEGIN' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('It would have used the name Zed. Nothing was stored.')
  })

  it('NEVER modifies real state: not the stored profile, the quests, the player name on Status or Home, nor localStorage', async () => {
    const { factory, unmount } = renderApp({ path: '/dev/effects' })
    await lab()
    const before = await stored(factory)
    const storageBefore = JSON.stringify({ ...window.localStorage })
    expect(before.profile).toEqual({ status: 'valid', profile: { id: 'player', name: null, awakenedAt: null } })

    fireEvent.click(screen.getByRole('button', { name: 'Preview Awakening' }))
    await walkToComplete('Zed')
    fireEvent.click(await within(preview()).findByRole('button', { name: 'BEGIN' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // ... and a second run that is skipped half way.
    fireEvent.click(screen.getByRole('button', { name: 'Preview Awakening' }))
    await within(preview()).findByRole('button', { name: 'ACCEPT' })
    fireEvent.click(screen.getByRole('button', { name: 'Exit preview' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    expect(await stored(factory)).toEqual(before)
    expect(JSON.stringify({ ...window.localStorage })).toBe(storageBefore)
    unmount()
    renderApp({ factory, path: '/status' })
    expect(await screen.findByRole('region', { name: 'IDENTITY' })).toHaveTextContent('PLAYER')
    expect(screen.getByRole('region', { name: 'Player status' })).not.toHaveTextContent('Zed')
  })

  it('does not even hold a real name hostage: with a real name stored, the preview leaves it exactly as it was', async () => {
    const first = renderApp({ path: '/status' })
    fireEvent.click(await screen.findByRole('button', { name: /Edit name/ }))
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    await screen.findByText('Name saved.')
    first.unmount()

    const second = renderApp({ factory: first.factory, path: '/dev/effects', awakened: false })
    await lab()
    fireEvent.click(screen.getByRole('button', { name: 'Preview Awakening' }))
    await walkToComplete('Zed')
    fireEvent.click(await within(preview()).findByRole('button', { name: 'BEGIN' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(await stored(first.factory)).toMatchObject({ profile: { status: 'valid', profile: { name: 'Ada' } } })
    second.unmount()
  })

  it('"Preview (first save fails)" shows the failure path, then succeeds on the second try', async () => {
    renderApp({ path: '/dev/effects' })
    await lab()
    fireEvent.click(screen.getByRole('button', { name: 'Preview (first save fails)' }))
    await walkToComplete('Zed')

    expect(await within(preview()).findByRole('alert')).toHaveTextContent('could not be saved')
    expect(within(preview()).getByRole('heading', { name: 'IDENTIFY YOURSELF' })).toBeInTheDocument()
    fireEvent.click(within(preview()).getByRole('button', { name: 'CONFIRM' }))
    expect(await within(preview()).findByRole('heading', { name: 'AWAKENING COMPLETE' })).toBeInTheDocument()
  })

  it('has an always-reachable Exit preview button outside the sequence', async () => {
    renderApp({ path: '/dev/effects' })
    await lab()
    fireEvent.click(screen.getByRole('button', { name: 'Preview Awakening' }))
    const exit = await screen.findByRole('button', { name: 'Exit preview' })
    expect(preview()).toContainElement(exit)
    expect(within(preview()).getByRole('button', { name: 'ACCEPT' })).toBeInTheDocument()
    fireEvent.click(exit)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('the preview is development-only, like the lab that holds it', () => {
  function sources(directory: string): string[] {
    return readdirSync(directory, { recursive: true, encoding: 'utf8' })
      .filter((entry) => /\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry))
      .map((entry) => join(directory, entry))
  }

  it('is imported by the lab and by nothing else in the application', () => {
    const importers = sources('src').filter((file) => /AwakeningPreview/.test(readFileSync(file, 'utf8')) && !file.endsWith('AwakeningPreview.tsx'))
    expect(importers.map((file) => file.replace(/\\/g, '/'))).toEqual(['src/features/presentation/dev/EffectsLab.tsx'])
  })

  it('imports no application, persistence, platform or runtime-action code, so it cannot reach real state', () => {
    const source = readFileSync('src/features/presentation/dev/AwakeningPreview.tsx', 'utf8')
    const imports = source.match(/from '[^']+'/g) ?? []
    expect(imports.filter((entry) => /@\/application|@\/persistence|runtimeContext|AppRuntimeProvider|@\/platform/.test(entry))).toEqual([])
  })

  it('the real flow takes its save from the runtime provider only; the preview supplies a stub', () => {
    const provider = readFileSync('src/app/AppRuntimeProvider.tsx', 'utf8')
    expect(provider).toMatch(/<AwakeningFlow save=\{saveAwakening\}/)
    const flow = readFileSync('src/features/awakening/AwakeningFlow.tsx', 'utf8')
    expect((flow.match(/from '[^']+'/g) ?? []).filter((entry) => /@\/application|@\/persistence|runtimeContext|AppRuntimeProvider/.test(entry))).toEqual([])
  })

  it('the lab route (and so the preview) is guarded by the build-time DEV constant: exactly one guarded dynamic import', () => {
    const routes = readFileSync('src/app/routes.tsx', 'utf8')
    expect(routes).toMatch(/import\.meta\.env\.DEV\s*\n?\s*\?/)
    expect(routes.match(/import\('@\/features\/presentation\/dev\//g)).toHaveLength(1)
  })
})
