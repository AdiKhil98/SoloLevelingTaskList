import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// UI tests run the real runtime (domain, persistence, a fake IndexedDB), so a
// loaded machine can make one take far longer than usual. Generous limits keep
// them deterministic without weakening any assertion.
configure({ asyncUtilTimeout: 5_000 })
vi.setConfig({ testTimeout: 20_000 })

// Domain, application and persistence suites run without a DOM; only touch it where there is one.
const hasDom = typeof window !== 'undefined'

if (hasDom) {
  // jsdom has no canvas: without this it logs "not implemented" for every 2D context. A null context is what the
  // particle burst already handles (it ends at once), so effects tests assert on the loop's life cycle directly.
  HTMLCanvasElement.prototype.getContext = () => null
}

afterEach(() => {
  cleanup()
  if (!hasDom) return
  // Effect settings live in localStorage; no test may see another's.
  try {
    window.localStorage.clear()
  } catch {
    // storage unavailable in this environment: nothing to clear
  }
})
