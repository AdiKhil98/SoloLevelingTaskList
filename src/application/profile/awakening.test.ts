// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { DATABASE_NAME, exportBackup, getPlayerProfile, listTemplates, type PersistenceDatabase } from '@/persistence'
import { completeTodayQuest } from '../completion/completeTodayQuest'
import { loadPlayerStatus } from '../player/loadPlayerStatus'
import { startApplication } from '../initialize'
import { completeAwakening, loadAwakeningState, renamePlayer } from './awakening'
import { createTestContext, noonOn, ZONE, type TestContext } from '../test-utils/helpers'

const TODAY = '2026-10-05'
const opened: PersistenceDatabase[] = []

async function setup(): Promise<TestContext> {
  const testContext = await createTestContext(TODAY)
  opened.push(testContext.database)
  return testContext
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

/** Writes (or deletes) the raw profile row through a separate raw connection, to plant damage. */
async function rawProfile(factory: IDBFactory, action: { put: unknown } | { delete: true }): Promise<void> {
  const connection = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await new Promise<void>((resolve, reject) => {
    const transaction = connection.transaction('playerProfile', 'readwrite')
    const store = transaction.objectStore('playerProfile')
    if ('put' in action) store.put(action.put)
    else store.delete('player')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  connection.close()
}

/** Everything the game stores except the profile row. */
async function progressionData(database: PersistenceDatabase) {
  const { playerProfile: _profile, ...rest } = (await exportBackup(database, { exportedAt: 1, exportedFromTimeZone: ZONE, appVersion: 't' })).data
  void _profile
  return rest
}

describe('loadAwakeningState', () => {
  it('requires Awakening on a brand-new database (no row, no quests)', async () => {
    const { context } = await setup()
    expect(await loadAwakeningState(context)).toEqual({ status: 'required' })
  })

  it('is complete once Awakening was completed, with the chosen name', async () => {
    const { context } = await setup()
    await completeAwakening(context, 'Ada')
    expect(await loadAwakeningState(context)).toEqual({ status: 'complete', identity: { name: 'Ada' }, basis: 'profile' })
  })

  it('a LEGACY row (name null, awakenedAt null) is complete: awakenedAt null never means onboarding is required', async () => {
    const { context, factory } = await setup()
    await rawProfile(factory, { put: { id: 'player', name: null, awakenedAt: null } })
    expect(await loadAwakeningState(context)).toEqual({ status: 'complete', identity: { name: null }, basis: 'profile' })
  })

  it('a Skip is complete too, with no name', async () => {
    const { context } = await setup()
    await completeAwakening(context, null)
    expect(await loadAwakeningState(context)).toEqual({ status: 'complete', identity: { name: null }, basis: 'profile' })
  })

  it('a DAMAGED row still counts as awakened (the fallback name is none) and nothing is written to repair it', async () => {
    const { context, database, factory } = await setup()
    const damaged = { id: 'player', name: 'bad\u0000name', awakenedAt: 5 }
    await rawProfile(factory, { put: damaged })

    expect(await loadAwakeningState(context)).toEqual({ status: 'complete', identity: { name: null }, basis: 'damaged_profile' })
    expect(await getPlayerProfile(database)).toMatchObject({ status: 'invalid' })
  })

  it('a MISSING row on a database that already has quests is never a first launch (no repair write either)', async () => {
    const { context, database, factory } = await setup()
    await startApplication(context) // seeds the six default quests
    await rawProfile(factory, { delete: true })

    expect(await loadAwakeningState(context)).toEqual({ status: 'complete', identity: { name: null }, basis: 'existing_data' })
    expect(await getPlayerProfile(database)).toEqual({ status: 'absent' })
  })

  it('is read-only: asking changes nothing and creates no quest', async () => {
    const { context, database } = await setup()
    await loadAwakeningState(context)
    expect(await getPlayerProfile(database)).toEqual({ status: 'absent' })
    expect(await listTemplates(database)).toHaveLength(0)
  })
})

describe('completeAwakening', () => {
  it('writes the profile only: no quest, occurrence, completion, EXP row or summary exists afterwards', async () => {
    const { context, database } = await setup()
    const result = await completeAwakening(context, '  Ada  ')

    expect(result).toEqual({ status: 'awakened', identity: { name: 'Ada' } })
    expect(await getPlayerProfile(database)).toEqual({
      status: 'valid',
      profile: { id: 'player', name: 'Ada', awakenedAt: noonOn(TODAY) },
    })
    expect(await progressionData(database)).toEqual({
      questTemplates: [],
      questOccurrences: [],
      questCompletions: [],
      xpTransactions: [],
      dailySummaries: [],
      weeklyBoards: [],
      weeklyRewardClaims: [],
    })
  })

  it('stamps the real instant of the acceptance, from the injected clock', async () => {
    const { context, clock, database } = await setup()
    clock.set(1_700_000_000_000)
    await completeAwakening(context, 'Ada')
    expect(await getPlayerProfile(database)).toMatchObject({ profile: { awakenedAt: 1_700_000_000_000 } })
  })

  it.each([
    ['Unicode', 'אדי', 'אדי'],
    ['an emoji', '🐺', '🐺'],
    ['inner whitespace', 'Ada   Lovelace', 'Ada Lovelace'],
    ['markup characters (stored as plain text)', '<b>A</b>', '<b>A</b>'],
  ])('accepts %s', async (_label, typed, stored) => {
    const { context } = await setup()
    expect(await completeAwakening(context, typed)).toEqual({ status: 'awakened', identity: { name: stored } })
  })

  it('treats a blank typed name as no name (the UI never sends one: confirming needs a name, Skip sends null)', async () => {
    const { context } = await setup()
    expect(await completeAwakening(context, '   ')).toEqual({ status: 'awakened', identity: { name: null } })
  })

  it.each([
    ['too long', 'a'.repeat(21), 'too_long'],
    ['a control character', 'Ad\u0007a', 'invalid_characters'],
    ['an invisible character', 'Ad​a', 'invalid_characters'],
    ['nothing visible', '‍', 'no_visible_characters'],
  ] as const)('rejects %s and writes nothing', async (_label, typed, reason) => {
    const { context, database } = await setup()
    expect(await completeAwakening(context, typed)).toEqual({ status: 'rejected', reason })
    expect(await getPlayerProfile(database)).toEqual({ status: 'absent' })
    expect(await loadAwakeningState(context)).toEqual({ status: 'required' })
  })

  it('a repeat never replaces the stored name', async () => {
    const { context } = await setup()
    await completeAwakening(context, 'Ada')
    expect(await completeAwakening(context, 'Bob')).toEqual({ status: 'already_awakened', identity: { name: 'Ada' } })
    expect(await loadAwakeningState(context)).toMatchObject({ identity: { name: 'Ada' } })
  })

  it('when saving fails, onboarding is NOT complete: a typed failure, and the next launch is still a first launch', async () => {
    const { context, database, factory } = await setup()
    database.close()

    const failed = await completeAwakening(context, 'Ada')
    expect(failed).toMatchObject({ status: 'failed', reason: 'database_unavailable' })

    const { openDatabase } = await import('@/persistence')
    const reopened = await openDatabase({ factory })
    opened.push(reopened)
    expect(await loadAwakeningState({ ...context, database: reopened })).toEqual({ status: 'required' })
  })

  it('then the normal startup runs and Level 1 is waiting: awakening grants no EXP and starts no progress by itself', async () => {
    const { context } = await setup()
    await completeAwakening(context, 'Ada')
    const { home } = await startApplication(context)
    expect(home.player).toMatchObject({ level: 1, totalExp: 0 })
    expect(home.today.quests).toHaveLength(6)
  })
})

describe('renamePlayer', () => {
  async function awakened(name: string | null = 'Ada') {
    const setupResult = await setup()
    await completeAwakening(setupResult.context, name)
    await startApplication(setupResult.context)
    return setupResult
  }

  it('renames, trims and normalizes, and reports the stored identity', async () => {
    const { context } = await awakened()
    expect(await renamePlayer(context, '  Bob  ')).toEqual({ status: 'renamed', identity: { name: 'Bob' } })
    expect(await renamePlayer(context, 'אדי')).toEqual({ status: 'renamed', identity: { name: 'אדי' } })
    expect(await loadAwakeningState(context)).toMatchObject({ identity: { name: 'אדי' } })
  })

  it('blank clears the name back to none', async () => {
    const { context } = await awakened()
    expect(await renamePlayer(context, '   ')).toEqual({ status: 'renamed', identity: { name: null } })
    expect(await renamePlayer(context, '')).toEqual({ status: 'unchanged', identity: { name: null } })
  })

  it('reports unchanged when the name is the same', async () => {
    const { context } = await awakened()
    expect(await renamePlayer(context, ' Ada ')).toEqual({ status: 'unchanged', identity: { name: 'Ada' } })
  })

  it('rejects an invalid name and keeps the old one', async () => {
    const { context } = await awakened()
    expect(await renamePlayer(context, 'a'.repeat(21))).toEqual({ status: 'rejected', reason: 'too_long' })
    expect(await renamePlayer(context, 'A\u0000')).toEqual({ status: 'rejected', reason: 'invalid_characters' })
    expect(await loadAwakeningState(context)).toMatchObject({ identity: { name: 'Ada' } })
  })

  it('NEVER changes progression: EXP, level, rank, quests, occurrences, completions and the ledger are identical', async () => {
    const { context, database } = await awakened()
    const first = (await startApplication(context)).home.today.quests[0]
    if (first === undefined) throw new Error('expected a quest')
    expect(await completeTodayQuest(context, first.occurrenceId)).toMatchObject({ status: 'completed' })
    const beforeData = await progressionData(database)
    const beforeStatus = await loadPlayerStatus(context)

    await renamePlayer(context, 'Bob')
    await renamePlayer(context, '')
    await renamePlayer(context, 'אדי')

    expect(await progressionData(database)).toEqual(beforeData)
    expect(await loadPlayerStatus(context)).toEqual(beforeStatus)
    expect(beforeStatus.totalExp).toBeGreaterThan(0)
  })

  it('does not replay Awakening and keeps awakenedAt', async () => {
    const { context, database } = await awakened()
    await renamePlayer(context, 'Bob')
    expect(await getPlayerProfile(database)).toEqual({ status: 'valid', profile: { id: 'player', name: 'Bob', awakenedAt: noonOn(TODAY) } })
    expect(await loadAwakeningState(context)).toMatchObject({ status: 'complete' })
  })

  it('works while the device clock is BEHIND the last recorded day (it is not a lifecycle change)', async () => {
    const { context, clock } = await awakened()
    clock.set(noonOn('2026-10-07'))
    await startApplication(context) // records and finalizes up to 2026-10-06
    clock.set(noonOn('2026-10-01')) // the clock is now behind the recorded history
    expect(await renamePlayer(context, 'Bob')).toEqual({ status: 'renamed', identity: { name: 'Bob' } })
  })

  it('repairs a damaged row (the name is written, the row is valid afterwards)', async () => {
    const { context, database, factory } = await awakened()
    await rawProfile(factory, { put: { id: 'player', name: 'bad\u0000', awakenedAt: 9 } })
    expect(await renamePlayer(context, 'Ada')).toEqual({ status: 'renamed', identity: { name: 'Ada' } })
    expect(await getPlayerProfile(database)).toEqual({ status: 'valid', profile: { id: 'player', name: 'Ada', awakenedAt: 9 } })
  })

  it('recreates a missing row for a player who has data (existing_data), as a legacy row', async () => {
    const { context, database, factory } = await awakened()
    await rawProfile(factory, { delete: true })
    expect(await renamePlayer(context, 'Ada')).toEqual({ status: 'renamed', identity: { name: 'Ada' } })
    expect(await getPlayerProfile(database)).toEqual({ status: 'valid', profile: { id: 'player', name: 'Ada', awakenedAt: null } })
  })

  it('can NEVER stand in for Awakening: on a database that has not awakened it writes nothing', async () => {
    const { context, database } = await setup()
    expect(await renamePlayer(context, 'Ada')).toEqual({ status: 'not_awakened' })
    expect(await getPlayerProfile(database)).toEqual({ status: 'absent' })
    expect(await loadAwakeningState(context)).toEqual({ status: 'required' })
  })

  it('reports a failure (and changes nothing) when storage is unavailable', async () => {
    const { context, database } = await awakened()
    database.close()
    expect(await renamePlayer(context, 'Bob')).toMatchObject({ status: 'failed', reason: 'database_unavailable' })
  })
})
