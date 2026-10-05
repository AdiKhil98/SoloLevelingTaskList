import { COLORS, CORNER_RADIUS, GLOW, INNER_FILL_ALPHA, RING_GRADIENT, SHAPES, type Point } from './geometry.ts'

/** The favicon, drawn from the same geometry as the PNG icons (`render.ts`), layer for layer. */
const VIEW = 512

const n = (value: number) => Number((value * VIEW).toFixed(2))

function polygon(points: readonly Point[]): string {
  return points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')
}

function path(...rings: readonly (readonly Point[])[]): string {
  return rings.map((ring) => `M${polygon(ring).replaceAll(' ', ' L')}Z`).join(' ')
}

export function renderFaviconSvg(): string {
  const radius = n(CORNER_RADIUS)
  const glowStops = [0, 0.25, 0.5, 0.75, 1]
    .map((at) => `<stop offset="${at}" stop-color="${COLORS.violetDeep}" stop-opacity="${(GLOW.strength * (1 - at) ** 2).toFixed(3)}"/>`)
    .join('')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}">`,
    '<defs>',
    `<radialGradient id="glow" cx="${VIEW / 2}" cy="${VIEW / 2}" r="${n(GLOW.radius)}" gradientUnits="userSpaceOnUse">${glowStops}</radialGradient>`,
    `<linearGradient id="ring" x1="0" y1="${n(RING_GRADIENT.fromY)}" x2="0" y2="${n(RING_GRADIENT.toY)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${COLORS.violetLight}"/><stop offset="1" stop-color="${COLORS.violetDeep}"/></linearGradient>`,
    '</defs>',
    `<rect width="${VIEW}" height="${VIEW}" rx="${radius}" fill="${COLORS.background}"/>`,
    `<circle cx="${VIEW / 2}" cy="${VIEW / 2}" r="${n(GLOW.radius)}" fill="url(#glow)"/>`,
    `<path d="${path(SHAPES.hexInner)}" fill="${COLORS.surface}" fill-opacity="${INNER_FILL_ALPHA}"/>`,
    `<path d="${path(SHAPES.hexOuter, SHAPES.hexInner)}" fill="url(#ring)" fill-rule="evenodd"/>`,
    `<polygon points="${polygon(SHAPES.chevronLower)}" fill="${COLORS.violet}"/>`,
    `<polygon points="${polygon(SHAPES.chevronUpper)}" fill="${COLORS.foreground}"/>`,
    `<polygon points="${polygon(SHAPES.diamond)}" fill="${COLORS.cyan}"/>`,
    '</svg>',
    '',
  ].join('\n')
}
