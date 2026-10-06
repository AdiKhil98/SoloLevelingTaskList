import { describe, expect, it, vi } from 'vitest'
import { SKIP_WAITING_MESSAGE, UPDATE_BLOCKED_MESSAGE } from '../sw/core'
import {
  APPLY_TIMEOUT_MS,
  createShellUpdates,
  RESTART_BLOCKED_MESSAGE,
  RESTART_REQUEST_MESSAGE,
  SHELL_WORKER_URL,
  UPDATE_CHECK_INTERVAL_MS,
  type ShellContainerLike,
  type ShellRegistrationLike,
  type ShellUpdateEnvironment,
  type ShellWorkerLike,
} from './shellUpdates'

class FakeWorker implements ShellWorkerLike {
  state = 'installing'
  readonly postMessage = vi.fn()
  private readonly listeners: (() => void)[] = []
  addEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.push(listener)
  }
  become(state: string): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}

class FakeRegistration implements ShellRegistrationLike {
  waiting: FakeWorker | null = null
  installing: FakeWorker | null = null
  readonly update = vi.fn(async () => undefined)
  private readonly updateFound: (() => void)[] = []
  addEventListener(_type: 'updatefound', listener: () => void): void {
    this.updateFound.push(listener)
  }
  /** A new build starts installing (what the browser does after it sees a changed sw.js). */
  discover(worker: FakeWorker): void {
    this.installing = worker
    for (const listener of this.updateFound) listener()
  }
  /** It finished installing and is now waiting. */
  finishInstalling(worker: FakeWorker): void {
    this.installing = null
    this.waiting = worker
    worker.become('installed')
  }
}

class FakeContainer implements ShellContainerLike {
  controller: unknown = null
  readonly registration = new FakeRegistration()
  readonly register = vi.fn<ShellContainerLike['register']>(async () => this.registration)
  private readonly changeListeners: (() => void)[] = []
  private readonly messageListeners: ((event: { readonly data: unknown }) => void)[] = []
  addEventListener(type: 'controllerchange', listener: () => void): void
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void
  addEventListener(type: 'controllerchange' | 'message', listener: (() => void) | ((event: { readonly data: unknown }) => void)): void {
    if (type === 'controllerchange') this.changeListeners.push(listener as () => void)
    else this.messageListeners.push(listener as (event: { readonly data: unknown }) => void)
  }
  /** The active worker changed (a new build took over, or the first install claimed this page). */
  takeOver(): void {
    this.controller = {}
    for (const listener of this.changeListeners) listener()
  }
  /** The worker posted a message to this page. */
  receive(data: unknown): void {
    for (const listener of this.messageListeners) listener({ data })
  }
}

function setup({ controlled = true, loaded = true, supported = true }: { controlled?: boolean; loaded?: boolean; supported?: boolean } = {}) {
  const container = new FakeContainer()
  if (controlled) container.controller = {}
  let time = 0
  let loadCallback: (() => void) | null = null
  let resume: (() => void) | null = null
  const timers: { callback: () => void; at: number; cancelled: boolean }[] = []
  const reload = vi.fn()
  const warn = vi.fn()
  const env: ShellUpdateEnvironment = {
    container: supported ? container : null,
    now: () => time,
    reload,
    whenLoaded: (callback) => (loaded ? callback() : void (loadCallback = callback)),
    onResumeSignals: (listener) => {
      resume = listener
      return () => undefined
    },
    setTimer: (callback, ms) => {
      const timer = { callback, at: time + ms, cancelled: false }
      timers.push(timer)
      return () => void (timer.cancelled = true)
    },
    warn,
  }
  const updates = createShellUpdates(env)
  return {
    container,
    registration: container.registration,
    updates,
    reload,
    warn,
    finishLoading: () => loadCallback?.(),
    signalResume: () => resume?.(),
    advance(ms: number) {
      time += ms
      for (const timer of timers) {
        if (timer.cancelled || timer.at > time) continue
        timer.cancelled = true
        timer.callback()
      }
    },
  }
}

