import { stepBurst, thinBurst, type Burst } from './particles'

/**
 * The animation-frame side of a particle burst, separated from the canvas so
 * its life cycle can be tested: it runs frames only while the page is visible,
 * ends by itself when the burst is over, and leaves nothing scheduled when it
 * stops.
 */
export interface FrameHost {
  request(callback: (now: number) => void): number
  cancel(handle: number): void
  isHidden(): boolean
  /** Calls `listener` when the page is hidden or shown; returns the unsubscribe. */
  onVisibilityChange(listener: () => void): () => void
}

export interface BurstLoopOptions {
  readonly burst: Burst
  readonly draw: (burst: Burst) => void
  readonly clear: () => void
  readonly host: FrameHost
  /** Called once when the burst ends on its own (all particles dead, or the page was hidden). Not called by `stop`. */
  readonly onDone: () => void
}

export interface BurstLoopHandle {
  /** Stops now without calling `onDone` (used on unmount). Safe to call twice. */
  stop(): void
}

/** No frame advances time by more than this (a stalled tab must not teleport the particles). */
export const MAX_FRAME_MS = 50
/** A frame slower than this counts toward thinning the burst. */
export const SLOW_FRAME_MS = 34
const SLOW_FRAMES_BEFORE_THINNING = 3
const MAX_THINNINGS = 2

export function runBurstLoop({ burst, draw, clear, host, onDone }: BurstLoopOptions): BurstLoopHandle {
  let handle = 0
  let lastNow: number | null = null
  let stopped = false
  let slowFrames = 0
  let thinnings = 0

  const release = () => {
    stopped = true
    if (handle !== 0) host.cancel(handle)
    handle = 0
    unsubscribe()
  }
  const finish = () => {
    if (stopped) return
    release()
    clear()
    onDone()
  }

  const frame = (now: number) => {
    handle = 0
    if (stopped) return
    const dt = lastNow === null ? 16 : Math.min(Math.max(now - lastNow, 0), MAX_FRAME_MS)
    lastNow = now

    if (dt > SLOW_FRAME_MS && thinnings < MAX_THINNINGS) {
      slowFrames += 1
      if (slowFrames >= SLOW_FRAMES_BEFORE_THINNING) {
        thinBurst(burst)
        thinnings += 1
        slowFrames = 0
      }
    } else {
      slowFrames = 0
    }

    const alive = stepBurst(burst, dt)
    draw(burst)
    if (alive === 0) finish()
    else handle = host.request(frame)
  }

  const unsubscribe = host.onVisibilityChange(() => {
    if (host.isHidden()) finish() // the moment has passed while the player was away: no loop in the background
  })

  if (host.isHidden()) finish()
  else handle = host.request(frame)

  return {
    stop() {
      if (stopped) return
      release()
      clear()
    },
  }
}
