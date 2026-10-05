/**
 * Test doubles for the service worker (Phase 12): an in-memory `CacheStorage` that behaves like the real one where
 * it matters (a stored response is a snapshot, a missing cache is created by `open`), and a fake network that, like
 * a single-page-app host, answers any file it does not know with the index page and status 200.
 *
 * Test-only. Not imported by the worker.
 */
import type { RequestLike, ShellEntry, ShellKind, ShellManifest, ShellWorkerEnvironment } from './core'

interface StoredResponse {
  readonly body: ArrayBuffer
  readonly status: number
  readonly headers: [string, string][]
}

export class FakeCache {
  readonly entries = new Map<string, StoredResponse>()
  /** How many times something was written into this cache (an active cache must never change). */
  writes = 0

  async match(url: string): Promise<Response | undefined> {
    const stored = this.entries.get(url)
    return stored === undefined ? undefined : new Response(stored.body.slice(0), { status: stored.status, headers: stored.headers })
  }

  async put(url: string, response: Response): Promise<void> {
    this.writes += 1
    this.entries.set(url, {
      body: await response.arrayBuffer(),
      status: response.status,
      headers: [...response.headers.entries()],
    })
  }
}

export class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>()

  async keys(): Promise<string[]> {
    return [...this.caches.keys()]
  }

  async open(name: string): Promise<FakeCache> {
    let cache = this.caches.get(name)
    if (cache === undefined) {
      cache = new FakeCache()
      this.caches.set(name, cache)
    }
    return cache
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name)
  }

  /** Test helper: a complete cache as an earlier, successful install would have left it. */
  async seedComplete(name: string, origin: string, urls: readonly string[]): Promise<FakeCache> {
    const cache = await this.open(name)
    for (const url of urls) await cache.put(new URL(url, origin).href, new Response(`cached:${url}`, { headers: { 'content-type': 'text/plain' } }))
    await cache.put(new URL('/__sltl-shell-complete__', origin).href, new Response('{}'))
    cache.writes = 0
    return cache
  }
}

export const ORIGIN = 'https://sltl.example'
export const INDEX_HTML = '<!doctype html><div id="root"></div>'

export function entry(url: string, kind: ShellKind): ShellEntry {
  return { url, kind }
}

/** A small but representative build: the page, hashed chunks, a stylesheet, a font, the manifest and an icon. */
export function sampleManifest(buildId = '0123456789abcdef'): ShellManifest {
  return {
    buildId,
    entries: [
      entry('/index.html', 'html'),
      entry('/assets/index-aaa.js', 'script'),
      entry('/assets/Awakening-bbb.js', 'script'),
      entry('/assets/index-ccc.css', 'style'),
      entry('/assets/oxanium-ddd.woff2', 'font'),
      entry('/manifest.webmanifest', 'manifest'),
      entry('/icons/icon-192.png', 'image'),
    ],
  }
}

const CONTENT_TYPES: Record<ShellKind, string> = {
  html: 'text/html; charset=utf-8',
  script: 'text/javascript',
  style: 'text/css',
  font: 'font/woff2',
  image: 'image/png',
  manifest: 'application/manifest+json',
  other: 'application/octet-stream',
}

export type NetworkAnswer = Response | (() => Response | Promise<Response>)

export interface FakeNetwork {
  readonly fetch: ShellWorkerEnvironment['fetch']
  /** Every request the worker made, in order. */
  readonly requests: (Request | RequestLike)[]
  /** Replace what one path answers with (a Response, or a function producing one). */
  override(path: string, answer: NetworkAnswer): void
}

/** Serves every manifest file with the right type; ANY other path gets the index page with status 200, like a SPA host. */
export function createNetwork(manifest: ShellManifest): FakeNetwork {
  const overrides = new Map<string, NetworkAnswer>()
  const requests: (Request | RequestLike)[] = []
  return {
    requests,
    override: (path, answer) => void overrides.set(path, answer),
    async fetch(request) {
      requests.push(request)
      const path = new URL(request.url).pathname
      const override = overrides.get(path)
      if (override !== undefined) return typeof override === 'function' ? override() : override.clone()
      const known = manifest.entries.find((item) => item.url === path)
      if (known === undefined) return new Response(INDEX_HTML, { status: 200, headers: { 'content-type': CONTENT_TYPES.html } })
      return new Response(known.kind === 'html' ? INDEX_HTML : `body:${path}`, { status: 200, headers: { 'content-type': CONTENT_TYPES[known.kind] } })
    },
  }
}

export function navigation(path: string, accept = 'text/html,application/xhtml+xml'): RequestLike {
  return { method: 'GET', url: new URL(path, ORIGIN).href, mode: 'navigate', headers: new Headers({ accept }) }
}

export function subresource(path: string, init: { mode?: RequestMode; method?: string } = {}): RequestLike {
  return { method: init.method ?? 'GET', url: new URL(path, ORIGIN).href, mode: init.mode ?? 'cors', headers: new Headers({ accept: '*/*' }) }
}
