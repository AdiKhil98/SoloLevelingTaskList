import { isStoredPlayerName, type EpochMs } from '@/domain'
import { PLAYER_PROFILE_ID } from '../config'
import { joinPath, parserFor, readObject, readSafeInteger, type RecordReader } from './readers'

/**
 * The one player profile row (schema v5, Phase 11).
 *
 * Row existence is the ONLY "Awakening is complete" signal: no row means the
 * player has not been awakened yet. Neither field below may ever be read as that
 * signal.
 *
 *  - `name`: the chosen player name, already normalized (`parsePlayerName`), or
 *    `null` for "no name chosen". The screens show the generic `PLAYER` label.
 *  - `awakenedAt`: the real instant Awakening was accepted, or `null` for a LEGACY
 *    player: one whose database existed before Phase 11 and who therefore has no
 *    real Awakening timestamp. `null` does not mean onboarding is required.
 *
 * It is identity only. Nothing in the engine reads it, and it never affects EXP,
 * levels, streaks, scores or achievements.
 */
export interface PlayerProfileRecord {
  readonly id: typeof PLAYER_PROFILE_ID
  readonly name: string | null
  readonly awakenedAt: EpochMs | null
}

const REQUIRED = ['id', 'name', 'awakenedAt'] as const

/** Reads an untrusted value as the player profile row (strict: any deviation is an issue). */
export const readPlayerProfile: RecordReader<PlayerProfileRecord> = (collector, value, path) => {
  const source = readObject(collector, value, path, REQUIRED)
  if (source === undefined) return undefined

  const before = collector.issues.length
  if (source.id !== PLAYER_PROFILE_ID) {
    collector.add(joinPath(path, 'id'), 'invalid_value', `Expected "${PLAYER_PROFILE_ID}"`)
  }
  let name: string | null | undefined
  if (source.name === null) {
    name = null
  } else if (isStoredPlayerName(source.name)) {
    name = source.name
  } else {
    collector.add(joinPath(path, 'name'), 'invalid_player_name', 'Expected null or a valid, normalized player name')
  }
  const awakenedAt = source.awakenedAt === null ? null : readSafeInteger(collector, source, 'awakenedAt', path)

  if (collector.issues.length > before || name === undefined || awakenedAt === undefined) return undefined
  return { id: PLAYER_PROFILE_ID, name, awakenedAt }
}

export const parsePlayerProfile = parserFor(readPlayerProfile)
