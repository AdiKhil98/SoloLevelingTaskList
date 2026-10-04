// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it } from 'vitest'
import * as persistence from './index'

const open: persistence.PersistenceDatabase[] = []
afterEach(() => {
  for (const database of open.splice(0)) database.close()
})

describe('public persistence API', () => {
  it('exposes a deliberate, stable set of functions', () => {
    const functions = Object.entries(persistence)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .sort()
    expect(functions).toEqual([
      'PersistenceDatabase',
      'PersistenceError',
      'appendTemplate',
      'archiveTemplate',
      'claimWeeklyRewardAtomically',
      'completeAwakeningAtomically',
      'completeQuestAtomically',
      'countCompletionsByTemplate',
      'countTemplates',
      'createTemplate',
      'ensureOccurrence',
      'exportBackup',
      'finalizeDayAtomically',
      'finalizeWeekAtomically',
      'getCompletion',
      'getDailySummary',
      'getLatestDailySummary',
      'getOccurrence',
      'getOccurrenceFor',
      'getPlayerProfile',
      'getTemplate',
      'getTemplateBySeedKey',
      'getWeeklyBoard',
      'getWeeklyRewardClaim',
      'getXpTransaction',
      'getXpTransactionByIdempotencyKey',
      'importBackup',
      'insertOccurrence',
      'listCompletionsByDate',
      'listCompletionsByTemplate',
      'listDailySummaries',
      'listDueWeeklyBoardKeys',
      'listOccurrencesByDate',
      'listOccurrencesByTemplate',
      'listTemplates',
      'listWeeklyBoards',
      'listWeeklyRewardClaims',
      'listXpTransactions',
      'listXpTransactionsByEffectiveDate',
      'openDatabase',
      'parseBackup',
      'parseCompletion',
      'parseDailySummary',
      'parseOccurrence',
      'parsePlayerProfile',
      'parseTemplate',
      'parseWeeklyBoard',
      'parseWeeklyRewardClaim',
      'parseXpTransaction',
      'readDailyChainTip',
      'readFinalizationCursor',
      'readProgression',
      'reconstructProgression',
      'renamePlayerAtomically',
      'reorderTemplates',
      'saveWeeklyBoardAtomically',
      'serializeBackup',
      'setWeeklyGoalProgressAtomically',
      'updateTemplate',
      'validateLedger',
      'verifyDatabaseIntegrity',
    ])
  })

  it('offers no update or delete path for the insert-only stores or a casual reset', () => {
    const names = Object.keys(persistence)
    const writesToInsertOnlyStores = names.filter(
      (name) =>
        /^(update|delete|remove|put|clear|reset|uncomplete|undo)/i.test(name) &&
        /(occurrence|completion|xp|ledger|transaction)/i.test(name),
    )
    expect(writesToInsertOnlyStores).toEqual([])
    expect(names.filter((name) => /^(deleteDatabase|resetAll|clearAll|wipe)/i.test(name))).toEqual([])
    // Weekly boards have no generic write path either: only the commands that each refuse a finalized board.
    expect(names.filter((name) => /^(update|delete|remove|put|clear|reset)/i.test(name) && /weekly/i.test(name))).toEqual([])
    // Templates are only ever soft-archived.
    expect(names.filter((name) => /^(delete|remove)Template/i.test(name))).toEqual([])
  })

  it('works end to end using only the public surface', async () => {
    const database = await persistence.openDatabase({ factory: new IDBFactory() })
    open.push(database)

    const template = {
      id: 'tpl_fajr',
      title: 'Fajr',
      difficulty: 'E',
      category: 'discipline',
      recurrence: { kind: 'daily' },
      role: 'standard',
      seedKey: 'prayer.fajr',
      activeFrom: '2026-10-01',
      activeUntil: null,
      status: 'active',
      sortOrder: 0,
      revision: 1,
      createdAt: 0,
      updatedAt: 0,
    }
    const parsed = persistence.parseTemplate(template)
    if (!parsed.ok) throw new Error('fixture')
    await persistence.createTemplate(database, parsed.value)

    const occurrence = await persistence.ensureOccurrence(database, parsed.value, parsed.value.activeFrom, 0)
    if (!occurrence.ok) throw new Error('fixture')

    const done = await persistence.completeQuestAtomically(database, {
      occurrenceId: occurrence.value.occurrence.id,
      completedAt: Date.UTC(2026, 9, 1, 4, 0, 0),
      timeZone: 'Asia/Riyadh',
    })
    expect(done.status).toBe('completed')
    expect(await persistence.readProgression(database)).toMatchObject({ totalExp: 10, lastSeq: 1 })

    const backup = await persistence.exportBackup(database, {
      exportedAt: 1,
      exportedFromTimeZone: 'Asia/Riyadh',
      appVersion: '0.1.0',
    })
    const other = await persistence.openDatabase({ factory: new IDBFactory() })
    open.push(other)
    const restored = await persistence.importBackup(other, persistence.serializeBackup(backup))
    expect(restored).toMatchObject({ ok: true, value: { progression: { totalExp: 10 } } })
  })
})
