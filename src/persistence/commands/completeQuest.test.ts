// @vitest-environment node
import { IDBObjectStore } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { levelStateOf, type DomainEvent } from '@/domain'
import { PersistenceError } from '../errors'
import { verifyDatabaseIntegrity } from '../integrity/verify'
import { readProgression, reconstructProgression } from '../ledger/ledgerTip'
import { ensureOccurrence } from '../repositories/occurrences'
import { createTemplate } from '../repositories/templates'
import type { PersistenceDatabase } from '../database/connection'
import {
  DatabaseTracker,
  buildTemplate,
  d,
  deleteRaw,
  newFactory,
  noonOn,
  readRaw,
  snapshotAll,
  writeRaw,
  ZONE,
} from '../test-utils/helpers'
import { completeQuestAtomically, resolveConstraintConflict } from './completeQuest'

const tracker = new DatabaseTracker()
afterEach(() => {
  vi.restoreAllMocks()
  tracker.closeAll()
})

/** Creates a daily template and its occurrence on `date`; returns the occurrence id. */
async function seedOccurrence(
  database: PersistenceDatabase,
  id: string,
  difficulty: 'E' | 'D' | 'C' | 'B' | 'A' | 'S',
  date = '2026-10-03',
): Promise<string> {
  const template = buildTemplate({ id, difficulty })
  try {
    await createTemplate(database, template)
  } catch {
    // The template may already exist when seeding a second date.
  }
  const result = await ensureOccurrence(database, template, d(date), 2_000)
  if (!result.ok) throw new Error('fixture')
  return result.value.occurrence.id
}

const complete = (database: PersistenceDatabase, occurrenceId: string, date = '2026-10-03') =>
  completeQuestAtomically(database, { occurrenceId, completedAt: noonOn(date), timeZone: ZONE })

const types = (events: readonly DomainEvent[]) => events.map((event) => event.type)

describe('first completion', () => {
  it('stores exactly one completion and one XP transaction, with the allocated sequence', async () => {
    const db = await tracker.open()
    const occurrenceId = await seedOccurrence(db, 'tpl_gym', 'B')

    const result = await complete(db, occurrenceId)
    expect(result.status).toBe('completed')

    const completions = await readRaw(db, 'questCompletions')
    const ledger = await readRaw(db, 'xpTransactions')
    expect(completions).toEqual([
      {
        occurrenceId: 'occ:tpl_gym@2026-10-03',
        templateId: 'tpl_gym',
        dateKey: '2026-10-03',
        category: 'discipline',
        expAwarded: 55,
        completedAt: noonOn('2026-10-03'),
        utcOffsetMinutes: 120,
        timeZone: 'Europe/Berlin',
        xpTransactionId: 'xp:quest_completion:occ:tpl_gym@2026-10-03',
      },
    ])
    expect(ledger).toEqual([
      {
        id: 'xp:quest_completion:occ:tpl_gym@2026-10-03',
        seq: 1,
        idempotencyKey: 'quest_completion:occ:tpl_gym@2026-10-03',
        source: { type: 'quest_completion', occurrenceId: 'occ:tpl_gym@2026-10-03', templateId: 'tpl_gym' },
        amount: 55,
        category: 'discipline',
        createdAt: noonOn('2026-10-03'),
        effectiveDate: '2026-10-03',
        sourceWeekKey: null,
        totalExpAfter: 55,
      },
    ])
  })

  it('returns the domain events and progression of the award', async () => {
    const db = await tracker.open()
    const first = await seedOccurrence(db, 'tpl_a', 'B')
    const second = await seedOccurrence(db, 'tpl_b', 'B')

    const one = await complete(db, first)
    if (one.status !== 'completed') throw new Error('expected completed')
    expect(types(one.events)).toEqual(['QuestCompleted', 'XPAwarded'])
    expect(one.progression).toMatchObject({ totalExpBefore: 0, totalExpAfter: 55 })

    // 55 + 55 = 110 crosses the 100 EXP boundary of Level 2.
    const two = await complete(db, second)
    if (two.status !== 'completed') throw new Error('expected completed')
    expect(types(two.events)).toEqual(['QuestCompleted', 'XPAwarded', 'LevelUp'])
    expect(two.progression).toMatchObject({ totalExpBefore: 55, totalExpAfter: 110, levelsCrossed: [2] })
  })
})

