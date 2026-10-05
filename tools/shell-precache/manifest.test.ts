// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseShellManifest } from '../../src/sw/core.ts'
import {
  buildShellManifest,
  computeBuildId,
  findForbiddenOutput,
  isShellFile,
  kindOf,
  readPrelude,
  renderPrelude,
  type OutputFile,
} from './manifest.ts'

const bytes = (text: string) => new TextEncoder().encode(text)
const file = (url: string, text: string): OutputFile => ({ url, content: bytes(text) })

const BUILD: readonly OutputFile[] = [
  file('/index.html', '<html>'),
  file('/assets/index-aaa.js', 'main'),
  file('/assets/Awakening-bbb.js', 'awakening'),
  file('/assets/index-ccc.css', 'css'),
  file('/assets/oxanium-ddd.woff2', 'font'),
  file('/manifest.webmanifest', '{}'),
  file('/icons/icon-192.png', 'png'),
  file('/favicon.svg', '<svg/>'),
]
const WORKER = bytes('worker v1')

describe('kindOf', () => {
  it.each([
    ['/index.html', 'html'],
    ['/assets/a.js', 'script'],
    ['/assets/a.mjs', 'script'],
    ['/assets/a.css', 'style'],
    ['/assets/a.woff2', 'font'],
    ['/icons/a.png', 'image'],
    ['/favicon.svg', 'image'],
    ['/manifest.webmanifest', 'manifest'],
    ['/robots.txt', 'other'],
    ['/LICENSE', 'other'],
    ['/dir.v2/noext', 'other'],
    ['/UPPER.JS', 'script'],
  ])('%s is %s', (url, kind) => {
    expect(kindOf(url)).toBe(kind)
  })
})

describe('isShellFile', () => {
  it('excludes the worker itself and source maps, and nothing else', () => {
    expect(isShellFile('/sw.js')).toBe(false)
    expect(isShellFile('/assets/index-aaa.js.map')).toBe(false)
    expect(isShellFile('/assets/index-aaa.js')).toBe(true)
    expect(isShellFile('/index.html')).toBe(true)
  })
})

describe('findForbiddenOutput', () => {
  it('flags the reference pack and the development effects lab, anywhere in the path', () => {
    expect(findForbiddenOutput(['/index.html', '/assets/index-aaa.js', '/icons/icon-192.png'])).toEqual([])
    expect(findForbiddenOutput(['/_reference/solo-leveling-effects-pack/x.png'])).toHaveLength(1)
    expect(findForbiddenOutput(['/dev/effects/index.html'])).toHaveLength(1)
    expect(findForbiddenOutput(['/assets/EffectsLab-abc.js'])).toHaveLength(1)
    expect(findForbiddenOutput(['/assets/effectslab-abc.js'])).toHaveLength(1)
  })

  it('does not flag names that merely contain "dev" or "reference"', () => {
    expect(findForbiddenOutput(['/assets/device-abc.js', '/assets/reference.js', '/assets/developer.css'])).toEqual([])
  })
})

describe('computeBuildId', () => {
  const id = (worker: Uint8Array = WORKER, files: readonly OutputFile[] = BUILD) => computeBuildId(worker, files)

  it('is 16 lowercase hex digits and deterministic', () => {
    expect(id()).toMatch(/^[0-9a-f]{16}$/)
    expect(id()).toBe(id())
  })

  it('does not depend on the order the files are listed in', () => {
    expect(id(WORKER, [...BUILD].reverse())).toBe(id())
  })

  it('changes when the SERVICE WORKER code changes (even if no application file did)', () => {
    expect(id(bytes('worker v2'))).not.toBe(id())
  })

  it('changes when a HASHED chunk changes', () => {
    expect(id(WORKER, BUILD.map((item) => (item.url === '/assets/index-aaa.js' ? file(item.url, 'main changed') : item)))).not.toBe(id())
  })

  it.each(['/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/favicon.svg'])('changes when the stable file %s changes', (url) => {
    expect(id(WORKER, BUILD.map((item) => (item.url === url ? file(url, 'different') : item)))).not.toBe(id())
  })

  it('changes when a file is added, removed or renamed', () => {
    expect(id(WORKER, [...BUILD, file('/extra.txt', 'x')])).not.toBe(id())
    expect(id(WORKER, BUILD.slice(1))).not.toBe(id())
    expect(id(WORKER, BUILD.map((item) => (item.url === '/assets/index-aaa.js' ? file('/assets/index-zzz.js', 'main') : item)))).not.toBe(id())
  })

  it('cannot be confused by moving bytes between the worker and a file name', () => {
    expect(id(bytes('worker v1/index.html'), BUILD.slice(1))).not.toBe(id())
  })
})

describe('buildShellManifest', () => {
  it('lists every shipped file once, sorted, with its kind, and never the worker or a source map', () => {
    const manifest = buildShellManifest(WORKER, [...BUILD, file('/sw.js', 'x'), file('/assets/index-aaa.js.map', '{}')])

    expect(manifest.entries.map((entry) => entry.url)).toEqual([...BUILD.map((item) => item.url)].sort())
    expect(manifest.entries.find((entry) => entry.url === '/index.html')?.kind).toBe('html')
    expect(manifest.entries.find((entry) => entry.url === '/assets/index-aaa.js')?.kind).toBe('script')
    expect(manifest.buildId).toBe(computeBuildId(WORKER, BUILD))
  })

  it('refuses to build when the output contains the reference pack or the dev lab', () => {
    expect(() => buildShellManifest(WORKER, [...BUILD, file('/_reference/x.png', 'x')])).toThrow(/_reference/)
    expect(() => buildShellManifest(WORKER, [...BUILD, file('/assets/EffectsLab-abc.js', 'x')])).toThrow(/effects lab/)
    expect(() => buildShellManifest(WORKER, [...BUILD, file('/dev/effects.html', 'x')])).toThrow(/\/dev/)
  })

  it('refuses to build without an index.html', () => {
    expect(() => buildShellManifest(WORKER, BUILD.filter((item) => item.url !== '/index.html'))).toThrow(/index\.html/)
  })

  it('produces exactly what the service worker accepts (the two sides cannot drift apart)', () => {
    const manifest = buildShellManifest(WORKER, BUILD)
    expect(parseShellManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest)
  })
})

describe('prelude', () => {
  it('round-trips the manifest and returns the worker code after it', () => {
    const manifest = buildShellManifest(WORKER, BUILD)
    const text = renderPrelude(manifest) + '(function(){})();\n'

    const read = readPrelude(text)

    expect(read?.manifest).toEqual(manifest)
    expect(read?.code).toBe('(function(){})();\n')
  })

  it('is a single line, so tools can find it without parsing JavaScript', () => {
    const prelude = renderPrelude(buildShellManifest(WORKER, BUILD))
    expect(prelude.endsWith(';\n')).toBe(true)
    expect(prelude.slice(0, -1).includes('\n')).toBe(false)
  })

  it('reads nothing from a worker that has no prelude', () => {
    expect(readPrelude('(function(){})();')).toBeNull()
  })
})
