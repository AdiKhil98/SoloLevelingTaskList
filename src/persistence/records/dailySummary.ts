import {
  qualityOfSummaryCounts,
  streakEffectsOf,
  type DailySummary,
  type DayQuality,
  type StreakEffect,
} from '@/domain'
import {
  joinPath,
  parserFor,
  readBoolean,
  readDateKey,
  readEnum,
  readObject,
  readSafeInteger,
  readString,
  type RecordReader,
} from './readers'

const REQUIRED = [
  'dateKey',
  'eligibleCount',
  'completedCount',
  'occurrenceIds',
  'quality',
  'isPerfect',
  'dailyStreakEffect',
  'perfectStreakEffect',
  'questExp',
  'currentStreakAfter',
  'bestStreakAfter',
  'perfectStreakAfter',
  'finalizedAt',
  'finalizedLate',
] as const

const QUALITIES: readonly string[] = ['incomplete', 'completed', 'strong', 'perfect', 'no_active_quests']
const EFFECTS: readonly string[] = ['increment', 'reset', 'neutral']

const isQuality = (value: unknown): value is DayQuality => typeof value === 'string' && QUALITIES.includes(value)
const isEffect = (value: unknown): value is StreakEffect => typeof value === 'string' && EFFECTS.includes(value)

/**
 * Reads an untrusted value as a `DailySummary` and checks it against itself:
 * the stored quality must be the one its counts imply (exact ratio), and the
 * flags and streak effects must be the ones that quality dictates. Rules that
 * span records (the chain, the occurrences of the day) are in `validateDataset`.
 */
export const readDailySummary: RecordReader<DailySummary> = (collector, value, path) => {
  const source = readObject(collector, value, path, REQUIRED)
  if (source === undefined) return undefined

  const before = collector.issues.length
  const dateKey = readDateKey(collector, source, 'dateKey', path)
  const eligibleCount = readSafeInteger(collector, source, 'eligibleCount', path)
  const completedCount = readSafeInteger(collector, source, 'completedCount', path)
  const quality = readEnum(collector, source, 'quality', path, isQuality, 'a day quality')
  const isPerfect = readBoolean(collector, source, 'isPerfect', path)
  const dailyStreakEffect = readEnum(collector, source, 'dailyStreakEffect', path, isEffect, 'a streak effect')
  const perfectStreakEffect = readEnum(collector, source, 'perfectStreakEffect', path, isEffect, 'a streak effect')
  const questExp = readSafeInteger(collector, source, 'questExp', path)
  const currentStreakAfter = readSafeInteger(collector, source, 'currentStreakAfter', path)
  const bestStreakAfter = readSafeInteger(collector, source, 'bestStreakAfter', path)
  const perfectStreakAfter = readSafeInteger(collector, source, 'perfectStreakAfter', path)
  const finalizedAt = readSafeInteger(collector, source, 'finalizedAt', path)
  const finalizedLate = readBoolean(collector, source, 'finalizedLate', path)

  const idsPath = joinPath(path, 'occurrenceIds')
  let occurrenceIds: string[] | undefined
  if (!Array.isArray(source.occurrenceIds)) {
    collector.add(idsPath, 'not_an_array', 'Expected an array')
  } else {
    const ids: string[] = []
    let clean = true
    source.occurrenceIds.forEach((id: unknown, index) => {
      const read = readString(collector, { id }, 'id', joinPath(idsPath, index))
      if (read === undefined) clean = false
      else ids.push(read)
    })
    if (clean) occurrenceIds = ids
  }

  if (
    collector.issues.length > before ||
    dateKey === undefined ||
    eligibleCount === undefined ||
    completedCount === undefined ||
    quality === undefined ||
    isPerfect === undefined ||
    dailyStreakEffect === undefined ||
    perfectStreakEffect === undefined ||
    questExp === undefined ||
    currentStreakAfter === undefined ||
    bestStreakAfter === undefined ||
    perfectStreakAfter === undefined ||
    finalizedAt === undefined ||
    finalizedLate === undefined ||
    occurrenceIds === undefined
  ) {
    return undefined
  }

  const problem = (field: string, code: string, message: string): undefined => {
    collector.add(joinPath(path, field), code, message)
    return undefined
  }
  if (completedCount > eligibleCount) return problem('completedCount', 'out_of_range', 'Cannot exceed eligibleCount')
  if (occurrenceIds.length !== eligibleCount) {
    return problem('occurrenceIds', 'summary_count_mismatch', 'Must list exactly eligibleCount occurrences')
  }
  if (new Set(occurrenceIds).size !== occurrenceIds.length) {
    return problem('occurrenceIds', 'duplicate_id', 'An occurrence is listed more than once')
  }
  if (quality !== qualityOfSummaryCounts({ completedCount, eligibleCount })) {
    return problem('quality', 'summary_quality_mismatch', 'Differs from the quality its counts imply')
  }
  if (isPerfect !== (quality === 'perfect')) return problem('isPerfect', 'summary_flag_mismatch', 'Must be true only for a perfect day')
  const effects = streakEffectsOf(quality)
  if (dailyStreakEffect !== effects.daily) return problem('dailyStreakEffect', 'summary_effect_mismatch', 'Differs from the effect its quality dictates')
  if (perfectStreakEffect !== effects.perfect) return problem('perfectStreakEffect', 'summary_effect_mismatch', 'Differs from the effect its quality dictates')
  if (bestStreakAfter < currentStreakAfter) return problem('bestStreakAfter', 'out_of_range', 'Cannot be below currentStreakAfter')

  return {
    dateKey,
    eligibleCount,
    completedCount,
    occurrenceIds,
    quality,
    isPerfect,
    dailyStreakEffect,
    perfectStreakEffect,
    questExp,
    currentStreakAfter,
    bestStreakAfter,
    perfectStreakAfter,
    finalizedAt,
    finalizedLate,
  }
}

export const parseDailySummary = parserFor(readDailySummary)
