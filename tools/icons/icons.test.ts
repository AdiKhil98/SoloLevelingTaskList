// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COLORS, SHAPES } from './geometry.ts'
import { FAVICON_FILE, PNG_ICONS } from './generate.ts'
import { decodePng, encodePng } from './png.ts'
import { ANDROID_ICONS } from './generateAndroid.ts'
import { FOREGROUND_SCALE, renderIcon, type Raster } from './render.ts'
import { renderFaviconSvg } from './svg.ts'

const publicFile = (file: string) => readFileSync(new URL(`../../public/${file}`, import.meta.url))
const pixel = ({ width, data }: Raster, x: number, y: number) => Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4))

describe('the PNG codec', () => {
  it('round-trips a raster exactly (all row filters decode)', () => {
    const width = 13
    const height = 9
    const data = new Uint8Array(width * height * 4)
    for (let i = 0; i < data.length; i += 1) data[i] = (i * 37 + (i % 7) * 11 + Math.floor(i / 29)) & 255
    expect(decodePng(encodePng({ width, height, data })).data).toEqual(data)
  })

  it('rejects something that is not a PNG', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/Not a PNG/)
  })
})

describe('the committed icons', () => {
  it.each(PNG_ICONS)('$file is a real PNG of $size×$size', ({ file, size }) => {
    const png = decodePng(publicFile(file))
    expect(png.width).toBe(size)
    expect(png.height).toBe(size)
  })

  // The two smallest icons are re-rendered here (the 512 px ones take seconds); `npm run icons` regenerates all four,
  // and one geometry feeds every size, so a drifted generator or a hand-edited file shows up here.
  it.each(PNG_ICONS.filter((icon) => icon.size < 256))('$file is exactly what the generator renders now', ({ file, size, variant }) => {
    const committed = decodePng(publicFile(file))
    const fresh = renderIcon(size, variant)
    expect(Buffer.compare(Buffer.from(committed.data), Buffer.from(fresh.data))).toBe(0)
  })

  it('favicon.svg is exactly what the generator writes, and references nothing external', () => {
    const svg = publicFile(FAVICON_FILE).toString('utf8')
    expect(svg).toBe(renderFaviconSvg())
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/)
    expect(svg).not.toMatch(/<image|<script|href=/)
  })
})

describe('the icon design', () => {
  const rounded = renderIcon(96, 'rounded')
  const full = renderIcon(96, 'full')

  it('the rounded icon has transparent corners; the full-bleed icon is opaque everywhere', () => {
    expect(pixel(rounded, 0, 0)[3]).toBe(0)
    expect(pixel(rounded, 95, 95)[3]).toBe(0)
    expect(pixel(rounded, 48, 2)[3]).toBe(255)
    for (const [x, y] of [[0, 0], [95, 0], [0, 95], [95, 95]] as const) expect(pixel(full, x, y)[3]).toBe(255)
  })

  it('is on the SYSTEM background (near-black) away from the artwork', () => {
    const [r, g, b] = pixel(full, 2, 48)
    expect(Math.max(r!, g!, b!)).toBeLessThan(40)
  })

  it('has the violet ring, the light chevron and the cyan accent where the geometry says', () => {
    const at = (point: readonly [number, number]) => pixel(full, Math.round(point[0] * 96), Math.round(point[1] * 96))
    const ringPoint: [number, number] = [(SHAPES.hexOuter[1]![0] + SHAPES.hexInner[1]![0]) / 2, (SHAPES.hexOuter[1]![1] + SHAPES.hexInner[1]![1]) / 2]
    const ring = at(ringPoint)
    expect(ring[2]).toBeGreaterThan(ring[1]!) // violet: blue above green
    expect(ring[0]).toBeGreaterThan(80)
    const chevron = at([0.5, 0.405])
    expect(chevron[0]).toBeGreaterThan(200) // the near-white upper chevron
    const diamond = at([0.5, (SHAPES.hexOuter[0]![1] + SHAPES.hexInner[0]![1]) / 2])
    expect(diamond[0]).toBeLessThan(80) // cyan: low red, high green and blue
    expect(diamond[1]).toBeGreaterThan(160)
    expect(diamond[2]).toBeGreaterThan(200)
  })

  it('keeps all artwork inside the maskable safe zone (radius 0.4 around the centre)', () => {
    const all = [SHAPES.hexOuter, SHAPES.hexInner, SHAPES.chevronUpper, SHAPES.chevronLower, SHAPES.diamond].flat()
    for (const [x, y] of all) expect(Math.hypot(x - 0.5, y - 0.5)).toBeLessThanOrEqual(0.4)
  })

  it('uses only the design-token palette', () => {
    expect(Object.values(COLORS)).toEqual(['#07060d', '#0d0b17', '#c4b5fd', '#a78bfa', '#7c3aed', '#ececf4', '#22d3ee'])
  })
})

const androidFile = (file: string) => readFileSync(new URL(`../../android/app/src/main/res/${file}`, import.meta.url))

describe('the Android launcher icons (APK)', () => {
  it.each(ANDROID_ICONS)('$file is a real PNG of $size×$size', ({ file, size }) => {
    const png = decodePng(androidFile(file))
    expect(png.width).toBe(size)
    expect(png.height).toBe(size)
  })

  // The smallest density of each icon is re-rendered here; `npm run icons:android` regenerates all of them.
  it.each(ANDROID_ICONS.filter((icon) => icon.size <= 72))('$file is exactly what the generator renders now', ({ file, size, variant }) => {
    const committed = decodePng(androidFile(file))
    const fresh = renderIcon(size, variant)
    expect(Buffer.compare(Buffer.from(committed.data), Buffer.from(fresh.data))).toBe(0)
  })

  it('the adaptive foreground is transparent artwork that stays inside the 66 dp safe circle of its 108 dp canvas', () => {
    const size = 108
    const foreground = renderIcon(size, 'foreground')
    expect(pixel(foreground, 0, 0)[3]).toBe(0)
    expect(pixel(foreground, 107, 107)[3]).toBe(0)
    expect(pixel(foreground, 54, 54)[3]).toBeGreaterThan(200) // the artwork is there
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (pixel(foreground, x, y)[3]! >= 128) expect(Math.hypot(x + 0.5 - 54, y + 0.5 - 54)).toBeLessThanOrEqual(33)
      }
    }
    expect(FOREGROUND_SCALE).toBeCloseTo(33 / 108 / 0.4, 10)
  })

  it('the legacy round icon is a dark circle with transparent corners', () => {
    const round = renderIcon(96, 'circle')
    expect(pixel(round, 0, 0)[3]).toBe(0)
    expect(pixel(round, 95, 0)[3]).toBe(0)
    expect(pixel(round, 48, 2)[3]).toBeGreaterThan(200)
  })
})
