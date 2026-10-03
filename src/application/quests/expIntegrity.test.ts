// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { getTemplate, listXpTransactions, type PersistenceDatabase } from '@/persistence'
import { completeTodayQuest } from '../completion/completeTodayQuest'
import { initializeApplication } from '../initialize'
import { buildFormValues, createTestContext, d, noonOn, type TestContext } from '../test-utils/helpers'
import { readHistory } from '../test-utils/history'
import { archiveQuest } from './archiveQuest'
import { createQuest } from './createQuest'
import { formValuesFromTemplate, type QuestFormValues } from './questForm'
import { restoreQuest } from './restoreQuest'
import { updateQuest } from './updateQuest'

const MONDAY = '2026-10-05'

const opened: PersistenceDatabase[] = []
async function setup(): Promise<TestContext> {
  const testContext = await createTestContext(MONDAY)
  opened.push(testContext.database)
  return testContext
}

afterEach(() => {
  while (opened.length > 0) opened.pop()?.close()
})

async function create(t: TestContext, overrides: Partial<QuestFormValues> = {}) {
  const result = await createQuest(t.context, buildFormValues(overrides, MONDAY))
  if (result.status !== 'created') throw new Error('create failed')
  return result.templateId
}

async function edit(t: TestContext, id: string, overrides: Partial<QuestFormValues>) {
  const template = await getTemplate(t.database, id)
  return updateQuest(t.context, id, { ...formValuesFromTemplate(template!, d(MONDAY)), ...overrides })
}

describe('quest management never touches EXP', () => {
  it('create, edit, archive and restore each award 0 EXP and add no ledger row', async () => {
    const t = await setup()
    await initializeApplication(t.context)
    const empty = await readHistory(t.database, MONDAY)
    expect(empty.ledger).toEqual([])
    expect(empty.progression.totalExp).toBe(0)

    const id = await create(t, { difficulty: 'S' })
    expect((await readHistory(t.database, MONDAY)).ledger).toEqual([])

    await edit(t, id, { difficulty: 'A', title: 'Edited' })
    expect((await readHistory(t.database, MONDAY)).ledger).toEqual([])

    await archiveQuest(t.context, id)
    expect((await readHistory(t.database, MONDAY)).ledger).toEqual([])

    await restoreQuest(t.context, id)
    const finalState = await readHistory(t.database, MONDAY)
    expect(finalState.ledger).toEqual([])
    expect(finalState.completions).toEqual([])
    expect(finalState.progression.totalExp).toBe(0)
  })

  it('editing difficulty does not change an existing XP transaction or the total', async () => {
    const t = await setup()
    const id = await create(t, { title: 'Paid at B', difficulty: 'B' })
    await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)
    const before = await readHistory(t.database, MONDAY)
    expect(before.ledger).toHaveLength(1)
    expect(before.ledger[0]).toMatchObject({ amount: 55, totalExpAfter: 55 })

    await edit(t, id, { difficulty: 'S' })

    const after = await readHistory(t.database, MONDAY)
    expect(after.ledger).toEqual(before.ledger)
    expect(after.completions).toEqual(before.completions)
    expect(after.progression.totalExp).toBe(55)
  })

  it('archiving a completed quest does not remove XP, the completion or the occurrence', async () => {
    const t = await setup()
    const id = await create(t, { difficulty: 'A' })
    await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)
    const before = await readHistory(t.database, MONDAY)

    await archiveQuest(t.context, id)

    expect(await readHistory(t.database, MONDAY)).toEqual(before)
    expect(before.progression.totalExp).toBe(80)
  })

  it('editing a completed quest cannot cause another completion award', async () => {
    const t = await setup()
    const id = await create(t, { difficulty: 'C' })
    await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)

    await edit(t, id, { difficulty: 'S', title: 'Different now' })
    const again = await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)

    expect(again.status).toBe('already_completed')
    const ledger = await listXpTransactions(t.database)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ amount: 35 })
    expect((await readHistory(t.database, MONDAY)).progression.totalExp).toBe(35)
  })

  it('an archived, uncompleted quest still awards its SNAPSHOT EXP exactly once, via completion only', async () => {
    const t = await setup()
    const id = await create(t, { difficulty: 'D' })
    await archiveQuest(t.context, id)
    expect((await edit(t, id, { difficulty: 'S' })).status).toBe('archived') // archived quests cannot be edited

    await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)
    await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)

    const ledger = await listXpTransactions(t.database)
    expect(ledger.map((row) => row.amount)).toEqual([20])
  })

  it('exposes no way to assign EXP: the application API has no EXP-bearing input', async () => {
    const values = buildFormValues({ difficulty: 'B' }, MONDAY)
    expect(Object.keys(values).filter((key) => /exp|reward|points|xp/i.test(key))).toEqual([])
  })

  it('a later day’s quest uses the edited difficulty for ITS reward, leaving earlier XP alone', async () => {
    const t = await setup()
    const id = await create(t, { difficulty: 'B' })
    await completeTodayQuest(t.context, `occ:${id}@${MONDAY}`)
    await edit(t, id, { difficulty: 'A' })

    t.clock.set(noonOn('2026-10-06'))
    await initializeApplication(t.context)
    const next = await completeTodayQuest(t.context, `occ:${id}@2026-10-06`)

    expect(next.status).toBe('completed')
    const ledger = await listXpTransactions(t.database)
    expect(ledger.map((row) => row.amount)).toEqual([55, 80])
  })
})
