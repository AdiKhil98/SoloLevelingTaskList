import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// UI tests run the real runtime (domain, persistence, a fake IndexedDB), so a
// loaded machine can make one take far longer than usual. Generous limits keep
// them deterministic without weakening any assertion.
configure({ asyncUtilTimeout: 5_000 })
vi.setConfig({ testTimeout: 20_000 })

afterEach(() => {
  cleanup()
})
