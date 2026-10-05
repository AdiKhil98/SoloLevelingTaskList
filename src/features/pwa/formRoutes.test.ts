import { describe, expect, it } from 'vitest'
import { isUnsavedFormRoute } from './formRoutes'

describe('isUnsavedFormRoute', () => {
  it.each(['/quests/new', '/quests/new/', '/quests/abc-123/edit', '/quests/00000000-0000-4000-8000-000000000001/edit', '/quests/seed:fajr/edit', '/weekly/edit', '/weekly/edit/'])(
    '%s holds a form',
    (path) => {
      expect(isUnsavedFormRoute(path)).toBe(true)
    },
  )

  it.each([
    '/',
    '/quests',
    '/quests/',
    '/weekly',
    '/weekly/history',
    '/status',
    '/status/history',
    '/achievements',
    '/report',
    '/quests/new/extra',
    '/quests/abc/editing',
    '/quests//edit',
    '/quests/a/b/edit',
    '/weekly/edited',
    '/dev/effects',
  ])('%s does not', (path) => {
    expect(isUnsavedFormRoute(path)).toBe(false)
  })
})