describe('ledger sequence and reconstruction', () => {
  it('starts at 0 EXP, Level 1, E-Rank on an empty ledger', async () => {
    const db = await tracker.open()
    expect(await readProgression(db)).toMatchObject({
      totalExp: 0,
      lastSeq: 0,
      levelState: { level: 1, rank: 'E', expIntoLevel: 0, expToNext: 100 },
    })
    expect(await reconstructProgression(db)).toMatchObject({ totalExp: 0, lastSeq: 0 })
  })

  it('allocates strictly increasing sequence numbers with a correct running total', async () => {
    const db = await tracker.open()
    const amounts = { E: 10, D: 20, C: 35, B: 55, A: 80, S: 120 } as const
    const order = ['E', 'S', 'C', 'B', 'D', 'A'] as const
    let expected = 0
    for (const [index, difficulty] of order.entries()) {
      const id = await seedOccurrence(db, `tpl_${index}`, difficulty)
      await complete(db, id)
      expected += amounts[difficulty]
    }

    const ledger = (await readRaw(db, 'xpTransactions')) as Array<{ seq: number; amount: number; totalExpAfter: number }>
    expect(ledger.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6])
    let running = 0
    for (const row of ledger) {
      running += row.amount
      expect(row.totalExpAfter).toBe(running)
    }
    expect(running).toBe(expected)
  })

  it('derives total EXP, level and rank from the ledger through the Phase 02 engine', async () => {
    const db = await tracker.open()
    for (let i = 0; i < 25; i += 1) {
      await complete(db, await seedOccurrence(db, `tpl_${i}`, 'S'))
    }
    const total = 25 * 120
    const fast = await readProgression(db)
    const full = await reconstructProgression(db)
    expect(fast).toEqual(full)
    expect(full.totalExp).toBe(total)
    expect(full.lastSeq).toBe(25)
    expect(full.levelState).toEqual(levelStateOf(total))
    expect(full.levelState.level).toBeGreaterThanOrEqual(10)
    expect(full.levelState.rank).toBe('D')
  })
})

describe('duplicate completion', () => {
  it('returns the harmless duplicate result and changes nothing', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    await complete(db, id)
    const before = await snapshotAll(db)

    const again = await complete(db, id)
    expect(again.status).toBe('already_completed')
    expect(again).toMatchObject({ completion: { occurrenceId: id, expAwarded: 55 } })
    expect('events' in again).toBe(false)

    expect(await snapshotAll(db)).toEqual(before)
    expect(await readRaw(db, 'questCompletions')).toHaveLength(1)
    expect(await readRaw(db, 'xpTransactions')).toHaveLength(1)
    expect((await readProgression(db)).totalExp).toBe(55)
  })

  it('stays a duplicate even after the day has ended', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    await complete(db, id)
    const nextDay = await complete(db, id, '2026-10-04')
    expect(nextDay.status).toBe('already_completed')
  })
})

describe('concurrent duplicate completion', () => {
  it('awards once when the same occurrence is completed many times at once', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')

    const results = await Promise.all(Array.from({ length: 8 }, () => complete(db, id)))
    expect(results.filter((r) => r.status === 'completed')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'already_completed')).toHaveLength(7)

    expect(await readRaw(db, 'questCompletions')).toHaveLength(1)
    expect(await readRaw(db, 'xpTransactions')).toHaveLength(1)
    expect((await readProgression(db)).totalExp).toBe(55)
  })

  it('awards once across two connections (two tabs) racing on the same occurrence', async () => {
    const factory = newFactory()
    const tabA = await tracker.open(factory)
    const tabB = await tracker.open(factory)
    const id = await seedOccurrence(tabA, 'tpl_gym', 'B')

    const results = await Promise.all([
      complete(tabA, id),
      complete(tabB, id),
      complete(tabA, id),
      complete(tabB, id),
    ])
    expect(results.filter((r) => r.status === 'completed')).toHaveLength(1)
    expect(await readRaw(tabA, 'questCompletions')).toHaveLength(1)
    expect(await readRaw(tabB, 'xpTransactions')).toHaveLength(1)
  })

  it('never allocates the same sequence twice when different occurrences race', async () => {
    const factory = newFactory()
    const tabA = await tracker.open(factory)
    const tabB = await tracker.open(factory)
    const ids: string[] = []
    for (let i = 0; i < 10; i += 1) ids.push(await seedOccurrence(tabA, `tpl_${i}`, 'E'))

    await Promise.all(ids.map((id, index) => complete(index % 2 === 0 ? tabA : tabB, id)))

    const ledger = (await readRaw(tabA, 'xpTransactions')) as Array<{ seq: number }>
    expect(ledger.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(await verifyDatabaseIntegrity(tabA)).toMatchObject({ ok: true, report: { progression: { totalExp: 100 } } })
  })
})

describe('rejections write nothing', () => {
  it('reports an unknown occurrence', async () => {
    const db = await tracker.open()
    expect(await complete(db, 'occ:ghost@2026-10-03')).toEqual({
      status: 'rejected',
      reason: { code: 'occurrence_not_found', occurrenceId: 'occ:ghost@2026-10-03' },
    })
    expect(await readRaw(db, 'xpTransactions')).toEqual([])
  })

  it('rejects completing a past day and the future, leaving the stores untouched', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    const late = await complete(db, id, '2026-10-04')
    const early = await complete(db, id, '2026-10-02')
    expect(late).toMatchObject({ status: 'rejected', reason: { code: 'occurrence_day_ended' } })
    expect(early).toMatchObject({ status: 'rejected', reason: { code: 'occurrence_not_yet_active' } })
    expect(await readRaw(db, 'questCompletions')).toEqual([])
    expect(await readRaw(db, 'xpTransactions')).toEqual([])
  })

  it('rejects an invalid time zone', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    const result = await completeQuestAtomically(db, { occurrenceId: id, completedAt: noonOn('2026-10-03'), timeZone: 'Nowhere/Land' })
    expect(result).toMatchObject({ status: 'rejected', reason: { code: 'invalid_clock' } })
    expect(await readRaw(db, 'questCompletions')).toEqual([])
  })
})

