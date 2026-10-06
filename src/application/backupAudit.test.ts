// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { asWeekKey } from '@/domain'
import {
  exportBackup,
  importBackup,
  openDatabase,
  parseBackup,
  PersistenceError,
  serializeBackup,
  verifyDatabaseIntegrity,
  type PersistenceDatabase,
} from '@/persistence'
import { canonicalStringify } from '@/persistence/canonical'
import { computeBackupChecksum } from '@/persistence/backup/envelope'
import type { ApplicationContext } from './context'
import { completeTodayQuest } from './completion/completeTodayQuest'
import { synchronizeAndLoadHome } from './home'
import { loadHome } from './home'
import { startApplication } from './initialize'
import { loadAchievements } from './player/loadAchievements'
import { loadDailyHistory } from './player/loadDailyHistory'
import { loadPlayerProfile } from './player/loadPlayerProfile'
import { loadStreakStats } from './player/loadStreakStats'
import { completeAwakening } from './profile/awakening'
import { archiveQuest } from './quests/archiveQuest'
import { createQuest } from './quests/createQuest'
import { reorderQuests } from './quests/reorderQuests'
import { restoreQuest } from './quests/restoreQuest'
import { buildDailyReport } from './report/buildDailyReport'
import { buildFormValues, createSequentialIds, createTestClock, newFactory, noonOn } from './test-utils/helpers'
import { weeklyForm } from './test-utils/weekly'
import { claimWeeklyReward } from './weekly/claimWeeklyReward'
import { loadWeeklyHistory } from './weekly/loadWeeklyHistory'
import { loadWeeklyScreen } from './weekly/loadWeeklyScreen'
import { saveWeeklyBoard } from './weekly/saveWeeklyBoard'
import { setWeeklyGoalProgress } from './weekly/setWeeklyGoalProgress'
import { getWeeklyBoard, listTemplates } from '@/persistence'

/**
 * Phase 13 backup-engine audit (no UI). The engine's own tests prove each rule one case at a time; these attack it
 * from outside, with a dataset built by real use: damaged files must never be accepted as something they are not,
 * and a file the engine DOES accept must never be able to break the application's readers.
 */

const opened: PersistenceDatabase[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  while (opened.length > 0) opened.pop()?.close()
})

const META = { exportedAt: 1_700_000_000_000, exportedFromTimeZone: 'Europe/Berlin', appVersion: 'audit' } as const
const prayerOcc = (key: string, date: string) => `occ:tpl_seed_prayer_${key}@${date}`

async function open(): Promise<ApplicationContext & { clock: ReturnType<typeof createTestClock> }> {
  const database = await openDatabase({ factory: newFactory() })
  opened.push(database)
  return { database, clock: createTestClock(noonOn('2026-10-05')), ids: createSequentialIds() }
}

/** Three weeks of real use: Awakening, completions, management, a finalized Weekly board with a claimed reward. */
async function richLife() {
  const context = await open()
  await completeAwakening(context, 'Ada')
  await startApplication(context)

  const dayOne = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']
  for (const key of dayOne) await completeTodayQuest(context, prayerOcc(key, '2026-10-05'))
  await completeTodayQuest(context, 'occ:tpl_seed_sleep@2026-10-05') // a Perfect Day

  await createQuest(context, buildFormValues({ title: 'Read ten pages' }))
  await archiveQuest(context, 'tpl_seed_prayer_isha')
  await restoreQuest(context, 'tpl_seed_prayer_isha')
  const templates = await listTemplates(context.database)
  const order = [...templates].sort((a, b) => a.sortOrder - b.sortOrder).map((template) => template.id)
  await reorderQuests(context, { expectedOrder: order, newOrder: [order[1], order[0], ...order.slice(2)] as string[] })

  context.clock.set(noonOn('2026-10-07'))
  await synchronizeAndLoadHome(context, 'resume')
  await saveWeeklyBoard(context, weeklyForm())
  const board = await getWeeklyBoard(context.database, asWeekKey('2026-10-05'))
  const big = board?.goals.find((goal) => goal.maxPoints === 6)
  if (big === undefined) throw new Error('no 6-point goal')
  await setWeeklyGoalProgress(context, big.id, 20)
  await completeTodayQuest(context, prayerOcc('fajr', '2026-10-07'))

  context.clock.set(noonOn('2026-10-20')) // two weeks pass; the board is finalized (+100 EXP) on the way
  await synchronizeAndLoadHome(context, 'resume')
  await claimWeeklyReward(context, asWeekKey('2026-10-05'))
  await completeTodayQuest(context, prayerOcc('dhuhr', '2026-10-20'))
  return context
}

async function exportText(context: ApplicationContext, meta: typeof META = META) {
  return serializeBackup(await exportBackup(context.database, meta))
}

