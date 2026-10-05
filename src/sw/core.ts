/**
 * The offline application shell (Phase 12): the logic of the service worker, written against an injected
 * environment so it can be tested without a browser. `sw.ts` is the only file that touches the real worker scope.
 *
 * What this worker is, and is not:
 *
 *  - It caches the application SHELL only: the files listed in the build's shell manifest (index.html, the hashed
 *    chunks, the font, the manifest, the icons). Nothing else is ever cached; there is no runtime caching.
 *  - It never opens IndexedDB, reads or writes player data, migrates data or decides anything about Awakening or the
 *    day lifecycle. Those belong to the page. This module imports nothing at all (ESLint enforces it).
 *  - A new build installs into its OWN cache and waits. It takes over only when the player restarts (the page posts
 *    `SKIP_WAITING`) or when no page is using the old build any more, so a running session is never swapped under
 *    the player and its lazy chunks always come from the build that loaded them.
 *
 * Install is atomic from the application's point of view: every file is fetched fresh and validated before ANY of
 * them is stored, and the cache only counts as usable once a completion marker has been written. A failed install
 * removes its own partial cache and leaves the running build untouched.
 */

/** Every cache this worker owns starts with this; anything else is never touched. */
export const SHELL_CACHE_PREFIX = 'sltl-shell-'
/** The build injects the manifest as this property of the worker's global scope (see `tools/shell-precache`). */
export const SHELL_MANIFEST_GLOBAL = '__SHELL_MANIFEST__'
/** The message the page posts when the player chooses RESTART. */
export const SKIP_WAITING_MESSAGE = 'SKIP_WAITING'
/** The worker's answer when it did NOT activate because another app window is open (see `requestActivation`). */
export const UPDATE_BLOCKED_MESSAGE = 'UPDATE_BLOCKED'
/** The document served for every in-app navigation. */
export const SHELL_PAGE = '/index.html'
/** Written LAST into a cache: a cache without it is a partial install and is never served from. */
const COMPLETE_MARKER_PATH = '/__sltl-shell-complete__'

export const SHELL_KINDS = ['html', 'script', 'style', 'font', 'image', 'manifest', 'other'] as const
export type ShellKind = (typeof SHELL_KINDS)[number]

export interface ShellEntry {
  /** Absolute path on this origin, no query or fragment (for example `/assets/index-abc.js`). */
  readonly url: string
  readonly kind: ShellKind
}

export interface ShellManifest {
  /** Derived from the worker's own code AND every shell file, so a change to either is a new cache. */
  readonly buildId: string
  readonly entries: readonly ShellEntry[]
}

const BUILD_ID_PATTERN = /^[0-9a-f]{16}$/

/** Validates the manifest the build injected. Throws a descriptive error; a bad manifest must fail loudly. */
export function parseShellManifest(value: unknown): ShellManifest {
  if (typeof value !== 'object' || value === null) throw new Error('The shell manifest is missing')
  const { buildId, entries } = value as { buildId?: unknown; entries?: unknown }
  if (typeof buildId !== 'string' || !BUILD_ID_PATTERN.test(buildId)) throw new Error('The shell manifest has an invalid buildId')
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('The shell manifest has no entries')

  const seen = new Set<string>()
  const parsed: ShellEntry[] = []
  for (const entry of entries as unknown[]) {
    const { url, kind } = (entry ?? {}) as { url?: unknown; kind?: unknown }
    if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || /[?#\\]|\.\./.test(url)) {
      throw new Error(`The shell manifest has an invalid url: ${String(url)}`)
    }
    if (typeof kind !== 'string' || !(SHELL_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`The shell manifest has an invalid kind for ${url}`)
    }
    if (seen.has(url)) throw new Error(`The shell manifest lists ${url} twice`)
    seen.add(url)
    parsed.push({ url, kind: kind as ShellKind })
  }
  if (!parsed.some((entry) => entry.url === SHELL_PAGE && entry.kind === 'html')) {
    throw new Error(`The shell manifest does not list ${SHELL_PAGE} as html`)
  }
  return { buildId, entries: parsed }
}

/**
 * Checks one freshly fetched file before it may be stored. This is what stops a host that answers a missing file
 * with the app's index.html (status 200) from poisoning the cache: only index.html may be HTML.
 */
