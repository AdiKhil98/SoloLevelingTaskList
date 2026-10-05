/**
 * Service worker entry (Phase 12). Built as a separate classic script, `/sw.js`, by `tools/shell-precache`, which
 * also injects the shell manifest as `self.__SHELL_MANIFEST__` in front of this code. Production only: the
 * application registers it from `src/platform/shellUpdates.ts`, never under `vite dev`.
 *
 * All behaviour lives in `core.ts`. This file only connects it to the real worker scope.
 */
import { createShellWorker, parseShellManifest, SHELL_MANIFEST_GLOBAL, type FetchEventLike, type MessageEventLike } from './core'

interface WorkerScope {
  readonly location: Location
  readonly caches: CacheStorage
  readonly clients: { claim(): Promise<void> }
  fetch(request: Request | FetchEventLike['request']): Promise<Response>
  skipWaiting(): Promise<void>
  addEventListener(type: 'install' | 'activate', listener: (event: { waitUntil(promise: Promise<unknown>): void }) => void): void
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void
}

const scope = self as unknown as WorkerScope & Record<string, unknown>

// A worker without a valid manifest must not exist: this throws, registration fails, and the page runs online-only.
const manifest = parseShellManifest(scope[SHELL_MANIFEST_GLOBAL])

const worker = createShellWorker({
  manifest,
  origin: scope.location.origin,
  caches: scope.caches,
  fetch: (request) => scope.fetch(request),
  skipWaiting: () => scope.skipWaiting(),
  claimClients: () => scope.clients.claim(),
})

// No `skipWaiting()` here: a new build waits until the player restarts or every page of the old build is gone.
scope.addEventListener('install', (event) => event.waitUntil(worker.install()))
scope.addEventListener('activate', (event) => event.waitUntil(worker.activate()))
scope.addEventListener('fetch', (event) => worker.handleFetch(event))
scope.addEventListener('message', (event) => worker.handleMessage(event))
