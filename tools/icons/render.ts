import {
  COLORS,
  CORNER_RADIUS,
  GLOW,
  INNER_FILL_ALPHA,
  RING_GRADIENT,
  SHAPES,
  hexToRgb,
  type IconVariant,
  type Point,
  type Rgb,
} from './geometry.ts'

export interface Raster {
  readonly width: number
  readonly height: number
  /** Straight (non-premultiplied) RGBA, 8 bits per channel, row by row. */
  readonly data: Uint8Array
}

/** Samples per pixel edge (so 6 means 36 samples per pixel). Fixed, because the output must be reproducible. */
const SUPERSAMPLE = 6

type Premultiplied = [number, number, number, number]

/** One filled shape: its rings (a hole is just another ring) and the box around them, so most points skip the test. */
interface Shape {
  readonly rings: readonly (readonly Point[])[]
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

function shape(...rings: readonly (readonly Point[])[]): Shape {
  const points = rings.flat()
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return { rings, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

/** Even-odd point-in-shape test. */
function inside(x: number, y: number, { rings, minX, maxX, minY, maxY }: Shape): boolean {
  if (x < minX || x > maxX || y < minY || y > maxY) return false
  let result = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i] as Point
      const [xj, yj] = ring[j] as Point
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result
    }
  }
  return result
}

const HEX_INNER = shape(SHAPES.hexInner)
const RING = shape(SHAPES.hexOuter, SHAPES.hexInner)
const CHEVRON_LOWER = shape(SHAPES.chevronLower)
const CHEVRON_UPPER = shape(SHAPES.chevronUpper)
const DIAMOND = shape(SHAPES.diamond)

function insideRoundedSquare(x: number, y: number): boolean {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - CORNER_RADIUS), 0)
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - CORNER_RADIUS), 0)
  return dx * dx + dy * dy <= CORNER_RADIUS * CORNER_RADIUS
}

/** Source-over, premultiplied: `layer` is a colour with an alpha, composited onto `target` in place. */
function over(target: Premultiplied, [r, g, b]: Rgb, alpha: number): void {
  const keep = 1 - alpha
  target[0] = (r / 255) * alpha + target[0] * keep
  target[1] = (g / 255) * alpha + target[1] * keep
  target[2] = (b / 255) * alpha + target[2] * keep
  target[3] = alpha + target[3] * keep
}

const BACKGROUND = hexToRgb(COLORS.background)
const SURFACE = hexToRgb(COLORS.surface)
const VIOLET_LIGHT = hexToRgb(COLORS.violetLight)
const VIOLET = hexToRgb(COLORS.violet)
const VIOLET_DEEP = hexToRgb(COLORS.violetDeep)
const FOREGROUND = hexToRgb(COLORS.foreground)
const CYAN = hexToRgb(COLORS.cyan)

function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]
}

/** The colour of one point of the icon, premultiplied; the layers are the SVG's, in the same order. */
function sample(x: number, y: number, variant: IconVariant): Premultiplied {
  const pixel: Premultiplied = [0, 0, 0, 0]
  if (variant === 'rounded' && !insideRoundedSquare(x, y)) return pixel

  over(pixel, BACKGROUND, 1)

  const distance = Math.sqrt((x - 0.5) * (x - 0.5) + (y - 0.5) * (y - 0.5))
  if (distance < GLOW.radius) {
    const falloff = 1 - distance / GLOW.radius
    over(pixel, VIOLET_DEEP, GLOW.strength * falloff * falloff)
  }

  if (inside(x, y, HEX_INNER)) over(pixel, SURFACE, INNER_FILL_ALPHA)

  if (inside(x, y, RING)) {
    const t = Math.min(1, Math.max(0, (y - RING_GRADIENT.fromY) / (RING_GRADIENT.toY - RING_GRADIENT.fromY)))
    over(pixel, mix(VIOLET_LIGHT, VIOLET_DEEP, t), 1)
  }

  if (inside(x, y, CHEVRON_LOWER)) over(pixel, VIOLET, 1)
  if (inside(x, y, CHEVRON_UPPER)) over(pixel, FOREGROUND, 1)
  if (inside(x, y, DIAMOND)) over(pixel, CYAN, 1)
  return pixel
}

/** Renders the icon at `size` × `size` pixels with fixed 6×6 supersampling (deterministic: plain arithmetic only). */
export function renderIcon(size: number, variant: IconVariant): Raster {
  const data = new Uint8Array(size * size * 4)
  const step = 1 / SUPERSAMPLE
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const sum: Premultiplied = [0, 0, 0, 0]
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const s = sample((px + (sx + 0.5) * step) / size, (py + (sy + 0.5) * step) / size, variant)
          sum[0] += s[0]
          sum[1] += s[1]
          sum[2] += s[2]
          sum[3] += s[3]
        }
      }
      const count = SUPERSAMPLE * SUPERSAMPLE
      const alpha = sum[3] / count
      const offset = (py * size + px) * 4
      if (alpha > 0) {
        data[offset] = Math.round((sum[0] / count / alpha) * 255)
        data[offset + 1] = Math.round((sum[1] / count / alpha) * 255)
        data[offset + 2] = Math.round((sum[2] / count / alpha) * 255)
        data[offset + 3] = Math.round(alpha * 255)
      }
    }
  }
  return { width: size, height: size, data }
}
