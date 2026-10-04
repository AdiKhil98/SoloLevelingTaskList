/// <reference types="node" />
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildAppRoutes } from '@/app/routes'
import { listXpTransactions, openDatabase } from '@/persistence'
import { renderApp } from '@/test/renderApp'

const labPaths = (dev: boolean) => (buildAppRoutes({ dev })[0]?.children ?? []).map((route) => route.path).filter((path) => path?.startsWith('dev'))

describe('the development-only effects lab route', () => {
  it('exists in the development route table and NOT in the production one', () => {
    expect(labPaths(true)).toEqual(['dev/effects'])
    expect(labPaths(false)).toEqual([])
  })

  it('is part of every ordinary route table otherwise (nothing else changes between the two)', () => {
    const paths = (dev: boolean) => (buildAppRoutes({ dev })[0]?.children ?? []).map((route) => route.path ?? 'index').filter((path) => !path.startsWith('dev'))
    expect(paths(false)).toEqual(paths(true))
  })

  it('the production route build is guarded by the build-time constant, so the lab (and its chunk) is removed from production', () => {
    const source = readFileSync('src/app/routes.tsx', 'utf8')
    expect(source).toMatch(/import\.meta\.env\.DEV\s*\n?\s*\?/)
    expect(source).toContain("import('@/features/presentation/dev/EffectsLab')")
    // The dynamic import appears only inside that guarded expression.
    expect(source.match(/import\('@\/features\/presentation\/dev\/EffectsLab'\)/g)).toHaveLength(1)
  })

  it('only injects synthetic presentation events: it imports no application, persistence or runtime-action code', () => {
    for (const file of ['src/features/presentation/dev/EffectsLab.tsx', 'src/features/presentation/dev/syntheticEvents.ts']) {
      const source = readFileSync(file, 'utf8')
      const imports = source.match(/from '[^']+'/g) ?? []
      expect(imports.filter((entry) => /@\/application|@\/persistence|runtimeContext|AppRuntimeProvider|@\/platform/.test(entry))).toEqual([])
    }
  })

  it('renders the lab and plays synthetic events without writing to storage or settings', async () => {
    const { factory } = renderApp({ path: '/dev/effects' })
    expect(await screen.findByRole('heading', { name: 'EFFECTS LAB' })).toBeInTheDocument()
    const storageBefore = window.localStorage.length

    fireEvent.click(screen.getByRole('button', { name: 'Level Up (LV. 4 → 5)' }))
    expect(await screen.findByRole('dialog', { name: 'LEVEL UP' })).toHaveAccessibleDescription(/LV\. 4 to LV\. 5/)
    fireEvent.click(screen.getByRole('dialog', { name: 'LEVEL UP' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Score 10 — PERFECT WEEK' }))
    expect(await screen.findByRole('dialog', { name: 'PERFECT WEEK' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear queue' }))

    expect(window.localStorage.length).toBe(storageBefore)
    const database = await openDatabase({ factory })
    try {
      expect(await listXpTransactions(database)).toEqual([]) // no EXP, ever
    } finally {
      database.close()
    }
  })

  it('the lab is not a normal destination: it is not in the bottom navigation', async () => {
    renderApp({ path: '/' })
    await screen.findByRole('heading', { name: 'SYSTEM' })
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.includes('dev'))).toEqual([])
  })
})
