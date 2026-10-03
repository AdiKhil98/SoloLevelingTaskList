// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { verifyDatabaseIntegrity } from '../integrity/verify'
import { readProgression } from '../ledger/ledgerTip'
import { getWeeklyBoard, getWeeklyRewardClaim, listWeeklyRewardClaims } from '../repositories/weeklyBoards'
import { listXpTransactions } from '../repositories/xpLedger'
import { DatabaseTracker, d, newFactory, readRaw, snapshotAll } from '../test-utils/helpers'
import { definition, finalizeWeek, prepareClosedWeek, saveBoard, scoring, TIERS, WEEK } from '../test-utils/weekly'
import { claimWeeklyRewardAtomically } from './claimWeeklyReward'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

const CLAIMED_AT = Date.UTC(2026, 9, 15, 18, 0, 0)

async function week(score: number, rewardTiers = TIERS) {
  const database = await tracker.open()
  await prepareClosedWeek(database)
  await saveBoard(database, { ...scoring(score), rewardTiers }, { today: d('2026-10-06') })
  return database
}

const claim = (database: Awaited<ReturnType<typeof tracker.open>>, claimedAt = CLAIMED_AT) =>
  claimWeeklyRewardAtomically(database, { weekKey: WEEK, claimedAt })

describe('claimWeeklyRewardAtomically', () => {
  it('claims the reward of a finalized week, snapshotting the tier and its text', async () => {
    const database = await week(8)
    await finalizeWeek(database)
    const result = await claim(database)
    expect(result).toEqual({
      status: 'claimed',
      claim: { weekKey: WEEK, tierMinScore: 8, rewardTextSnapshot: 'Movie night', claimedAt: CLAIMED_AT },
    })
    expect(await getWeeklyRewardClaim(database, WEEK)).toEqual((result as { claim: unknown }).claim)
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: true })
  })

  it('applies only the highest achieved tier', async () => {
    for (const [score, tier, text] of [[6, 6, 'Gaming'], [7, 7, 'Dessert'], [9, 9, 'Budgeted purchase'], [10, 10, 'Evening off']] as const) {
      const database = await week(score)
      await finalizeWeek(database)
      expect(await claim(database)).toMatchObject({ status: 'claimed', claim: { tierMinScore: tier, rewardTextSnapshot: text } })
    }
  })

  it('cannot be claimed before the week is finalized', async () => {
    const database = await week(9)
    const snapshot = await snapshotAll(database)
    expect(await claim(database)).toEqual({ status: 'rejected', reason: { code: 'not_finalized' } })
    expect(await snapshotAll(database)).toEqual(snapshot)
  })

  it('rejects a week without a board', async () => {
    const database = await tracker.open()
    expect(await claim(database)).toEqual({ status: 'rejected', reason: { code: 'board_not_found' } })
  })

  it('rejects a week that earned no reward (below 6)', async () => {
    const database = await week(5)
    await finalizeWeek(database)
    expect(await claim(database)).toEqual({ status: 'rejected', reason: { code: 'no_reward' } })
    expect(await readRaw(database, 'weeklyRewardClaims')).toEqual([])
  })

  it('rejects a tier that has no reward text: there is nothing to claim', async () => {
    const database = await week(7, TIERS.map((tier) => (tier.minScore === 7 ? { ...tier, text: '   ' } : tier)))
    await finalizeWeek(database)
    expect(await claim(database)).toEqual({ status: 'rejected', reason: { code: 'reward_text_blank' } })
  })

  it('cannot be claimed twice: the second attempt returns the first claim unchanged', async () => {
    const database = await week(9)
    await finalizeWeek(database)
    const first = await claim(database)
    const again = await claim(database, CLAIMED_AT + 3_600_000)
    expect(again).toEqual({ status: 'already_claimed', claim: (first as { claim: unknown }).claim })
    expect(await listWeeklyRewardClaims(database)).toHaveLength(1)
    expect((await getWeeklyRewardClaim(database, WEEK))?.claimedAt).toBe(CLAIMED_AT)
  })

  it('a burst of claims from two tabs records exactly one claim', async () => {
    const factory = newFactory()
    const tabA = await tracker.open(factory)
    await prepareClosedWeek(tabA)
    await saveBoard(tabA, scoring(10), { today: d('2026-10-06') })
    await finalizeWeek(tabA)
    const tabB = await tracker.open(factory)

    const results = await Promise.all([claim(tabA), claim(tabB), claim(tabA), claim(tabB), claim(tabA)])
    expect(results.filter((result) => result.status === 'claimed')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'already_claimed')).toHaveLength(4)
    expect(await listWeeklyRewardClaims(tabA)).toHaveLength(1)
  })

  it('awards no EXP and changes neither the board nor the ledger', async () => {
    const database = await week(9)
    await finalizeWeek(database)
    const boardBefore = await getWeeklyBoard(database, WEEK)
    const ledgerBefore = await listXpTransactions(database)
    const expBefore = (await readProgression(database)).totalExp

    await claim(database)
    await claim(database)

    expect(await getWeeklyBoard(database, WEEK)).toEqual(boardBefore)
    expect(await listXpTransactions(database)).toEqual(ledgerBefore)
    expect((await readProgression(database)).totalExp).toBe(expBefore)
  })

  it('has nothing to claim for a board whose definition was never finalized', async () => {
    const database = await tracker.open()
    await saveBoard(database, definition())
    expect(await claim(database)).toEqual({ status: 'rejected', reason: { code: 'not_finalized' } })
  })
})
