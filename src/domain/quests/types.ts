import type { Category } from '../config/categories'
import type { Difficulty } from '../config/difficulty'
import type { DateKey, EpochMs, IsoWeekday } from '../types/scalars'

export type QuestRecurrence =
  | { readonly kind: 'daily' }
  | { readonly kind: 'weekdays'; readonly weekdays: readonly IsoWeekday[] }
  | {
      readonly kind: 'interval'
      readonly everyNDays: number
      readonly anchor: DateKey
    }
  | { readonly kind: 'one_time'; readonly date: DateKey }

export type QuestRecurrenceKind = QuestRecurrence['kind']

export type QuestRole = 'standard' | 'sleep'

/**
 * A quest definition (DATA_MODEL §4). EXP is deliberately not a field: it is
 * derived from `difficulty`.
 */
export interface QuestTemplate {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly difficulty: Difficulty
  readonly category: Category
  readonly recurrence: QuestRecurrence
  readonly role: QuestRole
  readonly seedKey: string | null
  readonly activeFrom: DateKey
  readonly activeUntil: DateKey | null
  readonly status: 'active' | 'archived'
  readonly revision: number
  readonly createdAt: EpochMs
  readonly updatedAt: EpochMs
}

/** "This quest on this date", frozen when created (DATA_MODEL §5). */
export interface QuestOccurrence {
  /** `occ:{templateId}@{dateKey}` */
  readonly id: string
  readonly templateId: string
  readonly dateKey: DateKey
  readonly templateRevision: number
  readonly snapshot: {
    readonly title: string
    readonly difficulty: Difficulty
    readonly category: Category
    readonly expReward: number
    readonly role: QuestRole
    readonly recurrenceKind: QuestRecurrenceKind
  }
  readonly materializedAt: EpochMs
}

/** Primary key is `occurrenceId`, so at most one exists per occurrence. */
export interface QuestCompletion {
  readonly occurrenceId: string
  readonly templateId: string
  /** Always equals the occurrence's `dateKey`. */
  readonly dateKey: DateKey
  readonly category: Category
  readonly expAwarded: number
  readonly completedAt: EpochMs
  readonly utcOffsetMinutes: number
  /** IANA zone, audit only. */
  readonly timeZone: string
  readonly xpTransactionId: string
}
