import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { isFlashNotice, type FlashNotice } from './questMessages'

/**
 * A one-shot confirmation ("Quest created.") handed over by the previous
 * screen in the navigation state. It is read once on mount and then cleared
 * from the history entry, so a reload or a later visit never replays it.
 * Purely presentational: it carries no data the screen depends on.
 */
export function useFlashNotice(): FlashNotice | null {
  const location = useLocation()
  const navigate = useNavigate()
  const [notice] = useState<FlashNotice | null>(() => {
    const state: unknown = location.state
    const candidate = typeof state === 'object' && state !== null ? (state as { notice?: unknown }).notice : undefined
    return isFlashNotice(candidate) ? candidate : null
  })

  const { pathname, search } = location
  useEffect(() => {
    if (notice !== null) navigate(`${pathname}${search}`, { replace: true, state: null })
  }, [notice, navigate, pathname, search])

  return notice
}