export function assertUsableShellResponse(entry: ShellEntry, response: Response): void {
  const reject = (reason: string): never => {
    throw new Error(`Cannot install the offline shell: ${entry.url} ${reason}`)
  }
  if (response.type !== 'basic' && response.type !== 'default') reject(`was not a same-origin response (${response.type})`)
  if (response.redirected) reject('was redirected')
  if (response.status !== 200) reject(`answered with status ${response.status}`)
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  const isHtml = contentType.includes('text/html')
  if (entry.kind === 'html' && !isHtml) reject(`was expected to be HTML but is "${contentType || 'untyped'}"`)
  if (entry.kind !== 'html' && isHtml) reject('is HTML where a file was expected (the host answered with the app page)')
}

/** The parts of the real worker scope this module uses. `sw.ts` provides them; tests provide fakes. */
export interface ShellWorkerEnvironment {
  readonly manifest: ShellManifest
  readonly origin: string
  readonly caches: CacheStorage
  readonly fetch: (request: Request | RequestLike) => Promise<Response>
  readonly skipWaiting: () => Promise<void>
  readonly claimClients: () => Promise<void>
  /** How many window clients of this origin exist, controlled or not (the requesting page is one of them). */
  readonly countWindowClients: () => Promise<number>
}

/** The subset of `Request` the fetch handler reads (a real navigation request cannot be built by hand in tests). */
export type RequestLike = Pick<Request, 'method' | 'url' | 'mode' | 'headers'>

export interface FetchEventLike {
  readonly request: RequestLike
  respondWith(response: Promise<Response>): void
}

export interface MessageEventLike {
  readonly data: unknown
  /** The page that posted the message (where a reply goes), or null. */
  readonly source: { postMessage(message: unknown): void } | null
  waitUntil(promise: Promise<unknown>): void
}

export interface ShellWorker {
  /** Fetches, validates and stores the build's files in a cache of its own. Rejects (and cleans up) on any failure. */
  install(): Promise<void>
  /** Removes every other build's cache, then takes control of open pages. */
  activate(): Promise<void>
  /** Answers shell navigations and exact shell files from the cache; every other request is left alone. */
  handleFetch(event: FetchEventLike): void
  handleMessage(event: MessageEventLike): void
}

/** The last path segment names a file (`/sw.js`, `/icons/a.png`): such a request is never an in-app route. */
function namesAFile(pathname: string): boolean {
  return /\.[^/]*$/.test(pathname.slice(pathname.lastIndexOf('/') + 1))
}

