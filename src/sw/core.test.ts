// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  assertUsableShellResponse,
  createShellWorker,
  parseShellManifest,
  SHELL_CACHE_PREFIX,
  type FetchEventLike,
  type RequestLike,
  type ShellManifest,
} from './core'
import { createNetwork, FakeCacheStorage, INDEX_HTML, navigation, ORIGIN, sampleManifest, subresource, type FakeNetwork } from './testing'

const ID = '0123456789abcdef'
const cacheName = (id = ID) => `${SHELL_CACHE_PREFIX}${id}`
const abs = (path: string) => new URL(path, ORIGIN).href
const MARKER = abs('/__sltl-shell-complete__')

function setup(manifest: ShellManifest = sampleManifest(ID)) {
  const caches = new FakeCacheStorage()
  const network = createNetwork(manifest)
  const skipWaiting = vi.fn(async () => undefined)
  const claimClients = vi.fn(async () => undefined)
  const worker = createShellWorker({
    manifest,
    origin: ORIGIN,
    caches: caches as unknown as CacheStorage,
    fetch: network.fetch,
    skipWaiting,
    claimClients,
  })
  return { caches, network, worker, skipWaiting, claimClients, manifest }
}

/** Runs the worker's fetch handler; returns what it answered with, or null if it left the request alone. */
async function dispatch(worker: ReturnType<typeof setup>['worker'], request: RequestLike): Promise<Response | null> {
  let answered: Promise<Response> | null = null
  const event: FetchEventLike = { request, respondWith: (response) => void (answered = response) }
  worker.handleFetch(event)
  return answered
}

async function bodyOf(response: Response | null): Promise<string> {
  expect(response).not.toBeNull()
  return (response as Response).text()
}

describe('parseShellManifest', () => {
  const valid = sampleManifest(ID)

  it('accepts a valid manifest', () => {
    expect(parseShellManifest(JSON.parse(JSON.stringify(valid)))).toEqual(valid)
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['no entries', { buildId: ID, entries: [] }],
    ['a short build id', { buildId: 'abc', entries: valid.entries }],
    ['an uppercase build id', { buildId: ID.toUpperCase(), entries: valid.entries }],
    ['a relative url', { buildId: ID, entries: [...valid.entries, { url: 'assets/x.js', kind: 'script' }] }],
    ['a protocol-relative url', { buildId: ID, entries: [...valid.entries, { url: '//evil.example/x.js', kind: 'script' }] }],
    ['a url with a query', { buildId: ID, entries: [...valid.entries, { url: '/assets/x.js?v=1', kind: 'script' }] }],
    ['a url with ..', { buildId: ID, entries: [...valid.entries, { url: '/assets/../x.js', kind: 'script' }] }],
    ['an unknown kind', { buildId: ID, entries: [...valid.entries, { url: '/x.bin', kind: 'binary' }] }],
    ['a duplicate url', { buildId: ID, entries: [...valid.entries, valid.entries[1]] }],
    ['no index.html', { buildId: ID, entries: valid.entries.filter((item) => item.url !== '/index.html') }],
    ['index.html that is not html', { buildId: ID, entries: valid.entries.map((item) => (item.url === '/index.html' ? { ...item, kind: 'script' } : item)) }],
  ])('rejects %s', (_name, value) => {
    expect(() => parseShellManifest(value)).toThrow()
  })
})

