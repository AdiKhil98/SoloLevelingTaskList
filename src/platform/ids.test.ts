import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUuid, systemIds, uuidV4FromBytes } from './ids'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('uuidV4FromBytes', () => {
  it('formats 16 bytes as a lowercase hyphenated UUID v4 with the version and variant bits set', () => {
    const allOnes = new Uint8Array(16).fill(0xff)
    expect(uuidV4FromBytes(allOnes)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(uuidV4FromBytes(new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000')
  })

  it('does not modify its input', () => {
    const bytes = new Uint8Array(16).fill(0xff)
    uuidV4FromBytes(bytes)
    expect([...bytes]).toEqual(new Array(16).fill(0xff))
  })

  it('rejects the wrong number of bytes', () => {
    expect(() => uuidV4FromBytes(new Uint8Array(15))).toThrow()
  })
})

describe('randomUuid / systemIds', () => {
  it('produces a valid UUID v4 with the platform crypto', () => {
    expect(systemIds.uuid()).toMatch(UUID_V4)
  })

  it('produces distinct ids across a large sample', () => {
    const sample = new Set(Array.from({ length: 2000 }, () => systemIds.uuid()))
    expect(sample.size).toBe(2000)
  })

  it('uses crypto.randomUUID when it is available, called as a method', () => {
    const randomUUID = vi.fn(function (this: unknown) {
      if (this === undefined) throw new TypeError('Illegal invocation')
      return '11111111-1111-4111-8111-111111111111'
    })
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() })

    expect(randomUuid()).toBe('11111111-1111-4111-8111-111111111111')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('falls back to getRandomValues when randomUUID is unavailable (plain-HTTP LAN origin)', () => {
    const getRandomValues = vi.fn(<T extends ArrayBufferView>(array: T): T => {
      const bytes = array as unknown as Uint8Array
      bytes.forEach((_, index) => {
        bytes[index] = index * 17 + 3
      })
      return array
    })
    // A real insecure context exposes getRandomValues but not randomUUID.
    vi.stubGlobal('crypto', { getRandomValues })

    const id = randomUuid()

    expect(getRandomValues).toHaveBeenCalledTimes(1)
    expect(id).toMatch(UUID_V4)
  })

  it('fallback ids are distinct and well formed with the real random source', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })

    const sample = new Set(Array.from({ length: 2000 }, () => randomUuid()))

    expect(sample.size).toBe(2000)
    for (const id of sample) expect(id).toMatch(UUID_V4)
  })

  it('never uses Math.random or the clock, on either path', () => {
    const random = vi.spyOn(Math, 'random')
    const now = vi.spyOn(Date, 'now')

    systemIds.uuid()
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    systemIds.uuid()

    expect(random).not.toHaveBeenCalled()
    expect(now).not.toHaveBeenCalled()
  })

  it('throws instead of inventing an id when there is no cryptographic source', () => {
    const random = vi.spyOn(Math, 'random')
    vi.stubGlobal('crypto', {})

    expect(() => randomUuid()).toThrow(/random source/)
    vi.stubGlobal('crypto', undefined)
    expect(() => randomUuid()).toThrow(/random source/)
    expect(random).not.toHaveBeenCalled()
  })
})
