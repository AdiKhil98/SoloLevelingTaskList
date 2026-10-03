import { RouterProvider } from 'react-router/dom'
import { systemClock } from '@/platform/clock'
import { AppRuntimeProvider, type AppRuntimeOptions } from './AppRuntimeProvider'
import { router } from './router'

// Module-level so its identity is stable across renders.
const RUNTIME_OPTIONS: AppRuntimeOptions = { clock: systemClock }

export function App() {
  return (
    <AppRuntimeProvider options={RUNTIME_OPTIONS}>
      <RouterProvider router={router} />
    </AppRuntimeProvider>
  )
}
