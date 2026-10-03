import {
  err,
  isCategory,
  isDifficulty,
  ISO_WEEKDAYS,
  MIN_INTERVAL_DAYS,
  ok,
  parseDateKey,
  compareDateKeys,
  validateRecurrence,
  type Category,
  type DateKey,
  type Difficulty,
  type IsoWeekday,
  type QuestRecurrence,
  type QuestRecurrenceKind,
  type QuestTemplate,
  type Result,
} from '@/domain'

/**
 * The quest form, as pure data. The UI keeps the raw field values (strings, as
 * typed or picked) and hands them to the use cases; ALL parsing and validation
 * lives here so no component converts dates, parses numbers or builds a
 * recurrence. Wording is the UI's job: errors are codes.
 */

/** Raw form values. Never trusted: `parseQuestForm` is the only way to a `QuestDefinition`. */
export interface QuestFormValues {
  readonly title: string
  readonly recurrence: QuestRecurrenceKind
  /** A difficulty identifier (E–S) or '' when none is chosen. */
  readonly difficulty: string
  /** A category identifier or '' when none is chosen. */
  readonly category: string
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  readonly weekdays: readonly number[]
  /** `YYYY-MM-DD` from a native date input, or ''. Start of Daily, Weekdays and Interval quests. */
  readonly startDate: string
  /** Digits as typed. */
  readonly intervalDays: string
  /** `YYYY-MM-DD` from a native date input, or ''. The date of a One-Time quest. */
  readonly questDate: string
}

export type QuestFormField =
  | 'title'
  | 'recurrence'
  | 'difficulty'
  | 'category'
  | 'weekdays'
  | 'startDate'
  | 'intervalDays'
  | 'questDate'

export type QuestFormErrorCode =
  | 'title_required'
  | 'recurrence_invalid'
  | 'difficulty_required'
  | 'category_required'
  | 'weekdays_required'
  | 'weekdays_invalid'
  | 'date_required'
  | 'date_invalid'
  | 'date_in_past'
  | 'interval_required'
  | 'interval_not_integer'
  | 'interval_too_small'

export type QuestFormErrors = Readonly<Partial<Record<QuestFormField, QuestFormErrorCode>>>

/** A validated quest: exactly the editable part of a template. EXP is never part of it (derived from difficulty). */
export interface QuestDefinition {
  readonly title: string
  readonly difficulty: Difficulty
  readonly category: Category
  readonly recurrence: QuestRecurrence
  readonly activeFrom: DateKey
}

/** The form a new quest starts from: Daily, Normal (C), Discipline, starting today. */
export function defaultQuestFormValues(today: DateKey): QuestFormValues {
  return {
    title: '',
    recurrence: 'daily',
    difficulty: 'C',
    category: 'discipline',
    weekdays: [],
    startDate: today,
    intervalDays: String(MIN_INTERVAL_DAYS),
    questDate: today,
  }
}

/** The form values describing an existing template (what the Edit screen starts from). */
export function formValuesFromTemplate(template: QuestTemplate, today: DateKey): QuestFormValues {
  const { recurrence } = template
  return {
    ...defaultQuestFormValues(today),
    title: template.title,
    recurrence: recurrence.kind,
    difficulty: template.difficulty,
    category: template.category,
    weekdays: recurrence.kind === 'weekdays' ? [...recurrence.weekdays] : [],
    startDate: recurrence.kind === 'interval' ? recurrence.anchor : template.activeFrom,
    intervalDays: recurrence.kind === 'interval' ? String(recurrence.everyNDays) : String(MIN_INTERVAL_DAYS),
    questDate: recurrence.kind === 'one_time' ? recurrence.date : today,
  }
}

export interface ParseQuestFormContext {
  /** The local date at the moment of saving (read from the clock by the use case). */
  readonly today: DateKey
  /**
   * The stored template when editing. A start or quest date that the stored
   * template already has is accepted even if it is now in the past, so an old
   * quest can be edited without touching its dates; a changed date must not be
   * in the past.
   */
  readonly current?: QuestTemplate
}

type MutableErrors = { -readonly [K in QuestFormField]?: QuestFormErrorCode }

function readDate(
  raw: string,
  field: 'startDate' | 'questDate',
  today: DateKey,
  unchanged: DateKey | undefined,
  errors: MutableErrors,
): DateKey | undefined {
  if (raw.trim() === '') {
    errors[field] = 'date_required'
    return undefined
  }
  const parsed = parseDateKey(raw.trim())
  if (!parsed.ok) {
    errors[field] = 'date_invalid'
    return undefined
  }
  if (compareDateKeys(parsed.value, today) < 0 && parsed.value !== unchanged) {
    errors[field] = 'date_in_past'
    return undefined
  }
  return parsed.value
}

