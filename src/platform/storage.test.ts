import { describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './storage'

describe('requestPersistentStorage (best effort, silent, never throws)', () => {
  it('asks once and reports a grant', async () => {
    const manager = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) }
    await expect(requestPersistentStorage(manager)).resolves.toBe('granted')
    expect(manager.persist).toHaveBeenCalledOnce()
  })

  it('a refusal is a normal answer, not a failure', async () => {
    const manager = { persisted: vi.fn(async () => false), persist: vi.fn(async () => false) }
    await expect(requestPersistentStorage(manager)).resolves.toBe('denied')
  })

  it('does not ask again when storage is already persistent', async () => {
    const manager = { persisted: vi.fn(async () => true), persist: vi.fn(async () => true) }
    await expect(requestPersistentStorage(manager)).resolves.toBe('already')
    expect(manager.persist).not.toHaveBeenCalled()
  })

  it('works without persisted()', async () => {
    await expect(requestPersistentStorage({ persist: async () => true })).resolves.toBe('granted')
  })

  it.each([
    ['no storage manager (plain HTTP, old browser)', undefined],
    ['a manager without persist()', {}],
  ])('reports unavailable for %s', async (_name, manager) => {
    await expect(requestPersistentStorage(manager)).resolves.toBe('unavailable')
  })

  it('swallows a rejecting or throwing API', async () => {
    await expect(requestPersistentStorage({ persist: async () => Promise.reject(new Error('NotAllowedError')) })).resolves.toBe('failed')
    await expect(
      requestPersistentStorage({
        persisted: () => {
          throw new Error('SecurityError')
        },
        persist: async () => true,
      }),
    ).resolves.toBe('failed')
  })

  it('uses navigator.storage by default and is harmless where it does not exist (jsdom)', async () => {
    await expect(requestPersistentStorage()).resolves.toBe('unavailable')
  })
})
