import { useEffect, useRef } from 'react'
import { runBurstLoop, type FrameHost } from './burstLoop'
import { createBurst, particleAlpha, particleBudget, type Burst, type BurstStyle } from './particles'

interface ParticleBurstProps {
  /** Particles before the device-capability reduction. */
  count: number
  /** The longest a particle lives; the burst ends by itself within this time. */
  durationMs: number
  style: BurstStyle
  /** Called once when the burst ends on its own. The parent then unmounts the canvas. */
  onDone?: () => void
}

/** Violet and cyan, as in the SYSTEM palette. */
const TINTS = ['167, 139, 250', '34, 211, 238'] as const
const SPRITE_SIZE = 32
/** The canvas is drawn at no more than this device-pixel ratio (a phone's 3x would triple the fill cost for nothing). */
const MAX_PIXEL_RATIO = 1.5

/** One soft dot per tint, drawn once and stamped for every particle (no per-particle blur or gradient). */
function makeSprites(): HTMLCanvasElement[] | null {
  const sprites: HTMLCanvasElement[] = []
  for (const tint of TINTS) {
    const sprite = document.createElement('canvas')
    sprite.width = SPRITE_SIZE
    sprite.height = SPRITE_SIZE
    const context = sprite.getContext('2d')
    if (context === null) return null
    const gradient = context.createRadialGradient(SPRITE_SIZE / 2, SPRITE_SIZE / 2, 0, SPRITE_SIZE / 2, SPRITE_SIZE / 2, SPRITE_SIZE / 2)
    gradient.addColorStop(0, `rgba(${tint}, 1)`)
    gradient.addColorStop(0.4, `rgba(${tint}, 0.45)`)
    gradient.addColorStop(1, `rgba(${tint}, 0)`)
    context.fillStyle = gradient
    context.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
    sprites.push(sprite)
  }
  return sprites
}

/** The real browser's frame and visibility, behind the loop's injectable interface. */
const browserFrameHost: FrameHost = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
  isHidden: () => document.hidden,
  onVisibilityChange: (listener) => {
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
  },
}

/**
 * A one-time burst of violet and cyan particles over its parent (which must be
 * positioned). It exists only while an earned moment is on screen: it draws a
 * bounded number of particles for at most `durationMs`, then stops its
 * animation-frame loop, clears itself and reports `onDone`, so nothing keeps
 * running afterwards. A hidden page ends it at once, and a slow device sheds
 * particles instead of stuttering. Where a canvas is unavailable it ends
 * immediately. Reduced effects never mount it.
 */
export function ParticleBurst({ count, durationMs, style, onDone }: ParticleBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d') ?? null
    const sprites = canvas === null || context === null ? null : makeSprites()
    if (canvas === null || context === null || sprites === null) {
      onDoneRef.current?.()
      return
    }

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    const width = Math.max(1, canvas.clientWidth)
    const height = Math.max(1, canvas.clientHeight)
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)

    const burst = createBurst({
      count: particleBudget(count, navigator.hardwareConcurrency),
      durationMs,
      width,
      height,
      style,
      random: Math.random,
    })
    const draw = (current: Burst) => {
      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = 'lighter'
      for (let index = 0; index < current.active; index += 1) {
        const alpha = particleAlpha(current, index)
        if (alpha <= 0) continue
        const sprite = sprites[current.tint[index] ?? 0]
        if (sprite === undefined) continue
        const size = (current.size[index] ?? 2) * 2.4
        context.globalAlpha = alpha
        context.drawImage(sprite, (current.x[index] ?? 0) - size / 2, (current.y[index] ?? 0) - size / 2, size, size)
      }
      context.globalAlpha = 1
    }
    const loop = runBurstLoop({
      burst,
      draw,
      clear: () => context.clearRect(0, 0, width, height),
      host: browserFrameHost,
      onDone: () => onDoneRef.current?.(),
    })
    return () => loop.stop()
  }, [count, durationMs, style])

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
}
