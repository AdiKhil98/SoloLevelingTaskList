/**
 * The page's side of the offline shell (Phase 12): registers the service worker and tracks whether a newer build
 * is waiting. It owns NOTHING about the game: it does not read or write player data and it is not a second day
 * lifecycle. The day sync (`useDaySync`) stays the only authority on days; this only checks for a new build now
 * and then.
 *
 * Rules it keeps:
 *
 *  - Everything here is optional infrastructure. A missing API, a failed registration or a failed update check
 *    never throws into the app; at worst the app runs online-only.
 *  - An update is only ever APPLIED when the player asks (`restart`). A waiting build never reloads a running page.
 *  - The first install is not an update: the worker claiming the page the first time is ignored.
 *  - If another tab applies the update, this page is told to restart (never reloaded under the player).
 *
 * The environment is injected so the whole life cycle is testable with fakes; `shellUpdates` is the real one.
 */
import { isNativeApp } from './native'
import { reloadPage } from './page'

export const SHELL_WORKER_URL = '/sw.js'
/** At most one update check per this interval (resume and reconnect signals can be frequent). */
export const UPDATE_CHECK_INTERVAL_MS = 10 * 60_000
/** If RESTART was pressed and the new worker has not taken over by then, the button works again. */
export const APPLY_TIMEOUT_MS = 10_000
/** What this page posts to the waiting worker when the player chooses RESTART (the worker's `SKIP_WAITING_MESSAGE`). */
export const RESTART_REQUEST_MESSAGE = 'SKIP_WAITING'
/** What the worker answers when it did not activate because another app window is open (its `UPDATE_BLOCKED_MESSAGE`). */
export const RESTART_BLOCKED_MESSAGE = 'UPDATE_BLOCKED'

export interface ShellWorkerLike {
  readonly state: string
  postMessage(message: unknown): void
  addEventListener(type: 'statechange', listener: () => void): void
}

export interface ShellRegistrationLike {
  readonly waiting: ShellWorkerLike | null
  readonly installing: ShellWorkerLike | null
  addEventListener(type: 'updatefound', listener: () => void): void
  update(): Promise<unknown>
}

export interface ShellContainerLike {
  readonly controller: unknown
  register(url: string, options: { scope: string; updateViaCache: 'none' }): Promise<ShellRegistrationLike>
  addEventListener(type: 'controllerchange', listener: () => void): void
  /** Messages from the worker (its answer to a restart request). */
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void
}

export interface ShellUpdateEnvironment {
  /** `navigator.serviceWorker`, or null where it does not exist (plain HTTP, old browsers). */
  readonly container: ShellContainerLike | null
  /** A monotonic millisecond clock (for the update-check throttle only). */
  now(): number
  reload(): void
  /** Calls back once the page has finished loading (at once if it already has). */
  whenLoaded(callback: () => void): void
  /** Subscribes to "the page became visible again" and "the network came back". Returns the unsubscribe. */
  onResumeSignals(listener: () => void): () => void
  /** Runs `callback` after `ms`. Returns a cancel function. */
  setTimer(callback: () => void, ms: number): () => void
  warn(message: string, error: unknown): void
}

export interface ShellUpdateSnapshot {
  /** A newer build is installed and waiting (or another tab already switched); the running page is untouched. */
  readonly updateReady: boolean
  /** RESTART was pressed and the new build is taking over. */
  readonly applying: boolean
  /**
   * RESTART was pressed but the build did NOT switch, because another app window is open. Nothing was changed; the
   * player can close the other window and press RESTART again. Cleared by the next RESTART or a newer build.
   */
  readonly blocked: boolean
  /** The player chose LATER (this session only: it lives in memory, so a reload shows the notice again). */
  readonly dismissed: boolean
}

export interface ShellUpdates {
  getSnapshot(): ShellUpdateSnapshot
  subscribe(listener: () => void): () => void
  /** Registers the worker once the page has loaded. Safe to call more than once; never rejects. */
  start(): Promise<void>
  /** The player pressed RESTART: let the waiting build take over, then reload once. No-op unless an update is ready. */
  restart(): void
  /** The player pressed LATER. */
  later(): void
}

