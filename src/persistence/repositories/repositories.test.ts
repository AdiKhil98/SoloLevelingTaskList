// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { completeQuestAtomically } from '../commands/completeQuest'
import { DatabaseTracker, buildOccurrence, buildTemplate, d, noonOn, readRaw, writeRaw, ZONE } from '../test-utils/helpers'
import { getCompletion, listCompletionsByDate, listCompletionsByTemplate } from './completions'
import {
  ensureOccurrence,
  getOccurrence,
  getOccurrenceFor,
  insertOccurrence,
  listOccurrencesByDate,
  listOccurrencesByTemplate,
} from './occurrences'
import { archiveTemplate, createTemplate, getTemplate, getTemplateBySeedKey, listTemplates, updateTemplate } from './templates'
import { getXpTransaction, getXpTransactionByIdempotencyKey, listXpTransactions, listXpTransactionsByEffectiveDate } from './xpLedger'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

describe('template repository', () => {
  it('puts, gets and lists templates ordered by id', async () => {
    const db = await tracker.open()
    await createTemplate(db, buildTemplate({ id: 'tpl_b', title: 'B' }))
    await createTemplate(db, buildTemplate({ id: 'tpl_a', title: 'A' }))
    expect((await getTemplate(db, 'tpl_a'))?.title).toBe('A')
    expect(await getTemplate(db, 'tpl_missing')).toBeNull()
    expect((await listTemplates(db)).map((t) => t.id)).toEqual(['tpl_a', 'tpl_b'])
  })

  it('filters the list by status', async () => {
    const db = await tracker.open()
    await createTemplate(db, buildTemplate({ id: 'tpl_a' }))
    await createTemplate(db, buildTemplate({ id: 'tpl_b' }))
    await archiveTemplate(db, 'tpl_b', { activeUntil: d('2026-10-03'), updatedAt: 5_000 })
    expect((await listTemplates(db, { status: 'active' })).map((t) => t.id)).toEqual(['tpl_a'])
    expect((await listTemplates(db, { status: 'archived' })).map((t) => t.id)).toEqual(['tpl_b'])
  })

  it('refuses a duplicate id and a duplicate seed key, but allows many templates without one', async () => {
    const db = await tracker.open()
    await createTemplate(db, buildTemplate({ id: 'tpl_a', seedKey: 'prayer.fajr' }))
    await expect(createTemplate(db, buildTemplate({ id: 'tpl_a' }))).rejects.toMatchObject({ code: 'constraint_violation' })
    await expect(createTemplate(db, buildTemplate({ id: 'tpl_b', seedKey: 'prayer.fajr' }))).rejects.toMatchObject({
      code: 'constraint_violation',
    })
    await createTemplate(db, buildTemplate({ id: 'tpl_c', seedKey: null }))
    await createTemplate(db, buildTemplate({ id: 'tpl_d', seedKey: null }))
    expect(await listTemplates(db)).toHaveLength(3)
    expect((await getTemplateBySeedKey(db, 'prayer.fajr'))?.id).toBe('tpl_a')
    expect(await getTemplateBySeedKey(db, 'nope')).toBeNull()
  })

  it('updates a stored template', async () => {
    const db = await tracker.open()
    await createTemplate(db, buildTemplate({ id: 'tpl_a', title: 'Old' }))
    await updateTemplate(db, buildTemplate({ id: 'tpl_a', title: 'New', revision: 2, updatedAt: 9_000 }))
    expect(await getTemplate(db, 'tpl_a')).toMatchObject({ title: 'New', revision: 2 })
  })

  it('refuses to update a missing template or to move the revision backwards', async () => {
    const db = await tracker.open()
    await expect(updateTemplate(db, buildTemplate({ id: 'tpl_ghost' }))).rejects.toMatchObject({ code: 'not_found' })
    await createTemplate(db, buildTemplate({ id: 'tpl_a', revision: 3 }))
    await expect(updateTemplate(db, buildTemplate({ id: 'tpl_a', revision: 2 }))).rejects.toMatchObject({
      code: 'record_validation_failed',
    })
    expect((await getTemplate(db, 'tpl_a'))?.revision).toBe(3)
  })

  it('never stores an invalid template', async () => {
    const db = await tracker.open()
    const invalid = { ...buildTemplate({ id: 'tpl_bad' }), recurrence: { kind: 'weekdays', weekdays: [] } }
    await expect(createTemplate(db, invalid as never)).rejects.toMatchObject({ code: 'record_validation_failed' })
    expect(await readRaw(db, 'questTemplates')).toEqual([])
  })

  it('refuses to hand back a corrupt stored template', async () => {
    const db = await tracker.open()
    await writeRaw(db, 'questTemplates', { id: 'tpl_corrupt', title: 'No other fields' })
    await expect(getTemplate(db, 'tpl_corrupt')).rejects.toMatchObject({ code: 'record_validation_failed' })
  })

  it('archives softly: status and activeUntil change, nothing else, and it is idempotent', async () => {
    const db = await tracker.open()
    await createTemplate(db, buildTemplate({ id: 'tpl_a', revision: 4 }))
    const once = await archiveTemplate(db, 'tpl_a', { activeUntil: d('2026-10-03'), updatedAt: 5_000 })
    const twice = await archiveTemplate(db, 'tpl_a', { activeUntil: d('2026-10-03'), updatedAt: 5_000 })
    expect(twice).toEqual(once)
    expect(once).toMatchObject({ status: 'archived', activeUntil: '2026-10-03', revision: 4, updatedAt: 5_000 })
    await expect(archiveTemplate(db, 'tpl_ghost', { activeUntil: d('2026-10-03'), updatedAt: 1 })).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('rejects archiving to a date before the template became active', async () => {
    const db = await tracker.open()
    await createTemplate(db, buildTemplate({ id: 'tpl_a', activeFrom: d('2026-06-01') }))
    await expect(archiveTemplate(db, 'tpl_a', { activeUntil: d('2026-05-01'), updatedAt: 1 })).rejects.toMatchObject({
      code: 'record_validation_failed',
    })
  })
})

describe('history is independent of the template', () => {
  it('keeps a persisted occurrence unchanged when its template is edited, and does not rebuild it', async () => {
    const db = await tracker.open()
    const template = buildTemplate({ id: 'tpl_gym', title: 'Gym', difficulty: 'B', category: 'fitness' })
    await createTemplate(db, template)
    const first = await ensureOccurrence(db, template, d('2026-10-03'), 2_000)
    if (!first.ok) throw new Error('fixture')

    const edited = buildTemplate({
      id: 'tpl_gym',
      title: 'Heavy Gym',
      difficulty: 'S',
      category: 'discipline',
      revision: 2,
    })
    await updateTemplate(db, edited)

    const stored = await getOccurrence(db, 'occ:tpl_gym@2026-10-03')
    expect(stored).toEqual(first.value.occurrence)
    expect(stored?.snapshot).toMatchObject({ title: 'Gym', difficulty: 'B', category: 'fitness', expReward: 55 })

    // Asking again with the EDITED template still returns the original snapshot.
    const again = await ensureOccurrence(db, edited, d('2026-10-03'), 9_999)
    expect(again).toMatchObject({ ok: true, value: { created: false } })
    if (again.ok) expect(again.value.occurrence).toEqual(first.value.occurrence)
  })

  it('keeps occurrences, completions and EXP when a template is archived', async () => {
    const db = await tracker.open()
    const template = buildTemplate({ id: 'tpl_gym', difficulty: 'B', category: 'fitness' })
    await createTemplate(db, template)
    await ensureOccurrence(db, template, d('2026-10-03'), 2_000)
    await completeQuestAtomically(db, { occurrenceId: 'occ:tpl_gym@2026-10-03', completedAt: noonOn('2026-10-03'), timeZone: ZONE })

    const before = {
      occurrences: await readRaw(db, 'questOccurrences'),
      completions: await readRaw(db, 'questCompletions'),
      ledger: await readRaw(db, 'xpTransactions'),
    }
    await archiveTemplate(db, 'tpl_gym', { activeUntil: d('2026-10-03'), updatedAt: 7_000 })

    expect({
      occurrences: await readRaw(db, 'questOccurrences'),
      completions: await readRaw(db, 'questCompletions'),
      ledger: await readRaw(db, 'xpTransactions'),
    }).toEqual(before)
    expect((await getCompletion(db, 'occ:tpl_gym@2026-10-03'))?.expAwarded).toBe(55)
  })
})

describe('occurrence repository', () => {
  it('persists and fetches an occurrence, by id and by template + date', async () => {
    const db = await tracker.open()
    const template = buildTemplate({ id: 'tpl_a' })
    const result = await ensureOccurrence(db, template, d('2026-10-03'), 2_000)
    expect(result).toMatchObject({ ok: true, value: { created: true } })
    expect(await getOccurrence(db, 'occ:tpl_a@2026-10-03')).toMatchObject({ templateId: 'tpl_a', dateKey: '2026-10-03' })
    expect(await getOccurrenceFor(db, 'tpl_a', d('2026-10-03'))).not.toBeNull()
    expect(await getOccurrenceFor(db, 'tpl_a', d('2026-10-04'))).toBeNull()
  })

  it('lists occurrences by date and by template', async () => {
    const db = await tracker.open()
    const a = buildTemplate({ id: 'tpl_a' })
    const b = buildTemplate({ id: 'tpl_b' })
    for (const [template, date] of [[a, '2026-10-02'], [a, '2026-10-03'], [b, '2026-10-03']] as const) {
      await ensureOccurrence(db, template, d(date), 2_000)
    }
    expect((await listOccurrencesByDate(db, d('2026-10-03'))).map((o) => o.id)).toEqual([
      'occ:tpl_a@2026-10-03',
      'occ:tpl_b@2026-10-03',
    ])
    expect((await listOccurrencesByTemplate(db, 'tpl_a')).map((o) => o.dateKey)).toEqual(['2026-10-02', '2026-10-03'])
    expect(await listOccurrencesByDate(db, d('2026-11-01'))).toEqual([])
  })

  it('reports a domain error instead of storing an ineligible occurrence', async () => {
    const db = await tracker.open()
    const weekdaysOnly = buildTemplate({ id: 'tpl_w', recurrence: { kind: 'weekdays', weekdays: [1] } })
    const result = await ensureOccurrence(db, weekdaysOnly, d('2026-10-03'), 2_000) // a Saturday
    expect(result).toMatchObject({ ok: false, error: { code: 'not_eligible' } })
    expect(await readRaw(db, 'questOccurrences')).toEqual([])
  })

  it('does not duplicate when ensured concurrently', async () => {
    const db = await tracker.open()
    const template = buildTemplate({ id: 'tpl_a' })
    const results = await Promise.all(
      Array.from({ length: 6 }, () => ensureOccurrence(db, template, d('2026-10-03'), 2_000)),
    )
    expect(results.filter((r) => r.ok && r.value.created)).toHaveLength(1)
    expect(await readRaw(db, 'questOccurrences')).toHaveLength(1)
  })

  it('accepts an identical re-insert and refuses a contradictory snapshot with the same id', async () => {
    const db = await tracker.open()
    const original = buildOccurrence({ id: 'tpl_a', difficulty: 'C' })
    expect(await insertOccurrence(db, original)).toMatchObject({ created: true })
    expect(await insertOccurrence(db, original)).toMatchObject({ created: false })

    const contradictory = { ...original, snapshot: { ...original.snapshot, expReward: 999 } }
    await expect(insertOccurrence(db, contradictory)).rejects.toMatchObject({ code: 'constraint_violation' })
    expect(await getOccurrence(db, original.id)).toEqual(original)
  })

  it('rejects a malformed occurrence at the write boundary', async () => {
    const db = await tracker.open()
    const original = buildOccurrence({ id: 'tpl_a' })
    await expect(insertOccurrence(db, { ...original, dateKey: '2026-02-30' } as never)).rejects.toMatchObject({
      code: 'record_validation_failed',
    })
    await expect(insertOccurrence(db, { ...original, id: 'occ:x@1' } as never)).rejects.toMatchObject({
      code: 'record_validation_failed',
    })
    expect(await readRaw(db, 'questOccurrences')).toEqual([])
  })

  it('refuses to return a malformed stored occurrence', async () => {
    const db = await tracker.open()
    await writeRaw(db, 'questOccurrences', { id: 'occ:tpl_a@2026-10-03', templateId: 'tpl_a', dateKey: 'garbage' })
    await expect(getOccurrence(db, 'occ:tpl_a@2026-10-03')).rejects.toMatchObject({ code: 'record_validation_failed' })
  })

  it('enforces one occurrence per (template, date) in the store itself', async () => {
    const db = await tracker.open()
    const original = buildOccurrence({ id: 'tpl_a' })
    await insertOccurrence(db, original)
    // Bypass the repository: a record with another id but the same template + date.
    await expect(writeRaw(db, 'questOccurrences', { ...original, id: 'occ:rogue' })).rejects.toMatchObject({
      code: 'constraint_violation',
    })
    expect(await readRaw(db, 'questOccurrences')).toHaveLength(1)
  })
})

describe('read-only completion and ledger repositories', () => {
  it('query what the completion command wrote', async () => {
    const db = await tracker.open()
    const gym = buildTemplate({ id: 'tpl_gym', difficulty: 'B', category: 'fitness' })
    await createTemplate(db, gym)
    await ensureOccurrence(db, gym, d('2026-10-03'), 2_000)
    await completeQuestAtomically(db, { occurrenceId: 'occ:tpl_gym@2026-10-03', completedAt: noonOn('2026-10-03'), timeZone: ZONE })

    expect(await getCompletion(db, 'occ:tpl_gym@2026-10-03')).toMatchObject({ expAwarded: 55, category: 'fitness' })
    expect(await getCompletion(db, 'occ:none@2026-10-03')).toBeNull()
    expect(await listCompletionsByDate(db, d('2026-10-03'))).toHaveLength(1)
    expect(await listCompletionsByTemplate(db, 'tpl_gym')).toHaveLength(1)

    const id = 'xp:quest_completion:occ:tpl_gym@2026-10-03'
    expect(await getXpTransaction(db, id)).toMatchObject({ seq: 1, amount: 55, totalExpAfter: 55 })
    expect(await getXpTransactionByIdempotencyKey(db, 'quest_completion:occ:tpl_gym@2026-10-03')).toMatchObject({ id })
    expect(await listXpTransactions(db)).toHaveLength(1)
    expect(await listXpTransactionsByEffectiveDate(db, d('2026-10-03'))).toHaveLength(1)
    expect(await listXpTransactionsByEffectiveDate(db, d('2026-10-04'))).toEqual([])
  })
})
