import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

export type WeeklyFlash = 'created' | 'updated'

export const WEEKLY_FLASH_TEXT: Readonly<Record<WeeklyFlash, string>> = {
  created: 'Goal Crushers set for this week.',
  updated: 'Weekly board updated.',
}

function isWeeklyFlash(value: unknown): value is WeeklyFlash {
  return typeof value === 'string' && Object.hasOwn(WEEKLY_FLASH_TEXT, value)
}

/**
 * A one-shot confirmation handed over by the board editor in the navigation
 * state. Read once on mount, then cleared from the history entry, so a reload or
 * a later visit never replays it. Purely presentational.
 */
export function useWeeklyFlash(): WeeklyFlash | null {
  const location = useLocation()
  const navigate = useNavigate()
  const [notice] = useState<WeeklyFlash | null>(() => {
    const state: unknown = location.state
    const candidate = typeof state === 'object' && state !== null ? (state as { notice?: unknown }).notice : undefined
    return isWeeklyFlash(candidate) ? candidate : null
  })

  const { pathname, search } = location
  useEffect(() => {
    if (notice !== null) navigate(`${pathname}${search}`, { replace: true, state: null })
  }, [notice, navigate, pathname, search])

  return notice
}
