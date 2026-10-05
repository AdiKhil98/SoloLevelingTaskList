import { createHash } from 'node:crypto'

/**
 * The pure half of the shell-precache build step (Phase 12): which output files make up the offline shell, what
 * kind each one is, and the build id. `plugin.ts` does the file system and Vite work; everything here is a plain
 * function over bytes so it can be tested without a build.
 *
 * The manifest shape is the one `src/sw/core.ts` parses (`parseShellManifest`); a test keeps the two in step.
 */

export type ShellKind = 'html' | 'script' | 'style' | 'font' | 'image' | 'manifest' | 'other'

export interface ShellEntry {
  readonly url: string
  readonly kind: ShellKind
}

export interface ShellManifest {
  readonly buildId: string
  readonly entries: readonly ShellEntry[]
}

export interface OutputFile {
  /** Absolute path on the site, forward slashes (`/assets/index-abc.js`). */
  readonly url: string
  readonly content: Uint8Array
}

/** The worker itself is never part of the shell it manages. */
export const WORKER_URL = '/sw.js'
/** The service worker's global that carries the manifest (`SHELL_MANIFEST_GLOBAL` in `src/sw/core.ts`). */
export const MANIFEST_GLOBAL = '__SHELL_MANIFEST__'

const KIND_BY_EXTENSION: Readonly<Record<string, ShellKind>> = {
  '.html': 'html',
  '.js': 'script',
  '.mjs': 'script',
  '.css': 'style',
  '.woff2': 'font',
  '.woff': 'font',
  '.ttf': 'font',
  '.otf': 'font',
  '.png': 'image',
  '.svg': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.avif': 'image',
  '.gif': 'image',
  '.ico': 'image',
  '.webmanifest': 'manifest',
}

export function kindOf(url: string): ShellKind {
  const dot = url.lastIndexOf('.')
  if (dot === -1 || dot < url.lastIndexOf('/')) return 'other'
  return KIND_BY_EXTENSION[url.slice(dot).toLowerCase()] ?? 'other'
}

/** Source maps are development aids and the worker file is not part of its own shell. */
export function isShellFile(url: string): boolean {
  return url !== WORKER_URL && !url.endsWith('.map')
}

/**
 * Things that must never reach production output: the reference pack and the development-only effects lab. The
 * build fails rather than shipping (or precaching) any of them.
 */
const FORBIDDEN: readonly { readonly pattern: RegExp; readonly what: string }[] = [
  { pattern: /(^|\/)_reference(\/|$)/, what: 'the _reference directory' },
  { pattern: /(^|\/)dev(\/|$)/, what: 'a development-only /dev path' },
  { pattern: /effectslab/i, what: 'the development-only effects lab' },
]

export function findForbiddenOutput(urls: readonly string[]): string[] {
  return urls.flatMap((url) => FORBIDDEN.filter(({ pattern }) => pattern.test(url)).map(({ what }) => `${url} (${what})`))
}

export function sha256Hex(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * The build id covers the worker's own code (before the manifest is injected) AND every shell file's content, so
 * changing the worker logic, index.html, the manifest, an icon or any hashed chunk all produce a different id,
 * hence a different cache name and (because the injected manifest changes the worker's bytes) a browser update.
 *
 *   sha256( workerCode ‖ "\n" ‖ for each file sorted by url: "<url> <sha256 of file>\n" )  →  first 16 hex digits
 *
 * `scripts/verify-pwa.mjs` recomputes this independently from the built output.
 */
export function computeBuildId(workerCode: Uint8Array, files: readonly OutputFile[]): string {
  const hash = createHash('sha256')
  hash.update(workerCode)
  hash.update('\n')
  for (const file of [...files].sort(compareUrl)) hash.update(`${file.url} ${sha256Hex(file.content)}\n`)
  return hash.digest('hex').slice(0, 16)
}

function compareUrl(a: { url: string }, b: { url: string }): number {
  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0
}

/** Builds the manifest for the given output files (the worker file and source maps are excluded). */
export function buildShellManifest(workerCode: Uint8Array, outputFiles: readonly OutputFile[]): ShellManifest {
  const files = outputFiles.filter((file) => isShellFile(file.url))
  const forbidden = findForbiddenOutput(files.map((file) => file.url))
  if (forbidden.length > 0) throw new Error(`Production output must not contain: ${forbidden.join(', ')}`)
  if (!files.some((file) => file.url === '/index.html')) throw new Error('Production output has no /index.html')
  return {
    buildId: computeBuildId(workerCode, files),
    entries: [...files].sort(compareUrl).map((file) => ({ url: file.url, kind: kindOf(file.url) })),
  }
}

/** The one line placed in front of the worker code. It is a single JSON object so tools can read it back. */
export function renderPrelude(manifest: ShellManifest): string {
  return `self.${MANIFEST_GLOBAL}=${JSON.stringify(manifest)};\n`
}

const PRELUDE_PATTERN = new RegExp(`^self\\.${MANIFEST_GLOBAL}=(\\{.*\\});\\n`)

/** Reads the manifest back out of a finished `sw.js` (null if it has no prelude), and returns the code after it. */
export function readPrelude(text: string): { readonly manifest: ShellManifest; readonly code: string } | null {
  const match = PRELUDE_PATTERN.exec(text)
  if (match === null) return null
  return { manifest: JSON.parse(match[1] as string) as ShellManifest, code: text.slice(match[0].length) }
}