describe('registration', () => {
  it('registers /sw.js at the root with the HTTP cache bypassed', async () => {
    const { updates, container } = setup()
    await updates.start()
    expect(container.register).toHaveBeenCalledWith(SHELL_WORKER_URL, { scope: '/', updateViaCache: 'none' })
    expect(SHELL_WORKER_URL).toBe('/sw.js')
  })

  it('waits for the page to finish loading before registering', async () => {
    const { updates, container, finishLoading } = setup({ loaded: false })
    const started = updates.start()
    await Promise.resolve()
    expect(container.register).not.toHaveBeenCalled()

    finishLoading()
    await started

    expect(container.register).toHaveBeenCalledOnce()
  })

  it('registers only once however often it is started', async () => {
    const { updates, container } = setup()
    await Promise.all([updates.start(), updates.start()])
    await updates.start()
    expect(container.register).toHaveBeenCalledOnce()
  })

  it('does nothing and does not throw where service workers do not exist (plain HTTP, old browsers)', async () => {
    const { updates } = setup({ supported: false })
    await expect(updates.start()).resolves.toBeUndefined()
    expect(updates.getSnapshot()).toEqual({ updateReady: false, applying: false, blocked: false, dismissed: false })
    updates.restart()
    updates.later()
    expect(updates.getSnapshot().updateReady).toBe(false)
  })

  it('a failed registration is reported once as degradation and never throws', async () => {
    const { updates, container, warn } = setup()
    container.register.mockRejectedValueOnce(new Error('SecurityError'))

    await expect(updates.start()).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledOnce()
    expect(updates.getSnapshot().updateReady).toBe(false)
  })

  it('a failure while starting (an unexpected throw anywhere) is contained too', async () => {
    const { updates, container, warn } = setup()
    container.addEventListener = (() => {
      throw new Error('boom')
    }) as typeof container.addEventListener
    await expect(updates.start()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('the first install is not an update', () => {
  it('a new worker that installs while no worker controls the page does not announce anything, and its claim reloads nothing', async () => {
    const { updates, container, registration, reload } = setup({ controlled: false })
    await updates.start()
    const first = new FakeWorker()

    registration.discover(first)
    registration.finishInstalling(first)
    container.takeOver() // the worker activated and claimed the page

    expect(updates.getSnapshot().updateReady).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('after that first claim, a later build IS an update', async () => {
    const { updates, container, registration } = setup({ controlled: false })
    await updates.start()
    const first = new FakeWorker()
    registration.discover(first)
    registration.finishInstalling(first)
    container.takeOver()

    const second = new FakeWorker()
    registration.discover(second)
    registration.finishInstalling(second)

    expect(updates.getSnapshot().updateReady).toBe(true)
  })
})

describe('an update', () => {
  it('is announced when a worker is already waiting at startup', async () => {
    const { updates, registration } = setup()
    registration.waiting = new FakeWorker()
    await updates.start()
    expect(updates.getSnapshot()).toEqual({ updateReady: true, applying: false, blocked: false, dismissed: false })
  })

  it('is announced when a new build finishes installing while the page is open', async () => {
    const { updates, registration } = setup()
    await updates.start()
    expect(updates.getSnapshot().updateReady).toBe(false)

    const next = new FakeWorker()
    registration.discover(next)
    expect(updates.getSnapshot().updateReady).toBe(false) // still installing: nothing to restart into yet
    registration.finishInstalling(next)

    expect(updates.getSnapshot().updateReady).toBe(true)
  })

  it('never reloads the running page by itself, however long it waits', async () => {
    const { updates, registration, reload, advance, signalResume } = setup()
    const waiting = new FakeWorker()
    registration.waiting = waiting
    await updates.start()
    signalResume()
    advance(24 * 3_600_000)
    expect(updates.getSnapshot().updateReady).toBe(true)
    expect(reload).not.toHaveBeenCalled()
    expect(waiting.postMessage).not.toHaveBeenCalled()
  })

  it('RESTART tells the waiting worker to take over and reloads ONLY once the new worker is in control', async () => {
    const { updates, registration, container, reload } = setup()
    const waiting = new FakeWorker()
    registration.waiting = waiting
    await updates.start()

    updates.restart()

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(updates.getSnapshot().applying).toBe(true)
    expect(reload).not.toHaveBeenCalled()

    container.takeOver()
    expect(reload).toHaveBeenCalledOnce()
    container.takeOver() // a second change must not reload again
    expect(reload).toHaveBeenCalledOnce()
  })

  it('RESTART twice posts one message', async () => {
    const { updates, registration } = setup()
    const waiting = new FakeWorker()
    registration.waiting = waiting
    await updates.start()
    updates.restart()
    updates.restart()
    expect(waiting.postMessage).toHaveBeenCalledOnce()
  })

  it('RESTART with nothing to restart into does nothing', async () => {
    const { updates, reload, container } = setup()
    await updates.start()
    updates.restart()
    expect(updates.getSnapshot().applying).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(container.register).toHaveBeenCalledOnce()
  })

  it('if the new worker never takes over, the button works again after a while', async () => {
    const { updates, registration, advance } = setup()
    registration.waiting = new FakeWorker()
    await updates.start()
    updates.restart()
    expect(updates.getSnapshot().applying).toBe(true)

    advance(APPLY_TIMEOUT_MS)

    expect(updates.getSnapshot()).toMatchObject({ applying: false, updateReady: true })
  })

  it('a worker that cannot be messaged is reported and the player can try again', async () => {
    const { updates, registration, warn } = setup()
    const waiting = new FakeWorker()
    waiting.postMessage.mockImplementationOnce(() => {
      throw new Error('detached')
    })
    registration.waiting = waiting
    await updates.start()

    updates.restart()

    expect(warn).toHaveBeenCalledOnce()
    expect(updates.getSnapshot()).toMatchObject({ applying: false, updateReady: true })
  })

  it('a build that was replaced before it could activate stops being offered', async () => {
    const { updates, registration } = setup()
    const waiting = new FakeWorker()
    registration.waiting = waiting
    await updates.start()
    expect(updates.getSnapshot().updateReady).toBe(true)

    waiting.become('redundant')

    expect(updates.getSnapshot().updateReady).toBe(false)
  })
})

describe('RESTART while another app window is open (the worker declines to switch)', () => {
  const blockedReply = { type: 'UPDATE_BLOCKED', windows: 2 }

  async function pendingRestart() {
    const context = setup()
    const waiting = new FakeWorker()
    context.registration.waiting = waiting
    await context.updates.start()
    context.updates.restart()
    return { ...context, waiting }
  }

  it('the page and the worker use the same message names', () => {
    expect(RESTART_REQUEST_MESSAGE).toBe(SKIP_WAITING_MESSAGE)
    expect(RESTART_BLOCKED_MESSAGE).toBe(UPDATE_BLOCKED_MESSAGE)
  })

  it('leaves the RESTARTING state, reports that it is blocked, keeps the update ready and reloads nothing', async () => {
    const { updates, container, reload } = await pendingRestart()
    expect(updates.getSnapshot()).toMatchObject({ applying: true, blocked: false })

    container.receive(blockedReply)

    expect(updates.getSnapshot()).toEqual({ updateReady: true, applying: false, blocked: true, dismissed: false })
    expect(reload).not.toHaveBeenCalled()
  })

  it('pressing RESTART again (after the other window is closed) asks again and clears the blocked state', async () => {
    const { updates, container, waiting } = await pendingRestart()
    container.receive(blockedReply)

    updates.restart()

    expect(waiting.postMessage).toHaveBeenCalledTimes(2)
    expect(waiting.postMessage).toHaveBeenLastCalledWith({ type: 'SKIP_WAITING' })
    expect(updates.getSnapshot()).toMatchObject({ applying: true, blocked: false })
  })

  it('and when that second attempt succeeds, the page reloads exactly once', async () => {
    const { updates, container, reload } = await pendingRestart()
    container.receive(blockedReply)
    updates.restart()

    container.takeOver() // the worker activated this time
    container.takeOver()

    expect(reload).toHaveBeenCalledOnce()
    expect(updates.getSnapshot().blocked).toBe(false)
  })

  it('can be blocked again, any number of times, without ever reloading', async () => {
    const { updates, container, reload } = await pendingRestart()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      container.receive(blockedReply)
      expect(updates.getSnapshot()).toMatchObject({ applying: false, blocked: true })
      updates.restart()
    }
    expect(reload).not.toHaveBeenCalled()
  })

  it('the blocked answer replaces the 10-second recovery: nothing else changes later', async () => {
    const { updates, container, advance } = await pendingRestart()
    container.receive(blockedReply)
    const settled = updates.getSnapshot()

    advance(APPLY_TIMEOUT_MS * 3)

    expect(updates.getSnapshot()).toBe(settled)
  })

  it('an answer nobody asked for is ignored (no RESTART is pending)', async () => {
    const { updates, container, registration } = setup()
    registration.waiting = new FakeWorker()
    await updates.start()
    const before = updates.getSnapshot()

    container.receive(blockedReply)

    expect(updates.getSnapshot()).toBe(before)
  })

  it.each([undefined, null, 'UPDATE_BLOCKED', 42, {}, { type: 'OTHER' }, { type: 'update_blocked' }])('ignores the message %j', async (data) => {
    const { updates, container } = await pendingRestart()
    container.receive(data)
    expect(updates.getSnapshot()).toMatchObject({ applying: true, blocked: false })
  })

  it('LATER still hides the notice, and nothing reloads', async () => {
    const { updates, container, reload } = await pendingRestart()
    container.receive(blockedReply)

    updates.later()

    expect(updates.getSnapshot()).toMatchObject({ updateReady: true, dismissed: true })
    expect(reload).not.toHaveBeenCalled()
  })

  it('a NEWER build supersedes the blocked state and is announced afresh', async () => {
    const { updates, container, registration } = await pendingRestart()
    container.receive(blockedReply)

    const newer = new FakeWorker()
    registration.discover(newer)
    registration.finishInstalling(newer)

    expect(updates.getSnapshot()).toEqual({ updateReady: true, applying: false, blocked: false, dismissed: false })
  })

  it('a first install never involves it: a stray answer changes nothing', async () => {
    const { updates, container, registration } = setup({ controlled: false })
    await updates.start()
    const first = new FakeWorker()
    registration.discover(first)
    registration.finishInstalling(first)
    container.takeOver()

    container.receive(blockedReply)

    expect(updates.getSnapshot()).toEqual({ updateReady: false, applying: false, blocked: false, dismissed: false })
  })
})

describe('LATER', () => {
  it('hides the notice for the session but keeps the update ready', async () => {
    const { updates, registration, reload } = setup()
    registration.waiting = new FakeWorker()
    await updates.start()

    updates.later()

    expect(updates.getSnapshot()).toEqual({ updateReady: true, applying: false, blocked: false, dismissed: true })
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not survive a reload: a fresh instance shows the notice again', async () => {
    const first = setup()
    first.registration.waiting = new FakeWorker()
    await first.updates.start()
    first.updates.later()

    const afterReload = setup()
    afterReload.registration.waiting = new FakeWorker()
    await afterReload.updates.start()

    expect(afterReload.updates.getSnapshot().dismissed).toBe(false)
  })

  it('a NEWER build supersedes the postponed one and is announced again', async () => {
    const { updates, registration } = setup()
    registration.waiting = new FakeWorker()
    await updates.start()
    updates.later()

    const newer = new FakeWorker()
    registration.discover(newer)
    registration.finishInstalling(newer)

    expect(updates.getSnapshot()).toMatchObject({ updateReady: true, dismissed: false })
  })
})

describe('another tab applied the update', () => {
  it('this page is offered a restart, never reloaded under the player', async () => {
    const { updates, container, reload } = setup()
    await updates.start()

    container.takeOver() // not requested by this page

    expect(updates.getSnapshot()).toMatchObject({ updateReady: true, applying: false })
    expect(reload).not.toHaveBeenCalled()
  })

  it('RESTART then reloads once, with no waiting worker needed', async () => {
    const { updates, container, reload } = setup()
    await updates.start()
    container.takeOver()

    updates.restart()
    updates.restart()

    expect(reload).toHaveBeenCalledOnce()
  })
})

describe('update checks', () => {
  it('runs on resume signals, at most once per interval', async () => {
    const { updates, registration, signalResume, advance } = setup()
    await updates.start()

    signalResume()
    signalResume()
    advance(UPDATE_CHECK_INTERVAL_MS - 1)
    signalResume()
    expect(registration.update).toHaveBeenCalledTimes(1)

    advance(1)
    signalResume()
    expect(registration.update).toHaveBeenCalledTimes(2)
  })

  it('a failing check (offline) is silent and harmless', async () => {
    const { updates, registration, signalResume, warn } = setup()
    registration.update.mockRejectedValue(new TypeError('Failed to fetch'))
    await updates.start()

    expect(() => signalResume()).not.toThrow()
    await Promise.resolve()

    expect(warn).not.toHaveBeenCalled()
    expect(updates.getSnapshot().updateReady).toBe(false)
  })
})

describe('the store contract', () => {
  it('returns the same snapshot object until something changes (required by useSyncExternalStore)', async () => {
    const { updates, registration } = setup()
    await updates.start()
    const first = updates.getSnapshot()
    expect(updates.getSnapshot()).toBe(first)

    const second = new FakeWorker()
    registration.discover(second)
    registration.finishInstalling(second)

    expect(updates.getSnapshot()).not.toBe(first)
    const changed = updates.getSnapshot()
    updates.later()
    updates.later() // a repeat changes nothing
    expect(updates.getSnapshot()).not.toBe(changed)
    const settled = updates.getSnapshot()
    updates.later()
    expect(updates.getSnapshot()).toBe(settled)
  })

  it('notifies subscribers on change only, and stops after unsubscribe', async () => {
    const { updates, registration } = setup()
    await updates.start()
    const listener = vi.fn()
    const unsubscribe = updates.subscribe(listener)

    const worker = new FakeWorker()
    registration.discover(worker)
    registration.finishInstalling(worker)
    expect(listener).toHaveBeenCalledTimes(1)

    updates.later()
    expect(listener).toHaveBeenCalledTimes(2)
    updates.later()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    updates.restart()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('the real instance inside the Android app', () => {
  it('registers no service worker (the APK holds every file and updates arrive as a new APK)', async () => {
    const register = vi.fn()
    const scope = globalThis as { Capacitor?: unknown }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, addEventListener: vi.fn(), controller: null },
    })
    scope.Capacitor = { isNativePlatform: () => true }
    try {
      vi.resetModules()
      const { shellUpdates } = await import('./shellUpdates')
      await shellUpdates.start()
      expect(register).not.toHaveBeenCalled()
      expect(shellUpdates.getSnapshot().updateReady).toBe(false)
    } finally {
      delete scope.Capacitor
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
  })
})
