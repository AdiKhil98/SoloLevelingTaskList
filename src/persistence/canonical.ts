/**
 * Canonical JSON: object keys sorted (UTF-16 order, recursively), properties
 * holding `undefined` omitted, arrays left in order. The same plain data
 * always serializes to the same text, which is what lets backups be compared
 * and checksummed deterministically.
 */

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (typeof value === 'object' && value !== null) {
    // Null prototype: a `__proto__` key from untrusted JSON stays an ordinary own property.
    const sorted: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key]
      if (child !== undefined) sorted[key] = sortKeys(child)
    }
    return sorted
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Canonical JSON cannot represent a non-finite number')
  }
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`Canonical JSON cannot represent a ${typeof value}`)
  }
  return value
}

/** Compact canonical form; the input to checksums and equality checks. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

/** Canonical key order, indented for people. Re-canonicalizing yields the compact form. */
export function canonicalStringifyPretty(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2)
}

/** True when two plain values have identical canonical form. */
export function canonicalEquals(a: unknown, b: unknown): boolean {
  return canonicalStringify(a) === canonicalStringify(b)
}