describe('transaction failure leaves no partial state', () => {
  it('rolls back the completion when the XP row cannot be written (simulated quota failure)', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    const before = await snapshotAll(db)

    // The first `add` (the completion) succeeds; the second (the XP row) fails.
    const realAdd = IDBObjectStore.prototype.add
    let calls = 0
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      calls += 1
      if (calls === 2) throw new DOMException('Simulated quota failure', 'QuotaExceededError')
      return realAdd.apply(this, args)
    })

    await expect(complete(db, id)).rejects.toMatchObject({ code: 'storage_quota_exceeded' })
    expect(calls).toBe(2)
    vi.restoreAllMocks()

    expect(await snapshotAll(db)).toEqual(before)
    expect(await readRaw(db, 'questCompletions')).toEqual([])
    expect(await readRaw(db, 'xpTransactions')).toEqual([])

    // The system is still healthy: the same completion now succeeds exactly once.
    expect((await complete(db, id)).status).toBe('completed')
    expect(await readRaw(db, 'xpTransactions')).toHaveLength(1)
  })

  it('rolls back the completion when the ledger rejects the XP row (orphan XP row planted)', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    // An XP row for this occurrence exists, but its completion does not.
    const orphan = {
      id: 'xp:quest_completion:occ:tpl_gym@2026-10-03',
      seq: 1,
      idempotencyKey: 'quest_completion:occ:tpl_gym@2026-10-03',
      source: { type: 'quest_completion', occurrenceId: id, templateId: 'tpl_gym' },
      amount: 55,
      category: 'discipline',
      createdAt: noonOn('2026-10-03'),
      effectiveDate: '2026-10-03',
      sourceWeekKey: null,
      totalExpAfter: 55,
    }
    await writeRaw(db, 'xpTransactions', orphan)

    const attempt = complete(db, id)
    await expect(attempt).rejects.toBeInstanceOf(PersistenceError)
    await expect(attempt).rejects.toMatchObject({ code: 'ledger_integrity_failed' })

    // The completion that was added before the failing XP write was rolled back.
    expect(await readRaw(db, 'questCompletions')).toEqual([])
    expect(await readRaw(db, 'xpTransactions')).toEqual([orphan])
  })

  it('refuses to extend a ledger whose tip does not match its row count', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    await writeRaw(db, 'xpTransactions', {
      id: 'xp:quest_completion:occ:other@2026-10-03',
      seq: 5, // one row, but sequence 5: rows are missing
      idempotencyKey: 'quest_completion:occ:other@2026-10-03',
      source: { type: 'quest_completion', occurrenceId: 'occ:other@2026-10-03', templateId: 'other' },
      amount: 10,
      category: 'discipline',
      createdAt: 1,
      effectiveDate: '2026-10-03',
      sourceWeekKey: null,
      totalExpAfter: 10,
    })
    await expect(complete(db, id)).rejects.toMatchObject({ code: 'ledger_integrity_failed' })
    expect(await readRaw(db, 'questCompletions')).toEqual([])
  })

  it('reports corruption instead of "already completed" when a completion has lost its XP row', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    await complete(db, id)
    await deleteRaw(db, 'xpTransactions', 'xp:quest_completion:occ:tpl_gym@2026-10-03')

    await expect(complete(db, id)).rejects.toMatchObject({ code: 'ledger_integrity_failed' })
  })
})

describe('constraint conflicts are only a duplicate when the stored state proves it', () => {
  const conflict = new PersistenceError('constraint_violation', 'simulated conflict')

  it('maps to already_completed when the completion AND its XP row are stored', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    await complete(db, id)
    const result = await resolveConstraintConflict(db, id, conflict)
    expect(result).toMatchObject({ status: 'already_completed', completion: { occurrenceId: id } })
  })

  it('surfaces an integrity error when no completion is stored', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    const attempt = resolveConstraintConflict(db, id, conflict)
    await expect(attempt).rejects.toMatchObject({ code: 'ledger_integrity_failed', cause: conflict })
  })

  it('surfaces an integrity error when a completion is stored without its XP row', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    await complete(db, id)
    await deleteRaw(db, 'xpTransactions', 'xp:quest_completion:occ:tpl_gym@2026-10-03')
    await expect(resolveConstraintConflict(db, id, conflict)).rejects.toMatchObject({ code: 'ledger_integrity_failed' })
  })

  it('surfaces an integrity error when the stored XP row disagrees with the completion', async () => {
    const db = await tracker.open()
    const id = await seedOccurrence(db, 'tpl_gym', 'B')
    await complete(db, id)
    const [row] = (await readRaw(db, 'xpTransactions')) as Array<Record<string, unknown>>
    await writeRaw(db, 'xpTransactions', { ...row, amount: 999, totalExpAfter: 999 })
    await expect(resolveConstraintConflict(db, id, conflict)).rejects.toMatchObject({ code: 'ledger_integrity_failed' })
  })
})
