import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { trackResumeListeners } from './resume'

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

  // Real browsers stamp animation frames on the same clock as `performance.now()`. jsdom stamps them on its own
  // window clock, which starts when the window is created, so in a long-lived test worker the two differ by seconds
  // and an animation that measures elapsed time against `performance.now()` (the count-up, typewriter, scramble)
  // sees a large negative elapsed time and sits at its start. Give each frame the shared clock's time instead.
  const requestFrame = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => requestFrame(() => callback(performance.now()))

  // The app attaches its resume listeners in an effect; tests wait for that precondition (see `resume.ts`).
  trackResumeListeners()
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