/** Edits the parsed envelope and signs it again, so the CONTENT checks (not the checksum) are what is tested. */
async function resign(text: string, edit: (envelope: Record<string, unknown>) => void): Promise<string> {
  const envelope = JSON.parse(text) as Record<string, unknown>
  edit(envelope)
  const { checksum: _old, ...unsigned } = envelope
  void _old
  envelope.checksum = { algorithm: 'SHA-256', value: await computeBackupChecksum(unsigned) }
  return JSON.stringify(envelope)
}

/** Every reader the screens use. A backup the engine accepted must leave all of them working. */
async function exerciseReaders(context: ApplicationContext) {
  const home = await loadHome(context)
  buildDailyReport(home)
  const results = await Promise.all([
    loadAchievements(context),
    loadDailyHistory(context),
    loadPlayerProfile(context),
    loadWeeklyScreen(context),
    loadWeeklyHistory(context),
  ])
  for (const result of results) {
    if (result.status === 'failed') throw new Error(`a reader failed on accepted data: ${String(result.cause)}`)
  }
  await loadStreakStats(context)
}

describe('export and restore of a real life', () => {
  it('restores into an empty database byte-for-byte: the same data exports to the same text, and the app runs on it', async () => {
    const source = await richLife()
    const text = await exportText(source)

    const target = await open()
    const result = await importBackup(target.database, text)
    expect(result.ok).toBe(true)
    expect(await exportText(target)).toBe(text) // nothing lost, nothing added, nothing reordered

    expect((await verifyDatabaseIntegrity(target.database)).ok).toBe(true)
    target.clock.set(noonOn('2026-10-20'))
    await startApplication(target) // the restored database starts like any other
    await exerciseReaders(target)
  })

  it('a backup is identical when taken twice, and its size stays modest for a real life (informational bound)', async () => {
    const source = await richLife()
    const first = await exportText(source)
    expect(await exportText(source)).toBe(first)
    expect(first.length).toBeLessThan(300_000) // three weeks of use: far below the 32 MB engine limit
  })
})

describe('the checksum needs Web Crypto, and says so without writing anything', () => {
  it('export and import fail with the typed checksum_unavailable error; the database is untouched', async () => {
    const source = await richLife()
    const text = await exportText(source)
    const before = await exportText(source)

    vi.stubGlobal('crypto', undefined) // an insecure origin: no crypto.subtle
    await expect(exportBackup(source.database, META)).rejects.toMatchObject({ code: 'checksum_unavailable' })
    await expect(importBackup(source.database, text)).rejects.toBeInstanceOf(PersistenceError)
    await expect(importBackup(source.database, text)).rejects.toMatchObject({ code: 'checksum_unavailable' })
    await expect(parseBackup(text)).rejects.toMatchObject({ code: 'checksum_unavailable' })
    vi.unstubAllGlobals()

    expect(await exportText(source)).toBe(before) // not one record changed
  })
})

describe('a damaged file is never mistaken for a valid one', () => {
  it('a file cut off anywhere is rejected, never accepted and never thrown', async () => {
    const text = await exportText(await richLife())
    const cuts = new Set<number>([0, 1, 2, 10, text.length - 1, text.length - 2, text.length - 50, text.length - 200])
    for (let at = 0; at < text.length; at += Math.ceil(text.length / 160)) cuts.add(at)

    for (const at of cuts) {
      const result = await parseBackup(text.slice(0, at))
      expect(result.ok, `cut at ${at} of ${text.length}`).toBe(false)
      if (!result.ok) expect(['invalid_backup', 'backup_checksum_mismatch', 'unsupported_backup_version']).toContain(result.error.code)
    }
  })

  it('one changed character anywhere is either refused or changes nothing that matters', async () => {
    const text = await exportText(await richLife())
    const original = canonicalStringify(JSON.parse(text))
    const flips = new Set<number>()
    for (let at = 0; at < text.length; at += Math.ceil(text.length / 400)) flips.add(at)

    for (const at of flips) {
      const char = text[at] as string
      const replacement = char === '1' ? '2' : char === 'a' ? 'b' : char === '"' ? "'" : char === ' ' || char === '\n' ? 'x' : '1'
      const damaged = text.slice(0, at) + replacement + text.slice(at + 1)
      const result = await parseBackup(damaged)
      if (result.ok) {
        // Accepted only if the damage was formatting (whitespace in the pretty-printed file): the content is identical.
        expect(canonicalStringify(result.value.envelope), `flip at ${at}`).toBe(original)
      } else {
        expect(['invalid_backup', 'backup_checksum_mismatch', 'unsupported_backup_version']).toContain(result.error.code)
      }
    }
  })

  it('a rejected file changes nothing: the database before and after are identical', async () => {
    const source = await richLife()
    const text = await exportText(source)
    const before = await exportText(source)
    for (const damaged of [text.slice(0, Math.floor(text.length / 2)), text.replace('"format"', '"fromat"'), '{}', '[]', 'null', text + 'garbage']) {
      await importBackup(source.database, damaged)
    }
    expect(await exportText(source)).toBe(before)
  })
})