function readWeekdays(raw: readonly number[], errors: MutableErrors): readonly IsoWeekday[] | undefined {
  if (raw.some((weekday) => !(ISO_WEEKDAYS as readonly number[]).includes(weekday))) {
    errors.weekdays = 'weekdays_invalid'
    return undefined
  }
  const unique = [...new Set(raw)].sort((a, b) => a - b) as IsoWeekday[]
  if (unique.length === 0) {
    errors.weekdays = 'weekdays_required'
    return undefined
  }
  return unique
}

function readInterval(raw: string, errors: MutableErrors): number | undefined {
  const text = raw.trim()
  if (text === '') {
    errors.intervalDays = 'interval_required'
    return undefined
  }
  // Digits only: no sign, decimal point or exponent, whatever the browser allows.
  const value = /^\d+$/.test(text) ? Number(text) : Number.NaN
  if (!Number.isSafeInteger(value)) {
    errors.intervalDays = 'interval_not_integer'
    return undefined
  }
  if (value < MIN_INTERVAL_DAYS) {
    errors.intervalDays = 'interval_too_small'
    return undefined
  }
  return value
}

function earlier(a: DateKey, b: DateKey): DateKey {
  return compareDateKeys(a, b) <= 0 ? a : b
}

/**
 * Turns raw form values into a validated `QuestDefinition`, or returns every
 * field error at once. The recurrence is built here (UI code never constructs
 * one) and checked again by the domain's `validateRecurrence`.
 *
 *  - Daily / Weekdays / Interval: `activeFrom` is the Start Date (an Interval's
 *    anchor is the same date, and the anchor itself is eligible).
 *  - One-Time: `activeFrom` is never later than the quest date.
 *  - A start/quest date may not be in the past unless it is the stored one.
 */
export function parseQuestForm(
  values: QuestFormValues,
  { today, current }: ParseQuestFormContext,
): Result<QuestDefinition, QuestFormErrors> {
  const errors: MutableErrors = {}

  const title = values.title.trim()
  if (title === '') errors.title = 'title_required'

  const difficulty: Difficulty | undefined = isDifficulty(values.difficulty) ? values.difficulty : undefined
  if (difficulty === undefined) errors.difficulty = 'difficulty_required'

  const category: Category | undefined = isCategory(values.category) ? values.category : undefined
  if (category === undefined) errors.category = 'category_required'

  const storedStart =
    current === undefined
      ? undefined
      : current.recurrence.kind === 'interval'
        ? current.recurrence.anchor
        : current.activeFrom
  const storedQuestDate = current?.recurrence.kind === 'one_time' ? current.recurrence.date : undefined

  let recurrence: QuestRecurrence | undefined
  let activeFrom: DateKey | undefined

  switch (values.recurrence) {
    case 'daily': {
      const start = readDate(values.startDate, 'startDate', today, storedStart, errors)
      if (start !== undefined) {
        recurrence = { kind: 'daily' }
        activeFrom = start
      }
      break
    }
    case 'weekdays': {
      const weekdays = readWeekdays(values.weekdays, errors)
      const start = readDate(values.startDate, 'startDate', today, storedStart, errors)
      if (weekdays !== undefined && start !== undefined) {
        recurrence = { kind: 'weekdays', weekdays }
        activeFrom = start
      }
      break
    }
    case 'interval': {
      const everyNDays = readInterval(values.intervalDays, errors)
      const start = readDate(values.startDate, 'startDate', today, storedStart, errors)
      if (everyNDays !== undefined && start !== undefined) {
        recurrence = { kind: 'interval', everyNDays, anchor: start }
        activeFrom = start
      }
      break
    }
    case 'one_time': {
      const date = readDate(values.questDate, 'questDate', today, storedQuestDate, errors)
      if (date !== undefined) {
        recurrence = { kind: 'one_time', date }
        activeFrom = earlier(current?.activeFrom ?? today, date)
      }
      break
    }
    default:
      errors.recurrence = 'recurrence_invalid'
  }

  if (Object.keys(errors).length > 0) return err(errors)
  if (difficulty === undefined || category === undefined || recurrence === undefined || activeFrom === undefined) {
    return err({ recurrence: 'recurrence_invalid' })
  }

  // The domain has the final word on what a valid recurrence is.
  const checked = validateRecurrence(recurrence)
  if (!checked.ok) return err({ recurrence: 'recurrence_invalid' })

  return ok({ title, difficulty, category, recurrence: checked.value, activeFrom })
}
