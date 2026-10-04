/**
 * A finite particle burst: a bounded number of particles that are born together,
 * move, fade and die. It never respawns, so a burst always ends by itself. The
 * simulation is plain arithmetic over typed arrays (no DOM, no canvas); the
 * random source is injected so tests are deterministic.
 */

export type BurstStyle = 'radial' | 'rise'

export interface Burst {
  /** Slots allocated. */
  readonly capacity: number
  /** Slots still simulated (thinning lowers it; those beyond are dead). */
  active: number
  readonly x: Float32Array
  readonly y: Float32Array
  readonly vx: Float32Array
  readonly vy: Float32Array
  /** Milliseconds each particle lives. */
  readonly lifeMs: Float32Array
  readonly ageMs: Float32Array
  readonly size: Float32Array
  /** 0 = violet, 1 = cyan. */
  readonly tint: Uint8Array
  elapsedMs: number
}

export interface BurstOptions {
  readonly count: number
  /** The longest any particle lives. */
  readonly durationMs: number
  readonly width: number
  readonly height: number
  readonly style: BurstStyle
  /** Returns a number in [0, 1). */
  readonly random: () => number
}

const MIN_LIFE_FRACTION = 0.45
const CYAN_SHARE = 0.22
/** Pixels per millisecond at speed 1. */
const BASE_SPEED = 0.16
const GRAVITY_PER_MS2 = 0.00012
const DRAG_PER_MS = 0.0006

export function createBurst({ count, durationMs, width, height, style, random }: BurstOptions): Burst {
  const capacity = Math.max(0, Math.floor(count))
  const burst: Burst = {
    capacity,
    active: capacity,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    lifeMs: new Float32Array(capacity),
    ageMs: new Float32Array(capacity),
    size: new Float32Array(capacity),
    tint: new Uint8Array(capacity),
    elapsedMs: 0,
  }
  for (let index = 0; index < capacity; index += 1) {
    if (style === 'radial') {
      const angle = random() * Math.PI * 2
      const speed = BASE_SPEED * (0.35 + random() * 0.9)
      burst.x[index] = width * (0.5 + (random() - 0.5) * 0.12)
      burst.y[index] = height * (0.42 + (random() - 0.5) * 0.1)
      burst.vx[index] = Math.cos(angle) * speed
      burst.vy[index] = Math.sin(angle) * speed
    } else {
      burst.x[index] = width * (0.08 + random() * 0.84)
      burst.y[index] = height * (0.82 + random() * 0.16)
      burst.vx[index] = (random() - 0.5) * BASE_SPEED * 0.5
      burst.vy[index] = -BASE_SPEED * (0.5 + random() * 0.9)
    }
    burst.lifeMs[index] = durationMs * (MIN_LIFE_FRACTION + random() * (1 - MIN_LIFE_FRACTION))
    burst.size[index] = 2 + random() * 4
    burst.tint[index] = random() < CYAN_SHARE ? 1 : 0
  }
  return burst
}

/**
 * Advances every live particle by `dtMs` and returns how many are still alive.
 * The burst is finished when that is 0.
 */
export function stepBurst(burst: Burst, dtMs: number): number {
  burst.elapsedMs += dtMs
  let alive = 0
  const drag = Math.max(0, 1 - DRAG_PER_MS * dtMs)
  for (let index = 0; index < burst.active; index += 1) {
    const age = (burst.ageMs[index] ?? 0) + dtMs
    burst.ageMs[index] = age
    if (age >= (burst.lifeMs[index] ?? 0)) continue
    burst.vx[index] = (burst.vx[index] ?? 0) * drag
    burst.vy[index] = (burst.vy[index] ?? 0) * drag + GRAVITY_PER_MS2 * dtMs
    burst.x[index] = (burst.x[index] ?? 0) + (burst.vx[index] ?? 0) * dtMs
    burst.y[index] = (burst.y[index] ?? 0) + (burst.vy[index] ?? 0) * dtMs
    alive += 1
  }
  return alive
}

/** Opacity of particle `index`: full at birth, fading to nothing at the end of its life. */
export function particleAlpha(burst: Burst, index: number): number {
  const life = burst.lifeMs[index] ?? 0
  if (life <= 0) return 0
  const progress = (burst.ageMs[index] ?? 0) / life
  return progress >= 1 ? 0 : Math.max(0, 1 - progress * progress)
}

/** Halves the simulated particles (a slow device sheds load instead of stuttering). */
export function thinBurst(burst: Burst): void {
  burst.active = Math.floor(burst.active / 2)
}

/** Fewer particles on low-core devices. */
export function particleBudget(base: number, hardwareConcurrency: number | undefined): number {
  return hardwareConcurrency !== undefined && hardwareConcurrency <= 4 ? Math.floor(base * 0.6) : base
}
