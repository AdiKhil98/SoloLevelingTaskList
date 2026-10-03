import {
  buildDailySummary,
  computeDailyProgress,
  createOccurrence,
  isQuestEligibleOnDate,
  compareDateKeys,
  nextDate,
  previousDate,
  type DailySummary,
  type DateKey,
  type EpochMs,
  type QuestOccurrence,
} from '@/domain'
import { INDEX, STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { PersistenceError } from '../errors'
import { parseCompletion } from '../records/completion'
import { parseDailySummary } from '../records/dailySummary'
import { parseOccurrence } from '../records/occurrence'
import { parseTemplate } from '../records/template'
import { readEarliestOccurrenceDate, readLatestSummary } from '../repositories/dailySummaries'
import { parseForWrite, parseStored } from '../repositories/stored'

export interface FinalizeDayInput {
  /** The date to close. Must be strictly before `today`. */
  readonly dateKey: DateKey
  /** The caller's local date; a day that is not over is never finalized. */
  readonly today: DateKey
  /** The real instant of finalization. Supplied by the caller; never read here. */
  readonly finalizedAt: EpochMs
  /** True when this is catch-up rather than the normal in-app midnight rollover. */
  readonly finalizedLate: boolean
}

export type FinalizeDayRejection =
  /** The date is today or in the future: the day is not over. */
  | { readonly code: 'day_not_over'; readonly dateKey: DateKey; readonly today: DateKey }
  /** Finalizing this date would leave a hole in the chain of finalized dates (INV-13). */
  | { readonly code: 'chain_gap'; readonly dateKey: DateKey; readonly expected: DateKey | null }

export type FinalizeDayResult =
  | {
      readonly status: 'finalized'
      readonly summary: DailySummary
      /** How many missing occurrences this call created for the date (0 when the app was open that day). */
      readonly materialized: number
    }
  /** A repeat: the stored summary, nothing written. */
  | { readonly status: 'already_finalized'; readonly summary: DailySummary }
  | { readonly status: 'rejected'; readonly reason: FinalizeDayRejection }

const FINALIZE_STORES = [STORE.templates, STORE.occurrences, STORE.completions, STORE.dailySummaries] as const

/**
 * Finalizes one calendar date atomically (MASTER_SPEC §4.3–4.4).
 *
 * ONE read-write transaction over templates (read), occurrences, completions
 * and summaries:
 *  1. a stored summary for the date means it is already final: return it;
 *  2. the chain must stay contiguous: the previous date has a summary, or this
 *     is the very first date and no occurrence exists before it;
 *  3. every occurrence the date already has is kept as it is; each ACTIVE
 *     template that the domain says was eligible and has none gets one (the
 *     app may never have been opened that day). Missed quests earn no EXP;
 *  4. the date's completions are joined, the day is counted and classified by
 *     the Phase 02 engine, and the summary (with its streak effects applied to
 *     the previous summary) is added.
 *
 * It writes no XP row: finalization awards 0 EXP. Because completion and
 * finalization are both transactions, a completion lands either before it
 * (and is counted) or after it (and is refused by `completeQuestAtomically`).
 */
export async function finalizeDayAtomically(
  database: PersistenceDatabase,
  input: FinalizeDayInput,
): Promise<FinalizeDayResult> {
  try {
    return await runTransaction(database, FINALIZE_STORES, 'readwrite', (transaction) =>
      attemptFinalize(transaction, input),
    )
  } catch (error) {
    // A racing tab may have finalized the date between our read and write.
    if (error instanceof PersistenceError && error.code === 'constraint_violation') {
      const stored = await runTransaction(database, [STORE.dailySummaries], 'readonly', (transaction) =>
        requestToPromise(transaction.objectStore(STORE.dailySummaries).get(input.dateKey)),
      )
      if (stored !== undefined) {
        return {
          status: 'already_finalized',
          summary: parseStored(parseDailySummary, stored, `daily summary "${input.dateKey}"`),
        }
      }
    }
    throw error
  }
}

async function attemptFinalize(transaction: IDBTransaction, input: FinalizeDayInput): Promise<FinalizeDayResult> {
  const { dateKey } = input
  const summaries = transaction.objectStore(STORE.dailySummaries)
  const occurrences = transaction.objectStore(STORE.occurrences)

  const existingRaw = await requestToPromise(summaries.get(dateKey))
  if (existingRaw !== undefined) {
    return {
      status: 'already_finalized',
      summary: parseStored(parseDailySummary, existingRaw, `daily summary "${dateKey}"`),
    }
  }
  if (compareDateKeys(dateKey, input.today) >= 0) {
    return { status: 'rejected', reason: { code: 'day_not_over', dateKey, today: input.today } }
  }

  const latest = await readLatestSummary(transaction)
  if (latest !== null) {
    if (latest.dateKey !== previousDate(dateKey)) {
      return { status: 'rejected', reason: { code: 'chain_gap', dateKey, expected: nextDate(latest.dateKey) } }
    }
  } else {
    const earliest = await readEarliestOccurrenceDate(transaction)
    if (earliest !== null && compareDateKeys(earliest, dateKey) < 0) {
      return { status: 'rejected', reason: { code: 'chain_gap', dateKey, expected: earliest } }
    }
  }

  const templatesRaw = await requestToPromise(transaction.objectStore(STORE.templates).getAll())
  const templates = templatesRaw.map((value, index) => parseStored(parseTemplate, value, `quest template [${index}]`))
  const existingOccurrencesRaw = await requestToPromise(
    occurrences.index(INDEX.occurrences.dateKey).getAll(dateKey),
  )
  const dayOccurrences: QuestOccurrence[] = existingOccurrencesRaw.map((value, index) =>
    parseStored(parseOccurrence, value, `quest occurrence [${index}]`),
  )
  const hasOccurrence = new Set(dayOccurrences.map((occurrence) => occurrence.templateId))

  let materialized = 0
  for (const template of templates) {
    if (template.status !== 'active' || hasOccurrence.has(template.id)) continue
    if (!isQuestEligibleOnDate(template, dateKey)) continue
    const built = createOccurrence(template, dateKey, input.finalizedAt)
    if (!built.ok) {
      throw new PersistenceError(
        'record_validation_failed',
        `Could not materialize "${template.id}" for ${dateKey} (${built.error.code})`,
      )
    }
    const valid = parseForWrite(parseOccurrence, built.value, 'quest occurrence')
    await requestToPromise(occurrences.add(valid))
    dayOccurrences.push(valid)
    materialized += 1
  }
  dayOccurrences.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const completionsRaw = await requestToPromise(
    transaction.objectStore(STORE.completions).index(INDEX.completions.dateKey).getAll(dateKey),
  )
  const completions = completionsRaw.map((value, index) =>
    parseStored(parseCompletion, value, `quest completion [${index}]`),
  )
  const occurrenceIds = new Set(dayOccurrences.map((occurrence) => occurrence.id))
  const counted = completions.filter((completion) => occurrenceIds.has(completion.occurrenceId))

  const progress = computeDailyProgress({
    dateKey,
    occurrences: dayOccurrences,
    completedOccurrenceIds: new Set(counted.map((completion) => completion.occurrenceId)),
  })
  if (!progress.ok) {
    throw new PersistenceError('record_validation_failed', `The occurrences of ${dateKey} are inconsistent (${progress.error.code})`)
  }

  const summary = parseForWrite(
    parseDailySummary,
    buildDailySummary({
      dateKey,
      progress: progress.value,
      occurrenceIds: dayOccurrences.map((occurrence) => occurrence.id),
      questExp: counted.reduce((sum, completion) => sum + completion.expAwarded, 0),
      previous: latest,
      finalizedAt: input.finalizedAt,
      finalizedLate: input.finalizedLate,
    }),
    'daily summary',
  )
  await requestToPromise(summaries.add(summary))
  return { status: 'finalized', summary, materialized }
}