describe('assertUsableShellResponse', () => {
  const script = { url: '/assets/a.js', kind: 'script' } as const
  const page = { url: '/index.html', kind: 'html' } as const
  const js = (init: ResponseInit = {}) => new Response('x', { status: 200, headers: { 'content-type': 'text/javascript' }, ...init })

  it('accepts a normal file and a normal page', () => {
    expect(() => assertUsableShellResponse(script, js())).not.toThrow()
    expect(() => assertUsableShellResponse(page, new Response('<html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }))).not.toThrow()
    expect(() => assertUsableShellResponse(script, new Response('x', { status: 200 }))).not.toThrow() // untyped is not HTML
  })

  it('rejects HTML where a file was expected (a SPA host answering a missing file)', () => {
    expect(() => assertUsableShellResponse(script, new Response(INDEX_HTML, { headers: { 'content-type': 'text/html' } }))).toThrow(/HTML where a file was expected/)
  })

  it('rejects a page that is not HTML', () => {
    expect(() => assertUsableShellResponse(page, js())).toThrow(/expected to be HTML/)
  })

  it.each([404, 500, 206, 301])('rejects status %i', (status) => {
    expect(() => assertUsableShellResponse(script, js({ status }))).toThrow(/status/)
  })

  it('rejects a redirected response', () => {
    const response = js()
    Object.defineProperty(response, 'redirected', { value: true })
    expect(() => assertUsableShellResponse(script, response)).toThrow(/redirected/)
  })

  it('rejects an opaque or cross-origin response', () => {
    for (const type of ['opaque', 'opaqueredirect', 'cors', 'error']) {
      const response = js()
      Object.defineProperty(response, 'type', { value: type })
      expect(() => assertUsableShellResponse(script, response)).toThrow(/same-origin/)
    }
  })
})

describe('install', () => {
  it('fetches every file fresh, validates it, stores it in its own cache and writes the completion marker last', async () => {
    const { caches, network, worker, manifest } = setup()

    await worker.install()

    expect(await caches.keys()).toEqual([cacheName()])
    const cache = caches.caches.get(cacheName())!
    for (const { url } of manifest.entries) expect(cache.entries.has(abs(url))).toBe(true)
    expect(cache.entries.has(MARKER)).toBe(true)
    expect([...cache.entries.keys()].at(-1)).toBe(MARKER)
    expect(network.requests).toHaveLength(manifest.entries.length)
    for (const request of network.requests as Request[]) expect(request.cache).toBe('reload') // never the HTTP cache
  })

  it('does not take over by itself (no skipWaiting, no claim)', async () => {
    const { worker, skipWaiting, claimClients } = setup()
    await worker.install()
    expect(skipWaiting).not.toHaveBeenCalled()
    expect(claimClients).not.toHaveBeenCalled()
  })

  it('stores nothing and leaves no cache behind if ANY file is a SPA-fallback page instead of the file', async () => {
    const { caches, network, worker } = setup()
    network.override('/assets/Awakening-bbb.js', new Response(INDEX_HTML, { status: 200, headers: { 'content-type': 'text/html' } }))

    await expect(worker.install()).rejects.toThrow(/Awakening-bbb\.js/)

    expect(await caches.keys()).toEqual([])
  })

  it.each([
    ['a 404', () => new Response('nope', { status: 404, headers: { 'content-type': 'text/javascript' } })],
    ['a 500', () => new Response('boom', { status: 500 })],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('fails cleanly on %s', async (_name, answer) => {
    const { caches, network, worker } = setup()
    network.override('/assets/index-ccc.css', answer)

    await expect(worker.install()).rejects.toThrow()

    expect(await caches.keys()).toEqual([])
  })

  it('rejects an index page that is not HTML', async () => {
    const { caches, network, worker } = setup()
    network.override('/index.html', new Response('{}', { headers: { 'content-type': 'application/json' } }))
    await expect(worker.install()).rejects.toThrow(/expected to be HTML/)
    expect(await caches.keys()).toEqual([])
  })

  it('a failed install leaves the RUNNING build cache completely untouched', async () => {
    const { caches, network, worker } = setup(sampleManifest('ffffffffffffffff'))
    const running = await caches.seedComplete(cacheName('aaaaaaaaaaaaaaaa'), ORIGIN, ['/index.html', '/assets/old.js'])
    const before = new Map(running.entries)
    network.override('/assets/index-aaa.js', new Response('', { status: 404 }))

    await expect(worker.install()).rejects.toThrow()

    expect(await caches.keys()).toEqual([cacheName('aaaaaaaaaaaaaaaa')])
    expect(running.writes).toBe(0)
    expect(running.entries).toEqual(before)
  })

  it('installs next to the running build without writing into it', async () => {
    const { caches, worker } = setup(sampleManifest('bbbbbbbbbbbbbbbb'))
    const running = await caches.seedComplete(cacheName('aaaaaaaaaaaaaaaa'), ORIGIN, ['/index.html'])

    await worker.install()

    expect((await caches.keys()).sort()).toEqual([cacheName('aaaaaaaaaaaaaaaa'), cacheName('bbbbbbbbbbbbbbbb')])
    expect(running.writes).toBe(0)
  })

  it('never writes into a cache that already exists, even for the same build id (a rollback to the running build)', async () => {
    const { caches, worker, manifest } = setup()
    const running = await caches.seedComplete(cacheName(), ORIGIN, ['/index.html', '/assets/running.js'])

    await worker.install()

    expect(running.writes).toBe(0)
    expect(running.entries.has(abs('/assets/running.js'))).toBe(true)
    const keys = await caches.keys()
    expect(keys).toContain(`${cacheName()}~2`)
    const second = caches.caches.get(`${cacheName()}~2`)!
    expect(second.entries.has(abs(manifest.entries[1]!.url))).toBe(true)
  })

  it('removes partial caches left by an interrupted install, and leaves complete and foreign caches alone', async () => {
    const { caches, worker } = setup(sampleManifest('bbbbbbbbbbbbbbbb'))
    const partial = await caches.open(cacheName('cccccccccccccccc'))
    await partial.put(abs('/index.html'), new Response('half'))
    await caches.seedComplete(cacheName('aaaaaaaaaaaaaaaa'), ORIGIN, ['/index.html'])
    await caches.open('someone-elses-cache')

    await worker.install()

    expect((await caches.keys()).sort()).toEqual(['someone-elses-cache', cacheName('aaaaaaaaaaaaaaaa'), cacheName('bbbbbbbbbbbbbbbb')].sort())
  })

  it('a retry after a failure succeeds and ends with exactly one complete cache', async () => {
    const { caches, network, worker } = setup()
    network.override('/assets/index-ccc.css', new Response('x', { status: 503 }))
    await expect(worker.install()).rejects.toThrow()

    network.override('/assets/index-ccc.css', new Response('body', { headers: { 'content-type': 'text/css' } }))
    await worker.install()

    expect(await caches.keys()).toEqual([cacheName()])
    expect(caches.caches.get(cacheName())!.entries.has(MARKER)).toBe(true)
  })
})

describe('activate', () => {
  it('deletes every other build’s cache, keeps its own, and claims open pages', async () => {
    const { caches, worker, claimClients } = setup(sampleManifest('bbbbbbbbbbbbbbbb'))
    await caches.seedComplete(cacheName('aaaaaaaaaaaaaaaa'), ORIGIN, ['/index.html'])
    await caches.seedComplete(cacheName('9999999999999999'), ORIGIN, ['/index.html'])
    await caches.seedComplete(cacheName('bbbbbbbbbbbbbbbb'), ORIGIN, ['/index.html'])
    await caches.open('someone-elses-cache')

    await worker.activate()

    expect((await caches.keys()).sort()).toEqual([cacheName('bbbbbbbbbbbbbbbb'), 'someone-elses-cache'])
    expect(claimClients).toHaveBeenCalledOnce()
  })

  it('keeps every old cache if its own is missing (they are all the app could fall back on)', async () => {
    const { caches, worker, claimClients } = setup(sampleManifest('bbbbbbbbbbbbbbbb'))
    await caches.seedComplete(cacheName('aaaaaaaaaaaaaaaa'), ORIGIN, ['/index.html'])

    await worker.activate()

    expect(await caches.keys()).toEqual([cacheName('aaaaaaaaaaaaaaaa')])
    expect(claimClients).toHaveBeenCalledOnce()
  })

  it('does not trust an incomplete cache as its own', async () => {
    const { caches, worker } = setup(sampleManifest('bbbbbbbbbbbbbbbb'))
    await caches.seedComplete(cacheName('aaaaaaaaaaaaaaaa'), ORIGIN, ['/index.html'])
    const partial = await caches.open(cacheName('bbbbbbbbbbbbbbbb'))
    await partial.put(abs('/index.html'), new Response('half'))

    await worker.activate()

    expect(await caches.keys()).toContain(cacheName('aaaaaaaaaaaaaaaa'))
  })

  it('after a duplicate install of the same build, keeps one usable cache', async () => {
    const { caches, worker } = setup()
    await caches.seedComplete(cacheName(), ORIGIN, ['/index.html'])
    await worker.install() // writes `~2`
    await worker.activate()

    expect(await caches.keys()).toEqual([`${cacheName()}~2`])
  })
})

describe('fetch: navigation fallback', () => {
  async function installed() {
    const context = setup()
    await context.worker.install()
    return context
  }

  it.each(['/', '/quests', '/quests/new', '/quests/abc-123/edit', '/weekly', '/weekly/edit', '/weekly/history', '/status', '/status/history', '/achievements', '/report', '/nowhere'])(
    'answers a navigation to %s with the cached page',
    async (path) => {
      const { worker, network } = await installed()
      const before = network.requests.length

      const response = await dispatch(worker, navigation(path))

      expect(await bodyOf(response)).toBe(INDEX_HTML)
      expect(network.requests).toHaveLength(before) // from the cache, not the network
    },
  )

  it('ignores the query and fragment of a navigation', async () => {
    const { worker } = await installed()
    expect(await bodyOf(await dispatch(worker, navigation('/status?from=home')))).toBe(INDEX_HTML)
  })

  it('serves /index.html itself exactly', async () => {
    const { worker } = await installed()
    expect(await bodyOf(await dispatch(worker, navigation('/index.html')))).toBe(INDEX_HTML)
  })

  it('does NOT turn a navigation to a file into the page (a missing file stays missing)', async () => {
    const { worker } = await installed()
    for (const path of ['/missing.js', '/assets/nope.css', '/icons/x.png', '/sw.js', '/some/file.txt']) {
      expect(await dispatch(worker, navigation(path))).toBeNull()
    }
  })

  it('does not apply to a navigation that does not ask for HTML', async () => {
    const { worker } = await installed()
    expect(await dispatch(worker, navigation('/quests', '*/*'))).toBeNull()
    expect(await dispatch(worker, navigation('/quests', 'application/json'))).toBeNull()
  })

  it('does not treat a non-navigation request for a route as the page (no API-style fallback)', async () => {
    const { worker } = await installed()
    expect(await dispatch(worker, subresource('/quests'))).toBeNull()
    expect(await dispatch(worker, subresource('/api/anything'))).toBeNull()
    expect(await dispatch(worker, subresource('/assets/not-in-the-build.js'))).toBeNull()
  })

  it('leaves non-GET and cross-origin requests alone', async () => {
    const { worker } = await installed()
    expect(await dispatch(worker, { ...navigation('/quests'), method: 'POST' })).toBeNull()
    expect(await dispatch(worker, { ...navigation('/quests'), url: 'https://elsewhere.example/quests' })).toBeNull()
    expect(await dispatch(worker, { ...subresource('/assets/index-aaa.js'), url: 'https://cdn.example/assets/index-aaa.js' })).toBeNull()
  })
})

describe('fetch: exact shell files', () => {
  async function installed() {
    const context = setup()
    await context.worker.install()
    return context
  }

  it('serves every precached file from the cache by exact path', async () => {
    const { worker, network, manifest } = await installed()
    const before = network.requests.length
    for (const { url } of manifest.entries) {
      const response = await dispatch(worker, subresource(url))
      expect(response).not.toBeNull()
      expect((await bodyOf(response)).length).toBeGreaterThan(0)
    }
    expect(network.requests).toHaveLength(before)
  })

  it('a request with a query string is not an exact match and goes to the network', async () => {
    const { worker } = await installed()
    expect(await dispatch(worker, subresource('/assets/index-aaa.js?cachebust=1'))).toBeNull()
  })

  it('never answers an unknown asset with the page', async () => {
    const { worker } = await installed()
    expect(await dispatch(worker, subresource('/assets/index-OLD.js'))).toBeNull()
  })

  it('falls through to the network when the cache cannot be read', async () => {
    const { worker, network, caches } = await installed()
    vi.spyOn(caches, 'keys').mockRejectedValue(new Error('storage unavailable'))
    const before = network.requests.length

    const response = await dispatch(worker, subresource('/assets/index-aaa.js'))

    expect(await bodyOf(response)).toBe('body:/assets/index-aaa.js')
    expect(network.requests).toHaveLength(before + 1)
  })

  it('falls through to the network when it has no cache of its own (evicted), then recovers once it has one', async () => {
    const { worker, network, caches } = setup()
    const first = await dispatch(worker, navigation('/quests'))
    expect(await bodyOf(first)).toBe(INDEX_HTML)
    expect(network.requests).toHaveLength(1) // fetched from the network

    await worker.install()
    const before = network.requests.length
    expect(await bodyOf(await dispatch(worker, navigation('/quests')))).toBe(INDEX_HTML)
    expect(network.requests).toHaveLength(before) // now from the cache
    expect(await caches.keys()).toEqual([cacheName()])
  })
})

describe('messages', () => {
  it('SKIP_WAITING asks the browser to activate this worker', async () => {
    const { worker, skipWaiting } = setup()
    const waitUntil = vi.fn()
    worker.handleMessage({ data: { type: 'SKIP_WAITING' }, waitUntil })
    expect(skipWaiting).toHaveBeenCalledOnce()
    expect(waitUntil).toHaveBeenCalledOnce()
  })

  it.each([undefined, null, 'SKIP_WAITING', 42, {}, { type: 'OTHER' }, { type: 'skip_waiting' }])('ignores %j', (data) => {
    const { worker, skipWaiting } = setup()
    worker.handleMessage({ data, waitUntil: vi.fn() })
    expect(skipWaiting).not.toHaveBeenCalled()
  })
})

describe('the worker never touches player data (INDEXEDDB / BOUNDARY)', () => {
  it('opens no database and reads no storage through install, activate, fetch and messages', async () => {
    const touched: string[] = []
    const trap = (name: string) =>
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          touched.push(name)
          throw new Error(`the service worker touched ${name}`)
        },
      })
    const names = ['indexedDB', 'localStorage', 'sessionStorage', 'IDBFactory']
    names.forEach(trap)
    try {
      const { worker } = setup()
      await worker.install()
      await worker.activate()
      await dispatch(worker, navigation('/status'))
      await dispatch(worker, subresource('/assets/index-aaa.js'))
      worker.handleMessage({ data: { type: 'SKIP_WAITING' }, waitUntil: vi.fn() })
    } finally {
      for (const name of names) Reflect.deleteProperty(globalThis, name)
    }
    expect(touched).toEqual([])
  })

  it('its source names no database, storage or application layer at all', () => {
    for (const file of ['core.ts', 'sw.ts']) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
      expect(source, file).not.toMatch(/\b(indexedDB|IDBFactory|IDBDatabase|openDatabase|localStorage|sessionStorage)\b/)
      expect(source, file).not.toMatch(/from\s+['"](@\/|\.\.\/)/) // imports only its own files
    }
  })
})

describe('network typing sanity', () => {
  it('the fake network behaves like a SPA host: an unknown path answers the index page with status 200', async () => {
    const network: FakeNetwork = createNetwork(sampleManifest(ID))
    const response = await network.fetch(new Request(abs('/assets/does-not-exist.js')))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
  })
})
