// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { PLAYER_PROFILE_ID } from '../config'
import { getPlayerProfile, countTemplates } from '../repositories/playerProfile'
import { createTemplate } from '../repositories/templates'
import { buildTemplate, DatabaseTracker, deleteRaw, readRaw, snapshotAll, writeRaw } from '../test-utils/helpers'
import { parsePlayerProfile } from '../records/playerProfile'
import { completeAwakeningAtomically } from './completeAwakening'
import { renamePlayerAtomically } from './renamePlayer'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

const NON_PROFILE_STORES = ['questTemplates', 'questOccurrences', 'questCompletions', 'xpTransactions', 'dailySummaries', 'weeklyBoards', 'weeklyRewardClaims'] as const

async function others(database: Awaited<ReturnType<typeof tracker.open>>) {
  const all = await snapshotAll(database)
  return Object.fromEntries(NON_PROFILE_STORES.map((store) => [store, all[store]]))
}

describe('the player profile record', () => {
  const parse = (value: unknown) => parsePlayerProfile(value, 'profile')

  it('accepts the legacy row, a named row and an awakened row', () => {
    expect(parse({ id: 'player', name: null, awakenedAt: null }).ok).toBe(true)
    expect(parse({ id: 'player', name: 'Ada', awakenedAt: 0 }).ok).toBe(true)
    expect(parse({ id: 'player', name: '🐺', awakenedAt: 1_700_000_000_000 }).ok).toBe(true)
  })

  it.each([
    ['not an object', 'player'],
    ['an array', []],
    ['a wrong id', { id: 'p', name: null, awakenedAt: null }],
    ['an undefined name', { id: 'player', awakenedAt: null }],
    ['a number name', { id: 'player', name: 7, awakenedAt: null }],
    ['a blank string name', { id: 'player', name: '   ', awakenedAt: null }],
    ['a padded name', { id: 'player', name: ' Ada', awakenedAt: null }],
    ['an unsafe awakenedAt', { id: 'player', name: null, awakenedAt: -1 }],
    ['a string awakenedAt', { id: 'player', name: null, awakenedAt: '5' }],
    ['an extra field', { id: 'player', name: null, awakenedAt: null, onboarded: true }],
  ])('rejects %s', (_label, value) => {
    expect(parse(value).ok).toBe(false)
  })
})

describe('getPlayerProfile', () => {
  it('reports absent on a database that has not awakened', async () => {
    const database = await tracker.open()
    expect(await getPlayerProfile(database)).toEqual({ status: 'absent' })
  })

  it('reports the valid row', async () => {
    const database = await tracker.open()
    await completeAwakeningAtomically(database, { name: 'Ada', awakenedAt: 10 })
    expect(await getPlayerProfile(database)).toEqual({ status: 'valid', profile: { id: 'player', name: 'Ada', awakenedAt: 10 } })
  })

  it('reports a damaged row as invalid instead of throwing (identity must never lock the player out)', async () => {
    const database = await tracker.open()
    await writeRaw(database, 'playerProfile', { id: 'player', name: 'Ad\u0000a', awakenedAt: 10 })
    const reading = await getPlayerProfile(database)
    expect(reading.status).toBe('invalid')
    if (reading.status === 'invalid') expect(reading.issues.map((issue) => issue.code)).toContain('invalid_player_name')
  })
})

describe('countTemplates', () => {
  it('counts every stored template, archived or not', async () => {
    const database = await tracker.open()
    expect(await countTemplates(database)).toBe(0)
    await createTemplate(database, buildTemplate({ id: 'tpl_a' }))
    await createTemplate(database, buildTemplate({ id: 'tpl_b', status: 'archived', activeUntil: buildTemplate().activeFrom }))
    expect(await countTemplates(database)).toBe(2)
  })
})

