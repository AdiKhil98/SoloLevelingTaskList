import { useEffect, useState, type ReactNode } from 'react'
import { LoadingScreen } from '@/app/StartupScreens'
import { markPlayerAwakened } from './identity'

/**
 * Test helper component: marks the database in `factory` as belonging to an awakened (or legacy) player first,
 * and only then mounts its children (the app). It never touches a database it is not mounted for.
 */
export function AwakenedGate({ factory, children }: { factory: IDBFactory; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    void markPlayerAwakened(factory).then(() => {
      if (live) setReady(true)
    })
    return () => {
      live = false
    }
  }, [factory])
  return ready ? children : <LoadingScreen />
}
