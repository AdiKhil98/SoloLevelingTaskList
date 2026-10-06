import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.ts'
import { renderIcon, type RenderVariant } from './render.ts'

/**
 * Generates the Android launcher icons for the APK (Phase 15) from the same geometry as the web icons, with nothing
 * but Node: `npm run icons:android`. The output is committed under `android/app/src/main/res/`; re-running it must
 * change nothing (a test compares the committed PNGs with a fresh render).
 *
 *  - `ic_launcher_foreground.png`: the adaptive-icon foreground (108 dp canvas) AND the Android 12+ splash icon.
 *  - `ic_launcher.png` / `ic_launcher_round.png`: the legacy icons for Android 7.x (48 dp), unused from Android 8 on.
 *
 * The adaptive icon's background is a solid colour (`values/ic_launcher_background.xml`), not an image.
 */
export interface AndroidIcon {
  /** Path below `android/app/src/main/res/`. */
  readonly file: string
  readonly size: number
  readonly variant: RenderVariant
}

/** Android density buckets: the scale of a dp at that density. */
const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
] as const

export const ANDROID_ICONS: readonly AndroidIcon[] = DENSITIES.flatMap(([density, scale]) => [
  { file: `mipmap-${density}/ic_launcher_foreground.png`, size: 108 * scale, variant: 'foreground' as const },
  { file: `mipmap-${density}/ic_launcher.png`, size: 48 * scale, variant: 'rounded' as const },
  { file: `mipmap-${density}/ic_launcher_round.png`, size: 48 * scale, variant: 'circle' as const },
])

function main(): void {
  const resDir = fileURLToPath(new URL('../../android/app/src/main/res/', import.meta.url))
  for (const { file, size, variant } of ANDROID_ICONS) {
    const target = `${resDir}${file}`
    mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true })
    const png = encodePng(renderIcon(size, variant))
    writeFileSync(target, png)
    console.log(`${file}  ${size}×${size}  ${variant}  ${png.length} bytes`)
  }
}

// Only when run directly (`node tools/icons/generateAndroid.ts`), not when a test imports the icon list.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main()