describe('completeAwakeningAtomically', () => {
  it('writes the profile row once and nothing else', async () => {
    const database = await tracker.open()
    const before = await others(database)

    const result = await completeAwakeningAtomically(database, { name: 'Ada', awakenedAt: 1_000 })

    expect(result).toEqual({ status: 'awakened', profile: { id: 'player', name: 'Ada', awakenedAt: 1_000 } })
    expect(await readRaw(database, 'playerProfile')).toEqual([{ id: 'player', name: 'Ada', awakenedAt: 1_000 }])
    expect(await others(database)).toEqual(before)
  })

  it('stores a skipped name as null', async () => {
    const database = await tracker.open()
    expect(await completeAwakeningAtomically(database, { name: null, awakenedAt: 1 })).toMatchObject({ status: 'awakened', profile: { name: null, awakenedAt: 1 } })
  })

  it('is idempotent: a repeat (or a second tab) never replaces the stored name or timestamp', async () => {
    const database = await tracker.open()
    await completeAwakeningAtomically(database, { name: 'Ada', awakenedAt: 1_000 })

    const again = await completeAwakeningAtomically(database, { name: 'Bob', awakenedAt: 9_999 })

    expect(again).toEqual({ status: 'already_awakened', profile: { id: 'player', name: 'Ada', awakenedAt: 1_000 } })
    expect(await readRaw(database, 'playerProfile')).toEqual([{ id: 'player', name: 'Ada', awakenedAt: 1_000 }])
  })

  it('does not overwrite a legacy row either', async () => {
    const database = await tracker.open()
    await writeRaw(database, 'playerProfile', { id: 'player', name: null, awakenedAt: null })
    const result = await completeAwakeningAtomically(database, { name: 'Bob', awakenedAt: 5 })
    expect(result).toEqual({ status: 'already_awakened', profile: { id: 'player', name: null, awakenedAt: null } })
    expect(await readRaw(database, 'playerProfile')).toEqual([{ id: 'player', name: null, awakenedAt: null }])
  })

  it('leaves a damaged existing row alone and reports it as already awakened (no profile)', async () => {
    const database = await tracker.open()
    await writeRaw(database, 'playerProfile', { id: 'player', name: 7, awakenedAt: 1 })
    const result = await completeAwakeningAtomically(database, { name: 'Bob', awakenedAt: 5 })
    expect(result).toEqual({ status: 'already_awakened', profile: null })
    expect(await readRaw(database, 'playerProfile')).toEqual([{ id: 'player', name: 7, awakenedAt: 1 }])
  })

  it('refuses an invalid name or timestamp and writes nothing', async () => {
    const database = await tracker.open()
    await expect(completeAwakeningAtomically(database, { name: ' padded ', awakenedAt: 1 })).rejects.toMatchObject({ code: 'record_validation_failed' })
    await expect(completeAwakeningAtomically(database, { name: 'Ada', awakenedAt: 1.5 })).rejects.toMatchObject({ code: 'record_validation_failed' })
    expect(await readRaw(database, 'playerProfile')).toEqual([])
  })

  it('fails with a typed error when the database is closed, and writes nothing', async () => {
    const database = await tracker.open()
    database.close()
    await expect(completeAwakeningAtomically(database, { name: 'Ada', awakenedAt: 1 })).rejects.toMatchObject({ code: 'database_closed' })
  })
})

describe('renamePlayerAtomically', () => {
  it('changes only the name: awakenedAt is preserved and no other store is touched', async () => {
    const database = await tracker.open()
    await completeAwakeningAtomically(database, { name: 'Ada', awakenedAt: 1_000 })
    const before = await others(database)

    const result = await renamePlayerAtomically(database, { name: 'Bob' })

    expect(result).toEqual({ status: 'renamed', profile: { id: 'player', name: 'Bob', awakenedAt: 1_000 } })
    expect(await others(database)).toEqual(before)
  })

  it('renames a legacy row and keeps awakenedAt null (it never becomes "not awakened")', async () => {
    const database = await tracker.open()
    await writeRaw(database, 'playerProfile', { id: 'player', name: null, awakenedAt: null })
    expect(await renamePlayerAtomically(database, { name: 'Ada' })).toEqual({
      status: 'renamed',
      profile: { id: 'player', name: 'Ada', awakenedAt: null },
    })
  })

  it('clears the name back to none (null)', async () => {
    const database = await tracker.open()
    await completeAwakeningAtomically(database, { name: 'Ada', awakenedAt: 1 })
    expect(await renamePlayerAtomically(database, { name: null })).toMatchObject({ status: 'renamed', profile: { name: null, awakenedAt: 1 } })
  })

  it('reports unchanged and writes nothing when the name is the same', async () => {
    const database = await tracker.open()
    await completeAwakeningAtomically(database, { name: 'Ada', awakenedAt: 1 })
    expect(await renamePlayerAtomically(database, { name: 'Ada' })).toEqual({ status: 'unchanged', profile: { id: 'player', name: 'Ada', awakenedAt: 1 } })
  })

  it('repairs a MISSING row (a database with data that lost its profile): the row exists afterwards, awakenedAt null', async () => {
    const database = await tracker.open()
    await completeAwakeningAtomically(database, { name: 'Ada', awakenedAt: 1 })
    await deleteRaw(database, 'playerProfile', PLAYER_PROFILE_ID)

    expect(await renamePlayerAtomically(database, { name: 'Bob' })).toEqual({
      status: 'renamed',
      profile: { id: 'player', name: 'Bob', awakenedAt: null },
    })
    expect(await getPlayerProfile(database)).toMatchObject({ status: 'valid' })
  })

  it('repairs a DAMAGED row, keeping a still-valid awakenedAt and otherwise using the legacy null', async () => {
    const database = await tracker.open()
    await writeRaw(database, 'playerProfile', { id: 'player', name: 'bad\u0000', awakenedAt: 42 })
    expect(await renamePlayerAtomically(database, { name: 'Ada' })).toMatchObject({ status: 'renamed', profile: { name: 'Ada', awakenedAt: 42 } })

    await writeRaw(database, 'playerProfile', { id: 'player', name: 'bad\u0000', awakenedAt: 'soon' })
    expect(await renamePlayerAtomically(database, { name: 'Ada' })).toMatchObject({ status: 'renamed', profile: { name: 'Ada', awakenedAt: null } })
  })

  it('refuses an invalid name and leaves the stored profile exactly as it was', async () => {
    const database = await tracker.open()
    await completeAwakeningAtomically(database, { name: 'Ada', awakenedAt: 1 })
    await expect(renamePlayerAtomically(database, { name: ' padded ' })).rejects.toMatchObject({ code: 'record_validation_failed' })
    expect(await readRaw(database, 'playerProfile')).toEqual([{ id: 'player', name: 'Ada', awakenedAt: 1 }])
  })
})
