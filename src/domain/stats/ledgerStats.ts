import { CATEGORIES, type Category } from '../config/categories'
import type { XPTransaction } from '../progression/ledger'
import { inLedgerOrder } from './history'

/** One category's lifetime totals. Weekly bonus EXP has no category and is never in them. */
export interface CategoryStats {
  readonly category: Category
  /** Lifetime EXP of quest completions in this category. */
  readonly exp: number
  readonly completions: number
}

/** One quest template's completion history, as the ledger recorded it. */
export interface QuestTally {
  readonly templateId: string
  readonly completions: number
  readonly exp: number
  /** Ledger `seq` of its first completion: its place in history and the tie-break below. */
  readonly firstSeq: number
  /**
   * The occurrence of its most recent completion. Its stored snapshot carries
   * the quest's title as it was then, so a label survives even if the template
   * itself is gone.
   */
  readonly lastOccurrenceId: string
}

export interface LedgerStats {
  /** Lifetime EXP: the sum of every ledger row. */
  readonly totalExp: number
  /** EXP from quest completions only. */
  readonly questExp: number
  /** EXP from finalized Weekly Goal Crusher boards only. */
  readonly weeklyBonusExp: number
  readonly totalCompletions: number
  /** Always the five categories, in the fixed category order (zeros included). */
  readonly categories: readonly CategoryStats[]
  /**
   * Every template that was ever completed: most completions first; ties by
   * the earlier first completion, then by id, so the order is deterministic.
   */
  readonly quests: readonly QuestTally[]
}

interface MutableTally {
  templateId: string
  completions: number
  exp: number
  firstSeq: number
  lastOccurrenceId: string
}

/**
 * Derives the quest and EXP statistics from the XP ledger alone (DATA_MODEL
 * INV-9: category totals + weekly bonuses = lifetime EXP). Ledger rows are
 * immutable snapshots (category and template id as they were when the quest was
 * completed), so editing or archiving a template can never change a result.
 * The rows may arrive in any order.
 */
export function summarizeLedger(rows: readonly XPTransaction[]): LedgerStats {
  const categoryExp = new Map<Category, number>(CATEGORIES.map((category) => [category, 0]))
  const categoryCount = new Map<Category, number>(CATEGORIES.map((category) => [category, 0]))
  const tallies = new Map<string, MutableTally>()
  let questExp = 0
  let weeklyBonusExp = 0
  let totalCompletions = 0

  for (const row of inLedgerOrder(rows)) {
    if (row.source.type === 'weekly_goal_crusher') {
      weeklyBonusExp += row.amount
      continue
    }
    questExp += row.amount
    totalCompletions += 1
    if (row.category !== null) {
      categoryExp.set(row.category, (categoryExp.get(row.category) ?? 0) + row.amount)
      categoryCount.set(row.category, (categoryCount.get(row.category) ?? 0) + 1)
    }
    const { templateId, occurrenceId } = row.source
    const tally = tallies.get(templateId)
    if (tally === undefined) {
      tallies.set(templateId, { templateId, completions: 1, exp: row.amount, firstSeq: row.seq, lastOccurrenceId: occurrenceId })
    } else {
      tally.completions += 1
      tally.exp += row.amount
      tally.lastOccurrenceId = occurrenceId
    }
  }

  const quests = [...tallies.values()].sort(
    (a, b) =>
      b.completions - a.completions ||
      a.firstSeq - b.firstSeq ||
      (a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0),
  )

  return {
    totalExp: questExp + weeklyBonusExp,
    questExp,
    weeklyBonusExp,
    totalCompletions,
    categories: CATEGORIES.map((category) => ({
      category,
      exp: categoryExp.get(category) ?? 0,
      completions: categoryCount.get(category) ?? 0,
    })),
    quests,
  }
}