export function createShellWorker(env: ShellWorkerEnvironment): ShellWorker {
  const { manifest, origin } = env
  const base = `${SHELL_CACHE_PREFIX}${manifest.buildId}`
  const known = new Set(manifest.entries.map((entry) => entry.url))
  const absolute = (path: string) => new URL(path, origin).href

  const isComplete = async (cache: Cache) => (await cache.match(absolute(COMPLETE_MARKER_PATH))) !== undefined

  /** This build's usable caches (several only if the same build was installed twice), newest suffix last. */
  async function ownCompleteCacheNames(): Promise<string[]> {
    const own: { name: string; n: number }[] = []
    for (const name of await env.caches.keys()) {
      const suffix = name === base ? '1' : name.startsWith(`${base}~`) ? name.slice(base.length + 1) : null
      if (suffix === null || !/^\d+$/.test(suffix)) continue
      if (await isComplete(await env.caches.open(name))) own.push({ name, n: Number(suffix) })
    }
    return own.sort((a, b) => a.n - b.n).map((item) => item.name)
  }

  /** A cache without the completion marker is a partial install: nothing is ever served from it, so it is safe to delete. */
  async function deleteIncompleteCaches(): Promise<void> {
    for (const name of await env.caches.keys()) {
      if (!name.startsWith(SHELL_CACHE_PREFIX)) continue
      if (!(await isComplete(await env.caches.open(name)))) await env.caches.delete(name)
    }
  }

  /** A name that does not exist yet: an install never writes into a cache that was there before it started. */
  async function freeCacheName(): Promise<string> {
    const taken = new Set(await env.caches.keys())
    let name = base
    for (let n = 2; taken.has(name); n += 1) name = `${base}~${n}`
    return name
  }

  async function install(): Promise<void> {
    await deleteIncompleteCaches()
    const name = await freeCacheName()
    try {
      // Fetch and validate EVERYTHING first; nothing is stored until every file is known to be good.
      const fetched = await Promise.all(
        manifest.entries.map(async (entry) => {
          const response = await env.fetch(new Request(absolute(entry.url), { cache: 'reload', credentials: 'same-origin' }))
          assertUsableShellResponse(entry, response)
          return { entry, response }
        }),
      )
      const cache = await env.caches.open(name)
      for (const { entry, response } of fetched) await cache.put(absolute(entry.url), response)
      const marker = JSON.stringify({ buildId: manifest.buildId, files: fetched.length })
      await cache.put(absolute(COMPLETE_MARKER_PATH), new Response(marker, { headers: { 'content-type': 'application/json' } }))
    } catch (error) {
      await env.caches.delete(name).catch(() => false) // the partial cache of THIS attempt; never the running build's
      throw error
    }
  }

  async function activate(): Promise<void> {
    const own = await ownCompleteCacheNames()
    const keep = own.at(-1)
    // Without a usable cache of its own this worker leaves the old caches alone (they are all it could fall back on).
    if (keep !== undefined) {
      for (const name of await env.caches.keys()) {
        if (name.startsWith(SHELL_CACHE_PREFIX) && name !== keep) await env.caches.delete(name)
      }
    }
    await env.claimClients()
  }

  let shellCache: Promise<Cache | null> | null = null
  /** The cache to serve from, found once and remembered; a miss or a failure is not remembered, so the next request looks again. */
  function ownCache(): Promise<Cache | null> {
    if (shellCache === null) {
      shellCache = (async () => {
        const name = (await ownCompleteCacheNames()).at(-1)
        return name === undefined ? null : env.caches.open(name)
      })().then(
        (cache) => {
          if (cache === null) shellCache = null
          return cache
        },
        (error: unknown) => {
          shellCache = null
          throw error
        },
      )
    }
    return shellCache
  }

  function targetFor(request: RequestLike, url: URL): string | null {
    // An exact shell file (no query): the hashed chunks, the font, the manifest, the icons, index.html itself.
    if (url.search === '' && known.has(url.pathname)) return url.pathname
    // Otherwise only a real page navigation falls back to the shell: never an asset, never anything that names a file.
    const wantsHtml = (request.headers.get('accept') ?? '').includes('text/html')
    if (request.mode === 'navigate' && wantsHtml && !namesAFile(url.pathname)) return SHELL_PAGE
    return null
  }

  function handleFetch(event: FetchEventLike): void {
    const { request } = event
    if (request.method !== 'GET') return
    const url = new URL(request.url)
    if (url.origin !== origin) return
    const target = targetFor(request, url)
    if (target === null) return
    event.respondWith(
      (async () => {
        try {
          const cache = await ownCache()
          const hit = cache === null ? undefined : await cache.match(absolute(target))
          if (hit !== undefined) return hit
        } catch {
          // an unreadable cache is not an error for the player: fall through to the network
        }
        return env.fetch(request)
      })(),
    )
  }

  /**
   * The player pressed RESTART. Activating this build deletes every older cache and takes control of every open page,
   * and the application deliberately never reloads a page the player did not ask to reload. So if ANOTHER app window
   * is open, activating now would leave that window running the old build with its cache gone (a lazy chunk it had not
   * loaded yet would be missing). Therefore it activates only when the requesting window is the only one; otherwise it
   * changes nothing and tells the requester, who can try again once the other window is closed.
   *
   * If the windows cannot be counted it does not activate either (never on a guess); the page's button recovers by
   * itself after a short while.
   */
  async function requestActivation(source: MessageEventLike['source']): Promise<void> {
    let windows: number
    try {
      windows = await env.countWindowClients()
    } catch {
      return
    }
    if (windows > 1) {
      try {
        source?.postMessage({ type: UPDATE_BLOCKED_MESSAGE, windows })
      } catch {
        // the requester is gone: there is nobody to tell
      }
      return
    }
    await env.skipWaiting()
  }

  function handleMessage(event: MessageEventLike): void {
    const { data } = event
    if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === SKIP_WAITING_MESSAGE) {
      event.waitUntil(requestActivation(event.source))
    }
  }

  return { install, activate, handleFetch, handleMessage }
}
