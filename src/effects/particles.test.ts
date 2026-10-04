import { describe, expect, it, vi } from 'vitest'
import { MAX_FRAME_MS, runBurstLoop, SLOW_FRAME_MS, type FrameHost } from './burstLoop'
import { createBurst, particleAlpha, particleBudget, stepBurst, thinBurst } from './particles'

/** A small deterministic random source (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const options = (overrides = {}) => ({ count: 40, durationMs: 1_000, width: 300, height: 600, style: 'radial' as const, random: seeded(1), ...overrides })

describe('the particle simulation', () => {
  it('is deterministic for a given random source', () => {
    const a = createBurst(options())
    const b = createBurst(options())
    expect(Array.from(a.x)).toEqual(Array.from(b.x))
    expect(Array.from(a.lifeMs)).toEqual(Array.from(b.lifeMs))
  })

  it('allocates exactly the requested particles and never respawns them', () => {
    const burst = createBurst(options())
    expect(burst.capacity).toBe(40)
    let alive = stepBurst(burst, 16)
    expect(alive).toBeLessThanOrEqual(40)
    for (let time = 0; time < 1_200; time += 16) alive = stepBurst(burst, 16)
    expect(alive).toBe(0) // all dead: a burst always ends by itself
    expect(stepBurst(burst, 16)).toBe(0) // and stays ended
  })

  it('fades each particle from full to nothing and keeps alpha in [0, 1]', () => {
    const burst = createBurst(options({ count: 5 }))
    expect(particleAlpha(burst, 0)).toBe(1)
    for (let time = 0; time < 1_100; time += 50) {
      stepBurst(burst, 50)
      for (let index = 0; index < 5; index += 1) expect(particleAlpha(burst, index)).toBeGreaterThanOrEqual(0)
    }
    expect(particleAlpha(burst, 0)).toBe(0)
  })

  it('a particle never outlives the burst duration', () => {
    const burst = createBurst(options())
    expect(Math.max(...Array.from(burst.lifeMs))).toBeLessThanOrEqual(1_000)
  })

  it('rise bursts start along the bottom edge and move up', () => {
    const burst = createBurst(options({ style: 'rise', count: 20 }))
    for (let index = 0; index < 20; index += 1) {
      expect(burst.y[index]).toBeGreaterThan(600 * 0.8)
      expect(burst.vy[index]).toBeLessThan(0)
    }
  })

  it('sheds load by thinning, and uses fewer particles on low-core devices', () => {
    const burst = createBurst(options())
    thinBurst(burst)
    expect(burst.active).toBe(20)
    expect(particleBudget(100, 4)).toBe(60)
    expect(particleBudget(100, 8)).toBe(100)
    expect(particleBudget(100, undefined)).toBe(100)
  })
})

/** A frame host the test drives by hand. */
function fakeHost(hidden = false) {
  let nextHandle = 1
  const pending = new Map<number, (now: number) => void>()
  const listeners = new Set<() => void>()
  const state = { hidden }
  const host: FrameHost = {
    request: (callback) => {
      const handle = nextHandle
      nextHandle += 1
      pending.set(handle, callback)
      return handle
    },
    cancel: (handle) => void pending.delete(handle),
    isHidden: () => state.hidden,
    onVisibilityChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    host,
    pending: () => pending.size,
    listeners: () => listeners.size,
    /** Runs the one waiting frame at `now`. */
    frame(now: number) {
      const [handle, callback] = [...pending.entries()][0] ?? []
      if (handle === undefined || callback === undefined) throw new Error('no frame is waiting')
      pending.delete(handle)
      callback(now)
    },
    setHidden(next: boolean) {
      state.hidden = next
      for (const listener of [...listeners]) listener()
    },
  }
}

function startLoop(host: FrameHost, burstOptions = {}) {
  const onDone = vi.fn()
  const clear = vi.fn()
  const draw = vi.fn()
  const burst = createBurst(options(burstOptions))
  const loop = runBurstLoop({ burst, draw, clear, host, onDone })
  return { loop, onDone, clear, draw, burst }
}

describe('the burst loop life cycle', () => {
  it('requests frames only while the burst is alive, then stops, clears and reports done', () => {
    const fake = fakeHost()
    const { onDone, clear, draw } = startLoop(fake.host, { durationMs: 200, count: 10 })
    expect(fake.pending()).toBe(1)

    let now = 0
    while (fake.pending() > 0) {
      now += 16
      fake.frame(now)
      expect(now).toBeLessThan(2_000) // never runs away
    }
    expect(draw).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalled()
    expect(fake.pending()).toBe(0) // no frame left scheduled
    expect(fake.listeners()).toBe(0) // no listener left behind
  })

  it('does not run at all, and ends at once, when the page is already hidden', () => {
    const fake = fakeHost(true)
    const { onDone, draw } = startLoop(fake.host)
    expect(fake.pending()).toBe(0)
    expect(draw).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('stops its loop when the page is hidden mid-burst (no background animation)', () => {
    const fake = fakeHost()
    const { onDone } = startLoop(fake.host)
    fake.frame(16)
    expect(fake.pending()).toBe(1)
    fake.setHidden(true)
    expect(fake.pending()).toBe(0)
    expect(fake.listeners()).toBe(0)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('stop() (unmount) cancels the waiting frame and the listener without reporting done', () => {
    const fake = fakeHost()
    const { loop, onDone, clear } = startLoop(fake.host)
    expect(fake.pending()).toBe(1)
    loop.stop()
    expect(fake.pending()).toBe(0)
    expect(fake.listeners()).toBe(0)
    expect(clear).toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    loop.stop() // safe twice
    expect(onDone).not.toHaveBeenCalled()
  })

  it('a stalled frame cannot teleport the particles: time per frame is capped', () => {
    const fake = fakeHost()
    const { burst } = startLoop(fake.host, { durationMs: 10_000 })
    fake.frame(0)
    fake.frame(60_000) // a one-minute stall
    expect(burst.elapsedMs).toBeLessThanOrEqual(16 + MAX_FRAME_MS)
  })

  it('sheds particles after several slow frames instead of stuttering', () => {
    const fake = fakeHost()
    const { burst } = startLoop(fake.host, { durationMs: 10_000, count: 100 })
    let now = 0
    fake.frame(now)
    for (let frame = 0; frame < 3; frame += 1) {
      now += SLOW_FRAME_MS + 10
      fake.frame(now)
    }
    expect(burst.active).toBe(50)
  })
})
