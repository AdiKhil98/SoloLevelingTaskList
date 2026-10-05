import { describe, expect, it, vi } from 'vitest'
import {
  APPLY_TIMEOUT_MS,
  createShellUpdates,
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
  private readonly listeners: (() => void)[] = []
  addEventListener(_type: 'controllerchange', listener: () => void): void {
    this.listeners.push(listener)
  }
  /** The active worker changed (a new build took over, or the first install claimed this page). */
  takeOver(): void {
    this.controller = {}
    for (const listener of this.listeners) listener()
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
    expect(updates.getSnapshot()).toEqual({ updateReady: false, applying: false, dismissed: false })
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
    container.addEventListener = () => {
      throw new Error('boom')
    }
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
    expect(updates.getSnapshot()).toEqual({ updateReady: true, applying: false, dismissed: false })
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

describe('LATER', () => {
  it('hides the notice for the session but keeps the update ready', async () => {
    const { updates, registration, reload } = setup()
    registration.waiting = new FakeWorker()
    await updates.start()

    updates.later()

    expect(updates.getSnapshot()).toEqual({ updateReady: true, applying: false, dismissed: true })
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
