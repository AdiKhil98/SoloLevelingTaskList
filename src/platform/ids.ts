/**
 * Random identifiers for user-created records: the only place the application
 * reads environmental randomness (Web Crypto). The application layer receives
 * this as an explicit `IdSource` (see `@/application`), exactly like the clock;
 * the domain never sees a random source.
 *
 * `crypto.randomUUID()` exists only in secure contexts (HTTPS or localhost), so
 * it is missing when the app is opened over plain HTTP on a LAN address (for
 * example an Android phone reaching the dev server). `crypto.getRandomValues()`
 * is available in every context, so a UUID v4 is built from it when needed.
 * There is deliberately no `Math.random` fallback and no timestamp-based
 * fallback: with no cryptographic source at all, generation throws.
 *
 * This module imports no other layer.
 */

const HEX: readonly string[] = Array.from({ length: 256 }, (_, byte) =>
  byte.toString(16).padStart(2, '0'),
)

/** Formats 16 bytes as a UUID v4 (sets the version and variant bits). */
export function uuidV4FromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('A UUID needs exactly 16 bytes')
  const b = Uint8Array.from(bytes)
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80
  const h = (index: number) => HEX[b[index] ?? 0]
  return (
    `${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-` +
    `${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}`
  )
}

/** A random UUID v4 from the best available cryptographic source. */
export function randomUuid(): string {
  const cryptoApi: Crypto | undefined = globalThis.crypto
  if (cryptoApi !== undefined && typeof cryptoApi.randomUUID === 'function') {
    // Called as a method: a detached `randomUUID` throws "Illegal invocation".
    return cryptoApi.randomUUID()
  }
  if (cryptoApi !== undefined && typeof cryptoApi.getRandomValues === 'function') {
    return uuidV4FromBytes(cryptoApi.getRandomValues(new Uint8Array(16)))
  }
  throw new Error('No cryptographic random source is available in this environment')
}

export const systemIds = {
  /** A fresh random UUID v4 (lowercase, hyphenated). */
  uuid: (): string => randomUuid(),
}