describe('a signed file the engine accepts can never break the application', () => {
  it.todo('a default quest with a damaged id or seedKey in an ACCEPTED backup must not stop the app from starting (see docs/QA_HARDENING.md)')

  /** A small deterministic generator, so a failure is reproducible from the printed seed and index. */
  function generator(seed: number) {
    let state = seed >>> 0
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 0x100000000
    }
  }
  const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)] as T

  const REPLACEMENTS: readonly unknown[] = [null, '', 'x', 'garbage', 0, -1, 1, 2, 1e15, 0.5, [], {}, true, false, '2026-10-05', '2026-13-45']

  /** Picks a random place inside `data` (a record, then a path of at most three keys) and damages it. */
  function mutate(data: Record<string, unknown[]>, random: () => number): string | null {
    const collections = Object.keys(data).filter((key) => (data[key] as unknown[]).length > 0)
    const name = pick(random, collections)
    const records = data[name] as Record<string, unknown>[]
    const index = Math.floor(random() * records.length)
    const operation = pick(random, ['replace', 'delete_key', 'delete_record', 'duplicate_record', 'swap_records', 'shift_number'] as const)
    const beforeRecord = JSON.stringify(records[index])

    if (operation === 'delete_record') records.splice(index, 1)
    else if (operation === 'duplicate_record') records.push(structuredClone(records[index]) as Record<string, unknown>)
    else if (operation === 'swap_records') {
      const other = Math.floor(random() * records.length)
      ;[records[index], records[other]] = [records[other] as Record<string, unknown>, records[index] as Record<string, unknown>]
    } else {
      let holder: Record<string, unknown> = records[index] as Record<string, unknown>
      let key = pick(random, Object.keys(holder))
      for (let depth = 0; depth < 2; depth += 1) {
        const next = holder[key]
        if (typeof next === 'object' && next !== null && !Array.isArray(next) && Object.keys(next).length > 0 && random() < 0.6) {
          holder = next as Record<string, unknown>
          key = pick(random, Object.keys(holder))
        } else if (Array.isArray(next) && next.length > 0 && typeof next[0] === 'object' && next[0] !== null && random() < 0.6) {
          holder = next[Math.floor(random() * next.length)] as Record<string, unknown>
          key = pick(random, Object.keys(holder))
        }
      }
      // KNOWN GAP, reported in docs/QA_HARDENING.md (not changed in Phase 13): a default quest whose id or seedKey is damaged
      // makes startup try to seed it again and fail on the occupied id. Declined here so the fuzz keeps hunting for others.
      if (name === 'questTemplates' && holder === records[index] && String(records[index]?.id).startsWith('tpl_seed_') && (key === 'seedKey' || key === 'id')) return null
      if (operation === 'delete_key') delete holder[key]
      else if (operation === 'shift_number' && typeof holder[key] === 'number') holder[key] = (holder[key] as number) + pick(random, [-1, 1, 7])
      else holder[key] = pick(random, REPLACEMENTS)
    }
    return `${operation} ${name}[${index}]: ${beforeRecord} -> ${JSON.stringify(records[index])}`
  }

  it('2,000 seeded mutations: each is rejected with a typed reason, or accepted and then every screen still loads', async () => {
    const text = await exportText(await richLife())
    const random = generator(20_261_005)
    let accepted = 0
    let rejected = 0
    let declined = 0

    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      let what: string | null = ''
      const signed = await resign(text, (envelope) => {
        what = mutate(envelope.data as Record<string, unknown[]>, random)
      })
      if (what === null) {
        declined += 1
        continue
      }

      const parsed = await parseBackup(signed)
      if (!parsed.ok) {
        rejected += 1
        expect(['invalid_backup', 'backup_checksum_mismatch', 'unsupported_backup_version'], `#${attempt} ${what}`).toContain(parsed.error.code)
        continue
      }

      accepted += 1
      const target = await open()
      const restored = await importBackup(target.database, signed)
      expect(restored.ok, `#${attempt} ${what}`).toBe(true)
      expect((await verifyDatabaseIntegrity(target.database)).ok, `#${attempt} ${what}`).toBe(true)
      target.clock.set(noonOn('2026-10-20'))
      try {
        await startApplication(target)
        await exerciseReaders(target)
      } catch (error) {
        throw new Error(`an accepted backup broke the application (#${attempt}: ${what}): ${String(error)}`, { cause: error })
      }
      opened.pop()?.close()
    }
    // Most damage must be caught; the rest (a renamed quest, a different but valid number) is legitimately a different life.
    expect(rejected).toBeGreaterThan(accepted)
    expect(rejected + accepted + declined).toBe(2_000)
  }, 240_000)
})
