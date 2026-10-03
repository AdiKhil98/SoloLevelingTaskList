import type { Result } from '@/domain'
import { PersistenceError, type ValidationIssue } from '../errors'

type Parse<T> = (value: unknown, path?: string) => Result<T, readonly ValidationIssue[]>

/** Validates a record read from IndexedDB; corrupt data is never returned. */
export function parseStored<T>(parse: Parse<T>, value: unknown, description: string): T {
  const parsed = parse(value, description)
  if (!parsed.ok) {
    throw new PersistenceError(
      'record_validation_failed',
      `Stored ${description} is invalid`,
      { issues: parsed.error },
    )
  }
  return parsed.value
}

/** Validates a record on its way into IndexedDB; invalid data is never written. */
export function parseForWrite<T>(parse: Parse<T>, value: unknown, description: string): T {
  const parsed = parse(value, description)
  if (!parsed.ok) {
    throw new PersistenceError(
      'record_validation_failed',
      `The ${description} to store is invalid`,
      { issues: parsed.error },
    )
  }
  return parsed.value
}
