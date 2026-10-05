/**
 * The app icon (Phase 12): original, app-owned geometry in the SYSTEM palette. A violet hexagon ring with a
 * generic double up-chevron ("level up") inside it and one small cyan accent, on the near-black background. There
 * is no lettering, no character art and no third-party mark.
 *
 * Everything is defined once, in unit coordinates (0..1), and used by BOTH the PNG rasterizer (`render.ts`) and the
 * SVG writer (`svg.ts`), so the favicon and the launcher icons can never drift apart. The colours are the design
 * tokens in `src/styles/globals.css`.
 */

export type Point = readonly [number, number]
export type Rgb = readonly [number, number, number]

export const COLORS = {
  background: '#07060d', // --background
  surface: '#0d0b17', // --surface
  violetLight: '#c4b5fd',
  violet: '#a78bfa', // --accent
  violetDeep: '#7c3aed', // --accent-strong
  foreground: '#ececf4', // --foreground
  cyan: '#22d3ee', // --accent-2
} as const

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/**
 * `rounded`: the "any" launcher icon and the favicon (a rounded dark square, transparent corners).
 * `full`: full-bleed dark square, for the maskable icon (the platform applies its own mask) and the Apple touch icon.
 * All artwork stays inside the central circle of radius 0.4, which is the maskable safe zone.
 */
export type IconVariant = 'rounded' | 'full'

export const CORNER_RADIUS = 0.22

const CENTER = 0.5
const HEX_OUTER = 0.36
const HEX_INNER = 0.27

/** A pointy-top regular hexagon around the centre. */
export function hexagon(radius: number): Point[] {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 3
    return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)] as const
  })
}

/** An upward chevron: the area between a "^" and the same "^" moved down by `thickness`. */
function chevron(apexY: number): Point[] {
  const halfWidth = 0.16
  const height = 0.11
  const thickness = 0.055
  return [
    [CENTER - halfWidth, apexY + height],
    [CENTER, apexY],
    [CENTER + halfWidth, apexY + height],
    [CENTER + halfWidth, apexY + height + thickness],
    [CENTER, apexY + thickness],
    [CENTER - halfWidth, apexY + height + thickness],
  ]
}

/** The cyan accent: a small diamond set into the ring's top vertex. */
function diamond(): Point[] {
  const y = CENTER - (HEX_OUTER + HEX_INNER) / 2
  const half = 0.045
  return [
    [CENTER, y - half],
    [CENTER + half, y],
    [CENTER, y + half],
    [CENTER - half, y],
  ]
}

export const SHAPES = {
  hexOuter: hexagon(HEX_OUTER),
  hexInner: hexagon(HEX_INNER),
  chevronUpper: chevron(0.37),
  chevronLower: chevron(0.465),
  diamond: diamond(),
} as const

/** The ring is filled with a vertical gradient between these two y positions. */
export const RING_GRADIENT = { fromY: CENTER - HEX_OUTER, toY: CENTER + HEX_OUTER } as const

/** The glow behind the hexagon: strongest at the centre, gone at radius 0.5, falling off as (1 - r/0.5)². */
export const GLOW = { radius: 0.5, strength: 0.4 } as const
export const INNER_FILL_ALPHA = 0.85
