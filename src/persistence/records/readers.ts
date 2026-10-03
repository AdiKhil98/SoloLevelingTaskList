import { isDateKey, err, ok, type DateKey, type Result } from '@/domain'
import type { ValidationIssue } from '../errors'

/** Stop recording after this many issues so a garbage backup stays reportable. */
export const MAX_ISSUES = 50

/** Accumulates validation problems while a record is being read. */
export class IssueCollector {
  readonly issues: ValidationIssue[] = []
  #truncated = false

  add(path: string, code: string, message: string): void {
    if (this.issues.length < MAX_ISSUES) {
      this.issues.push({ path, code, message })
    } else if (!this.#truncated) {
      this.#truncated = true
      this.issues.push({
        path: '',
        code: 'too_many_issues',
        message: `Only the first ${MAX_ISSUES} issues are reported`,
      })
    }
  }

  get isClean(): boolean {
    return this.issues.length === 0
  }
}

export type RecordReader<T> = (
  collector: IssueCollector,
  value: unknown,
  path: string,
) => T | undefined

/** Adapts a collector-style reader into a standalone parse function. */
export function parserFor<T>(
  read: RecordReader<T>,
): (value: unknown, path?: string) => Result<T, readonly ValidationIssue[]> {
  return (value, path = '') => {
    const collector = new IssueCollector()
    const parsed = read(collector, value, path)
    if (parsed === undefined || !collector.isClean) return err(collector.issues)
    return ok(parsed)
  }
}

export function joinPath(path: string, key: string | number): string {
  const segment = typeof key === 'number' ? `[${key}]` : key
  if (path === '') return segment
  return typeof key === 'number' ? `${path}${segment}` : `${path}.${segment}`
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readObject(
  collector: IssueCollector,
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) {
    collector.add(path, 'not_an_object', 'Expected an object')
    return undefined
  }
  const known = new Set([...allowedKeys, ...optionalKeys])
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      collector.add(joinPath(path, key), 'unexpected_field', `Unexpected field "${key}"`)
    }
  }
  return value
}

export function readString(
  collector: IssueCollector,
  source: Record<string, unknown>,
  key: string,
  path: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): string | undefined {
  const value = source[key]
  const at = joinPath(path, key)
  if (typeof value !== 'string') {
    collector.add(at, 'not_a_string', 'Expected a string')
    return undefined
  }
  if (!allowEmpty && value.trim() === '') {
    collector.add(at, 'empty_string', 'Must not be empty')
    return undefined
  }
  return value
}

export function readNullableString(
  collector: IssueCollector,
  source: Record<string, unknown>,
  key: string,
  path: string,
): string | null | undefined {
  if (source[key] === null) return null
  return readString(collector, source, key, path)
}

export function readSafeInteger(
  collector: IssueCollector,
  source: Record<string, unknown>,
  key: string,
  path: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number | undefined {
  const value = source[key]
  const at = joinPath(path, key)
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    collector.add(at, 'not_a_safe_integer', 'Expected a safe integer')
    return undefined
  }
  if (value < min || value > max) {
    collector.add(at, 'out_of_range', `Must be between ${min} and ${max}`)
    return undefined
  }
  return value
}

export function readDateKey(
  collector: IssueCollector,
  source: Record<string, unknown>,
  key: string,
  path: string,
): DateKey | undefined {
  const value = source[key]
  if (!isDateKey(value)) {
    collector.add(joinPath(path, key), 'invalid_date_key', 'Expected a valid YYYY-MM-DD date')
    return undefined
  }
  return value
}

export function readNullableDateKey(
  collector: IssueCollector,
  source: Record<string, unknown>,
  key: string,
  path: string,
): DateKey | null | undefined {
  if (source[key] === null) return null
  return readDateKey(collector, source, key, path)
}

export function readEnum<T extends string>(
  collector: IssueCollector,
  source: Record<string, unknown>,
  key: string,
  path: string,
  isMember: (value: unknown) => value is T,
  description: string,
): T | undefined {
  const value = source[key]
  if (!isMember(value)) {
    collector.add(joinPath(path, key), 'invalid_value', `Expected ${description}`)
    return undefined
  }
  return value
}

export function readBoolean(
  collector: IssueCollector,
  source: Record<string, unknown>,
  key: string,
  path: string,
): boolean | undefined {
  const value = source[key]
  if (typeof value !== 'boolean') {
    collector.add(joinPath(path, key), 'not_a_boolean', 'Expected true or false')
    return undefined
  }
  return value
}
