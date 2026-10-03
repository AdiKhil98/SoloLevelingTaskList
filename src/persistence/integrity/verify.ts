import type { Result } from '@/domain'
import { STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { allRequests, runTransaction } from '../database/transaction'
import type { ValidationIssue } from '../errors'
import { progressionFromLedger, type PlayerProgression } from '../ledger/ledgerTip'
import { validateDataset, type DatasetRecords, type ValidatedDataset } from './dataset'

const ALL_STORES = [
  STORE.templates,
  STORE.occurrences,
  STORE.completions,
  STORE.xpTransactions,
  STORE.dailySummaries,
] as const

/**
 * Reads every durable record in ONE read-only transaction (a consistent
 * snapshot) without validating it. Collections come back in key order, except
 * the ledger, which is put in ledger order (ascending `seq`).
 *
 * @internal Shared by export and `verifyDatabaseIntegrity`.
 */
export async function readRawDataset(database: PersistenceDatabase): Promise<Record<string, unknown[]>> {
  return runTransaction(database, ALL_STORES, 'readonly', async (transaction) => {
    const [questTemplates, questOccurrences, questCompletions, xpTransactions, dailySummaries] = (await allRequests(
      ALL_STORES.map((name) => () => transaction.objectStore(name).getAll()),
    )) as [unknown[], unknown[], unknown[], unknown[], unknown[]]
    const seqOf = (row: unknown): number => {
      const seq = typeof row === 'object' && row !== null ? (row as { seq?: unknown }).seq : undefined
      return typeof seq === 'number' ? seq : Number.POSITIVE_INFINITY
    }
    xpTransactions.sort((a: unknown, b: unknown) => seqOf(a) - seqOf(b))
    return { questTemplates, questOccurrences, questCompletions, xpTransactions, dailySummaries }
  })
}

/** Reads and validates the whole database; the result carries the validated records. */
export async function readValidatedDataset(
  database: PersistenceDatabase,
): Promise<Result<ValidatedDataset, readonly ValidationIssue[]>> {
  return validateDataset(await readRawDataset(database), 'database')
}

export interface IntegrityReport {
  readonly counts: {
    readonly questTemplates: number
    readonly questOccurrences: number
    readonly questCompletions: number
    readonly xpTransactions: number
    readonly dailySummaries: number
  }
  /** Progression derived from the verified ledger (nothing is read from a cache). */
  readonly progression: PlayerProgression
}

export function summarizeRecords(records: DatasetRecords): IntegrityReport['counts'] {
  return {
    questTemplates: records.questTemplates.length,
    questOccurrences: records.questOccurrences.length,
    questCompletions: records.questCompletions.length,
    xpTransactions: records.xpTransactions.length,
    dailySummaries: records.dailySummaries.length,
  }
}

/**
 * Full integrity check of the stored database: record shapes, uniqueness,
 * completion ↔ occurrence ↔ XP agreement, and the ledger chain. Returns the
 * list of problems instead of throwing, so a caller can present them.
 */
export async function verifyDatabaseIntegrity(
  database: PersistenceDatabase,
): Promise<{ readonly ok: true; readonly report: IntegrityReport } | { readonly ok: false; readonly issues: readonly ValidationIssue[] }> {
  const validated = await readValidatedDataset(database)
  if (!validated.ok) return { ok: false, issues: validated.error }
  return {
    ok: true,
    report: {
      counts: summarizeRecords(validated.value.records),
      progression: progressionFromLedger(validated.value.ledger),
    },
  }
}