export function createShellUpdates(env: ShellUpdateEnvironment): ShellUpdates {
  let started = false
  let registration: ShellRegistrationLike | null = null
  let waiting: ShellWorkerLike | null = null
  let controllerReplaced = false
  let hadController = false
  let applying = false
  let blocked = false
  let dismissed = false
  let reloaded = false
  let lastCheck = Number.NEGATIVE_INFINITY
  let cancelApplyTimer: (() => void) | null = null

  let snapshot: ShellUpdateSnapshot = { updateReady: false, applying: false, blocked: false, dismissed: false }
  const listeners = new Set<() => void>()

  function emit(): void {
    const next: ShellUpdateSnapshot = { updateReady: waiting !== null || controllerReplaced, applying, blocked, dismissed }
    if (
      next.updateReady === snapshot.updateReady &&
      next.applying === snapshot.applying &&
      next.blocked === snapshot.blocked &&
      next.dismissed === snapshot.dismissed
    ) {
      return
    }
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  function setWaiting(worker: ShellWorkerLike | null): void {
    if (worker === waiting) return
    // A different (newer) build supersedes the one the player postponed (or was blocked on), so it is announced afresh.
    if (worker !== null) {
      dismissed = false
      blocked = false
    }
    waiting = worker
    if (worker !== null) {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant' && waiting === worker) {
          waiting = null
          emit()
        }
      })
    }
  }

  /** A waiting worker is an UPDATE only if a worker already controls this page; otherwise it is the first install. */
  function adoptWaiting(container: ShellContainerLike, current: ShellRegistrationLike): void {
    if (container.controller !== null && current.waiting !== null) setWaiting(current.waiting)
    emit()
  }

  function trackInstalling(container: ShellContainerLike, current: ShellRegistrationLike): void {
    const installing = current.installing
    if (installing === null) return
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') adoptWaiting(container, current)
    })
  }

  function check(): void {
    if (registration === null) return
    const now = env.now()
    if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) return
    lastCheck = now
    // An offline or failed check is normal and invisible: the next resume tries again.
    registration.update().catch(() => undefined)
  }

  async function start(): Promise<void> {
    if (started) return
    started = true
    const container = env.container
    if (container === null) return
    try {
      await new Promise<void>((resolve) => env.whenLoaded(resolve))
      // All of these are set up BEFORE registering, so neither the first claim nor an early update can be missed.
      hadController = container.controller !== null
      container.addEventListener('message', (event) => {
        // The worker declined to switch because another app window is open. Only a pending RESTART cares.
        const data = event.data as { type?: unknown } | null
        if (!applying || typeof data !== 'object' || data === null || data.type !== RESTART_BLOCKED_MESSAGE) return
        applying = false
        blocked = true
        cancelApplyTimer?.()
        cancelApplyTimer = null
        emit()
      })
      container.addEventListener('controllerchange', () => {
        if (!hadController) {
          hadController = true // the first install claimed this page: offline-ready, nothing to reload
          return
        }
        if (applying) {
          if (!reloaded) {
            reloaded = true
            env.reload()
          }
          return
        }
        // Another tab applied the update: this page still runs the old build, so offer a restart; never reload it.
        controllerReplaced = true
        dismissed = false
        emit()
      })
      const current = await container.register(SHELL_WORKER_URL, { scope: '/', updateViaCache: 'none' })
      registration = current
      current.addEventListener('updatefound', () => trackInstalling(container, current))
      trackInstalling(container, current)
      adoptWaiting(container, current)
      env.onResumeSignals(check)
    } catch (error) {
      env.warn('Offline support could not be started; the app works online only', error)
    }
  }

  function restart(): void {
    if (applying) return
    if (controllerReplaced) {
      // The new build is already in control; only this page is stale.
      applying = true
      emit()
      if (!reloaded) {
        reloaded = true
        env.reload()
      }
      return
    }
    if (waiting === null) return
    applying = true
    blocked = false // a fresh attempt: the player may have closed the other window
    emit()
    try {
      waiting.postMessage({ type: RESTART_REQUEST_MESSAGE })
    } catch (error) {
      applying = false
      env.warn('The update could not be started', error)
      emit()
      return
    }
    cancelApplyTimer?.()
    cancelApplyTimer = env.setTimer(() => {
      if (applying && !reloaded) {
        applying = false
        emit()
      }
    }, APPLY_TIMEOUT_MS)
  }

  function later(): void {
    if (dismissed) return
    dismissed = true
    emit()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start,
    restart,
    later,
  }
}

function browserEnvironment(): ShellUpdateEnvironment {
  return {
    // Inside the Android app there is no service worker: the APK already holds every file and updates arrive as a new
    // APK, so a null container (the "no worker here" path) is exactly right.
    container:
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !isNativeApp() ? navigator.serviceWorker : null,
    now: () => performance.now(),
    reload: reloadPage,
    whenLoaded(callback) {
      if (document.readyState === 'complete') callback()
      else window.addEventListener('load', callback, { once: true })
    },
    onResumeSignals(listener) {
      const onVisible = () => {
        if (document.visibilityState === 'visible') listener()
      }
      document.addEventListener('visibilitychange', onVisible)
      window.addEventListener('online', listener)
      return () => {
        document.removeEventListener('visibilitychange', onVisible)
        window.removeEventListener('online', listener)
      }
    },
    setTimer(callback, ms) {
      const id = setTimeout(callback, ms)
      return () => clearTimeout(id)
    },
    warn: (message, error) => console.warn(message, error),
  }
}

/** The one real instance. `main.tsx` starts it in production builds only; tests build their own with fakes. */
export const shellUpdates: ShellUpdates = createShellUpdates(browserEnvironment())
