// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalStringify } from '../canonical'
import { computeBackupChecksum } from '../backup/envelope'
import { exportBackup, serializeBackup } from '../backup/export'
import { importBackup, parseBackup } from '../backup/import'
import { claimWeeklyRewardAtomically } from '../commands/claimWeeklyReward'
import { saveWeeklyBoardAtomically } from '../commands/saveWeeklyBoard'
import { listWeeklyBoards, listWeeklyRewardClaims } from '../repositories/weeklyBoards'
import { DatabaseTracker, d, noonOn, readRaw, snapshotAll, writeRaw, ZONE } from '../test-utils/helpers'
import { definition, finalizeWeek, prepareClosedWeek, saveBoard, scoring } from '../test-utils/weekly'
import { validateDataset } from './dataset'
import { readRawDataset, verifyDatabaseIntegrity } from './verify'

const tracker = new DatabaseTracker()
afterEach(() => tracker.closeAll())

const META = { exportedAt: 1_900_000_000_000, exportedFromTimeZone: ZONE, appVersion: '0.1.0' }

/** A week finalized with a 9/10 bonus and claimed, plus an active board for the following week. */
async function populated() {
  const database = await tracker.open()
  await prepareClosedWeek(database)
  await saveBoard(database, scoring(9), { today: d('2026-10-06') })
  await finalizeWeek(database)
  await claimWeeklyRewardAtomically(database, { weekKey: d('2026-10-05'), claimedAt: noonOn('2026-10-15') })
  await saveWeeklyBoardAtomically(database, {
    weekKey: d('2026-10-12'),
    definition: definition(),
    expectedRevision: null,
    today: d('2026-10-14'),
    now: noonOn('2026-10-14'),
  })
  return database
}

type Collection = 'questTemplates' | 'questOccurrences' | 'questCompletions' | 'xpTransactions' | 'dailySummaries' | 'weeklyBoards' | 'weeklyRewardClaims'
type Raw = Record<Collection, unknown[]>
const rawOf = async (database: Awaited<ReturnType<typeof populated>>): Promise<Raw> => (await readRawDataset(database)) as Raw
const clone = (raw: Raw): Raw => JSON.parse(JSON.stringify(raw)) as Raw
const codes = (raw: Raw) => {
  const result = validateDataset(raw)
  return result.ok ? [] : result.error.map((issue) => issue.code)
}

describe('weekly records in a backup', () => {
  it('round-trips boards, claims and the bonus row exactly', async () => {
    const source = await populated()
    const text = serializeBackup(await exportBackup(source, META))
    const target = await tracker.open()

    const result = await importBackup(target, text)
    expect(result).toMatchObject({ ok: true, value: { counts: { weeklyBoards: 2, weeklyRewardClaims: 1, xpTransactions: 2 } } })
    expect(await snapshotAll(target)).toEqual(await snapshotAll(source))
    expect(await listWeeklyBoards(target)).toEqual(await listWeeklyBoards(source))
    expect(await listWeeklyRewardClaims(target)).toEqual(await listWeeklyRewardClaims(source))
    expect(await verifyDatabaseIntegrity(target)).toMatchObject({ ok: true })
    // Equivalent state exports identically.
    expect(serializeBackup(await exportBackup(target, META))).toBe(text)
  })

  it('an import REPLACES the weekly data too: stale boards and claims of the target are gone', async () => {
    const source = await populated()
    const text = serializeBackup(await exportBackup(source, META))
    const target = await populated()
    await saveWeeklyBoardAtomically(target, { weekKey: d('2026-10-19'), definition: definition(), expectedRevision: null, today: d('2026-10-20'), now: noonOn('2026-10-20') })
    expect(await listWeeklyBoards(target)).toHaveLength(3)

    await importBackup(target, text)
    expect(await listWeeklyBoards(target)).toHaveLength(2)
  })

  it('rejects a corrupted weekly section and leaves existing data intact', async () => {
    const source = await populated()
    const envelope = JSON.parse(serializeBackup(await exportBackup(source, META))) as {
      data: { weeklyBoards: { finalization: { score: number } }[] }
      checksum: { algorithm: string; value: string }
    }
    const [board] = envelope.data.weeklyBoards
    if (board === undefined) throw new Error('fixture')
    board.finalization.score = 3 // no longer matches its goal results
    envelope.checksum = { algorithm: 'SHA-256', value: await computeBackupChecksum(envelope) }

    const target = await populated()
    const before = await snapshotAll(target)
    const parsed = await parseBackup(canonicalStringify(envelope))
    expect(parsed).toMatchObject({ ok: false, error: { code: 'invalid_backup' } })
    const result = await importBackup(target, canonicalStringify(envelope))
    expect(result.ok).toBe(false)
    expect(await snapshotAll(target)).toEqual(before)
  })
})

