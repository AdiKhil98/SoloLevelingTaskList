import { describe, expect, it } from 'vitest'
import { canonicalEquals, canonicalStringify, canonicalStringifyPretty } from './canonical'

describe('canonical JSON', () => {
  it('sorts object keys recursively and leaves array order alone', () => {
    expect(canonicalStringify({ b: 1, a: { d: [3, 1, 2], c: null } })).toBe('{"a":{"c":null,"d":[3,1,2]},"b":1}')
  })

  it('serializes equal data identically regardless of insertion order', () => {
    expect(canonicalStringify({ x: 1, y: 2 })).toBe(canonicalStringify({ y: 2, x: 1 }))
    expect(canonicalEquals({ x: 1, y: [1, { q: 1, p: 2 }] }, { y: [1, { p: 2, q: 1 }], x: 1 })).toBe(true)
    expect(canonicalEquals({ x: 1 }, { x: 2 })).toBe(false)
  })

  it('omits undefined properties, like JSON', () => {
    expect(canonicalStringify({ a: undefined, b: 1 })).toBe('{"b":1}')
    expect(canonicalEquals({ a: undefined }, {})).toBe(true)
  })

  it('refuses values JSON cannot represent', () => {
    expect(() => canonicalStringify({ a: Number.NaN })).toThrow(TypeError)
    expect(() => canonicalStringify({ a: Infinity })).toThrow(TypeError)
    expect(() => canonicalStringify({ a: 1n })).toThrow(TypeError)
  })

  it('keeps a __proto__ key from untrusted JSON as plain data', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"a":1}') as object
    expect(canonicalStringify(hostile)).toBe('{"__proto__":{"polluted":true},"a":1}')
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  it('pretty form carries the same data and re-canonicalizes to the compact form', () => {
    const value = { b: [1, 2], a: 'x' }
    expect(canonicalStringifyPretty(value)).toContain('\n')
    expect(canonicalStringify(JSON.parse(canonicalStringifyPretty(value)))).toBe(canonicalStringify(value))
  })
})
