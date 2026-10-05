import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { IconVariant } from './geometry.ts'
import { encodePng } from './png.ts'
import { renderIcon } from './render.ts'
import { renderFaviconSvg } from './svg.ts'

/**
 * Generates the app icons into `public/` with nothing but Node: `npm run icons` (Node 23.6+ runs this TypeScript
 * directly). The output is committed; re-running it must change nothing (a test compares the committed PNGs'
 * pixels with a fresh render).
 */
export interface PngIcon {
  /** Path below `public/`. */
  readonly file: string
  readonly size: number
  readonly variant: IconVariant
}

export const PNG_ICONS: readonly PngIcon[] = [
  { file: 'icons/icon-192.png', size: 192, variant: 'rounded' },
  { file: 'icons/icon-512.png', size: 512, variant: 'rounded' },
  { file: 'icons/icon-maskable-512.png', size: 512, variant: 'full' },
  { file: 'icons/apple-touch-icon.png', size: 180, variant: 'full' },
]

export const FAVICON_FILE = 'favicon.svg'

function main(): void {
  const publicDir = fileURLToPath(new URL('../../public/', import.meta.url))
  mkdirSync(`${publicDir}icons`, { recursive: true })
  for (const { file, size, variant } of PNG_ICONS) {
    const png = encodePng(renderIcon(size, variant))
    writeFileSync(`${publicDir}${file}`, png)
    console.log(`${file}  ${size}×${size}  ${variant}  ${png.length} bytes`)
  }
  writeFileSync(`${publicDir}${FAVICON_FILE}`, renderFaviconSvg())
  console.log(`${FAVICON_FILE}  svg`)
}

// Only when run directly (`node tools/icons/generate.ts`), not when a test imports the icon list.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main()