describe('weekly rules that span records', () => {
  it('a clean dataset validates', async () => {
    expect(codes(await rawOf(await populated()))).toEqual([])
  })

  it('a finalized board whose bonus row is missing is invalid', async () => {
    const raw = clone(await rawOf(await populated()))
    raw.xpTransactions = raw.xpTransactions.filter((row) => (row as { source: { type: string } }).source.type !== 'weekly_goal_crusher')
    expect(codes(raw)).toContain('missing_xp_transaction')
  })

  it('a weekly bonus row without a finalized board pointing at it is invalid', async () => {
    const raw = clone(await rawOf(await populated()))
    raw.weeklyBoards = raw.weeklyBoards.filter((board) => (board as { weekKey: string }).weekKey !== '2026-10-05')
    raw.weeklyRewardClaims = []
    expect(codes(raw)).toContain('missing_weekly_board')
  })

  it('a bonus row that disagrees with its board’s score is invalid', async () => {
    const raw = clone(await rawOf(await populated()))
    const row = raw.xpTransactions.find((candidate) => (candidate as { source: { type: string } }).source.type === 'weekly_goal_crusher') as {
      source: { score: number }
    }
    row.source.score = 8
    expect(codes(raw)).toContain('xp_transaction_mismatch')
  })

  it('an ACTIVE board cannot own a bonus row', async () => {
    const raw = clone(await rawOf(await populated()))
    const board = raw.weeklyBoards.find((candidate) => (candidate as { weekKey: string }).weekKey === '2026-10-05') as Record<string, unknown>
    board.status = 'active'
    board.finalization = null
    raw.weeklyRewardClaims = []
    expect(codes(raw)).toContain('missing_weekly_board')
  })

  it('a claim needs a finalized board, and must agree with its frozen tier and text', async () => {
    const claimed = clone(await rawOf(await populated()))
    expect(codes(claimed)).toEqual([])

    const noBoard = clone(claimed)
    noBoard.weeklyRewardClaims.push({ weekKey: '2026-09-28', tierMinScore: 6, rewardTextSnapshot: 'x', claimedAt: 1 })
    expect(codes(noBoard)).toContain('claim_board_not_finalized')

    const activeWeek = clone(claimed)
    activeWeek.weeklyRewardClaims.push({ weekKey: '2026-10-12', tierMinScore: 6, rewardTextSnapshot: 'x', claimedAt: 1 })
    expect(codes(activeWeek)).toContain('claim_board_not_finalized')

    const wrongText = clone(claimed)
    ;(wrongText.weeklyRewardClaims[0] as { rewardTextSnapshot: string }).rewardTextSnapshot = 'A different reward'
    expect(codes(wrongText)).toContain('weekly_claim_mismatch')

    const wrongTier = clone(claimed)
    ;(wrongTier.weeklyRewardClaims[0] as { tierMinScore: number }).tierMinScore = 7
    expect(codes(wrongTier)).toContain('weekly_claim_mismatch')
  })

  it('rejects duplicate boards and duplicate claims', async () => {
    const raw = clone(await rawOf(await populated()))
    raw.weeklyBoards.push(raw.weeklyBoards[0])
    raw.weeklyRewardClaims.push(raw.weeklyRewardClaims[0])
    expect(codes(raw)).toEqual(expect.arrayContaining(['duplicate_weekly_board', 'duplicate_weekly_claim']))
  })

  it('does not re-count completions: a snapshot stays valid whatever completions exist', async () => {
    const raw = clone(await rawOf(await populated()))
    raw.questCompletions = []
    raw.xpTransactions = raw.xpTransactions.filter((row) => (row as { source: { type: string } }).source.type === 'weekly_goal_crusher')
    raw.xpTransactions = raw.xpTransactions.map((row) => ({ ...(row as object), seq: 1, totalExpAfter: (row as { amount: number }).amount }))
    raw.questOccurrences = []
    raw.dailySummaries = []
    expect(codes(raw)).toEqual([])
  })

  it('requires both weekly collections', async () => {
    for (const key of ['weeklyBoards', 'weeklyRewardClaims'] as const) {
      const raw: Partial<Raw> = clone(await rawOf(await populated()))
      delete raw[key]
      expect(codes(raw as Raw)).toContain('not_an_array')
    }
  })
})

describe('verifyDatabaseIntegrity with weekly data', () => {
  it('finds a corrupt stored board', async () => {
    const database = await populated()
    const [board] = await readRaw(database, 'weeklyBoards')
    await writeRaw(database, 'weeklyBoards', { ...(board as object), goals: [] })
    expect(await verifyDatabaseIntegrity(database)).toMatchObject({ ok: false })
  })

  it('finds a claim for a week that was never finalized', async () => {
    const database = await populated()
    await writeRaw(database, 'weeklyRewardClaims', { weekKey: '2026-10-12', tierMinScore: 6, rewardTextSnapshot: 'x', claimedAt: 1 })
    const result = await verifyDatabaseIntegrity(database)
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain('claim_board_not_finalized')
  })

  it('reports clean for a healthy database with boards and claims', async () => {
    expect(await verifyDatabaseIntegrity(await populated())).toMatchObject({
      ok: true,
      report: { counts: { weeklyBoards: 2, weeklyRewardClaims: 1 } },
    })
  })
})
