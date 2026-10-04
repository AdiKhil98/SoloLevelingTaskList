import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { QuestFormErrors, QuestFormField, QuestFormValues } from '@/application'
import {
  CATEGORIES,
  DIFFICULTIES,
  ISO_WEEKDAYS,
  expRewardForDifficulty,
  isDifficulty,
  type DateKey,
  type IsoWeekday,
  type QuestRecurrenceKind,
} from '@/domain'
import { categoryLabel, difficultyLabel, weekdayName, weekdayShortName } from '../displayLabels'
import { CheckboxChip, FieldGroup, INPUT, RadioChip, TextField } from './FormControls'
import { fieldErrorText } from './questMessages'
import { SectionLabel } from '@/components/ui/SectionLabel'

/** What the page tells the form after a save attempt. */
export type QuestFormOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'invalid'; readonly errors: QuestFormErrors }
  | { readonly status: 'error'; readonly message: string }

interface QuestFormProps {
  mode: 'create' | 'edit'
  initial: QuestFormValues
  /** Today's local date; only the `min` hint of the date inputs (the use case validates against a fresh reading). */
  today: DateKey
  onSubmit: (values: QuestFormValues) => Promise<QuestFormOutcome>
  cancelTo: string
}

type QuestType = 'daily' | 'scheduled' | 'one_time'
type Schedule = 'weekdays' | 'interval'

const FIELD_LABEL: Record<QuestFormField, string> = {
  title: 'Title',
  recurrence: 'Schedule',
  difficulty: 'Difficulty',
  category: 'Category',
  weekdays: 'Days',
  startDate: 'Start date',
  intervalDays: 'Every (days)',
  questDate: 'Quest date',
}

const FIELD_ORDER: readonly QuestFormField[] = [
  'title',
  'recurrence',
  'weekdays',
  'intervalDays',
  'startDate',
  'questDate',
  'difficulty',
  'category',
]

function typeOf(recurrence: QuestRecurrenceKind): QuestType {
  if (recurrence === 'daily') return 'daily'
  return recurrence === 'one_time' ? 'one_time' : 'scheduled'
}

/**
 * The Create / Edit quest form. It holds the raw field values and shows what
 * the application layer reports; it parses nothing, builds no recurrence and
 * owns no reward table (the reward line is the domain's, derived from the
 * selected difficulty, and read-only: there is no EXP input).
 */
export function QuestForm({ mode, initial, today, onSubmit, cancelTo }: QuestFormProps) {
  const [values, setValues] = useState<QuestFormValues>(initial)
  const [schedule, setSchedule] = useState<Schedule>(initial.recurrence === 'interval' ? 'interval' : 'weekdays')
  const [errors, setErrors] = useState<QuestFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [attention, setAttention] = useState(0)
  // Synchronous guard: a double tap on Save must not create two quests.
  const inFlight = useRef(false)
  const summaryRef = useRef<HTMLDivElement>(null)

  // Move focus to the error summary after a failed save so it is announced.
  useEffect(() => {
    if (attention > 0) summaryRef.current?.focus()
  }, [attention])

  const set = <K extends keyof QuestFormValues>(key: K, value: QuestFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const type = typeOf(values.recurrence)
  const selectType = (next: QuestType) => {
    set('recurrence', next === 'scheduled' ? schedule : next)
  }
  const selectSchedule = (next: Schedule) => {
    setSchedule(next)
    set('recurrence', next)
  }
  const toggleWeekday = (weekday: IsoWeekday) =>
    set(
      'weekdays',
      values.weekdays.includes(weekday)
        ? values.weekdays.filter((day) => day !== weekday)
        : [...values.weekdays, weekday].sort((a, b) => a - b),
    )

  const reward = isDifficulty(values.difficulty) ? expRewardForDifficulty(values.difficulty) : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    setFormError(null)
    try {
      const outcome = await onSubmit(values)
      if (outcome.status === 'invalid') {
        setErrors(outcome.errors)
        setAttention((count) => count + 1)
      } else if (outcome.status === 'error') {
        setErrors({})
        setFormError(outcome.message)
        setAttention((count) => count + 1)
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const errorList = FIELD_ORDER.filter((field) => errors[field] !== undefined)
  const text = (field: QuestFormField): string | undefined => {
    const code = errors[field]
    return code === undefined ? undefined : fieldErrorText(code)
  }
  const invalid = (field: QuestFormField): true | undefined => (errors[field] === undefined ? undefined : true)
  const describedBy = (field: QuestFormField, ...extra: string[]): string | undefined => {
    const ids = [...extra, ...(errors[field] === undefined ? [] : [`${field}-error`])]
    return ids.length === 0 ? undefined : ids.join(' ')
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5" aria-labelledby="quest-form-heading">
      <SectionLabel as="h1" id="quest-form-heading" className="text-sm tracking-[0.3em] text-accent">
        {mode === 'create' ? 'NEW QUEST' : 'EDIT QUEST'}
      </SectionLabel>

      {(errorList.length > 0 || formError !== null) && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="flex flex-col gap-1 rounded-[3px] border border-danger/50 bg-danger/10 p-3 text-sm focus:outline-none"
        >
          {formError !== null ? (
            <p>{formError}</p>
          ) : (
            <>
              <p className="font-medium">Some fields need attention:</p>
              <ul className="list-disc pl-5">
                {errorList.map((field) => (
                  <li key={field}>
                    {FIELD_LABEL[field]}: {text(field)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <TextField id="title" label="Title" error={text('title')}>
        <input
          id="title"
          name="title"
          type="text"
          value={values.title}
          onChange={(event) => set('title', event.target.value)}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          aria-invalid={invalid('title')}
          aria-describedby={describedBy('title')}
          className={INPUT}
        />
      </TextField>

      <FieldGroup legend="Quest type" error={text('recurrence')} errorId="recurrence-error">
        <div className="grid grid-cols-3 gap-2">
          <RadioChip name="quest-type" value="daily" checked={type === 'daily'} onChange={() => selectType('daily')}>
            Daily
          </RadioChip>
          <RadioChip name="quest-type" value="scheduled" checked={type === 'scheduled'} onChange={() => selectType('scheduled')}>
            Scheduled
          </RadioChip>
          <RadioChip name="quest-type" value="one_time" checked={type === 'one_time'} onChange={() => selectType('one_time')}>
            One-Time
          </RadioChip>
        </div>
      </FieldGroup>

      {type === 'daily' && (
        <StartDate
          values={values}
          today={today}
          set={set}
          error={text('startDate')}
          hint="Every day, starting on this date."
        />
      )}

      {type === 'scheduled' && (
        <>
          <FieldGroup legend="Repeats" errorId="schedule-error">
            <div className="grid grid-cols-2 gap-2">
              <RadioChip name="schedule" value="weekdays" checked={schedule === 'weekdays'} onChange={() => selectSchedule('weekdays')}>
                Selected weekdays
              </RadioChip>
              <RadioChip name="schedule" value="interval" checked={schedule === 'interval'} onChange={() => selectSchedule('interval')}>
                Interval
              </RadioChip>
            </div>
          </FieldGroup>

          {schedule === 'weekdays' ? (
            <>
              <FieldGroup legend="Days" error={text('weekdays')} errorId="weekdays-error">
                <div className="grid grid-cols-4 gap-2">
                  {ISO_WEEKDAYS.map((weekday) => (
                    <CheckboxChip
                      key={weekday}
                      name="weekdays"
                      value={String(weekday)}
                      checked={values.weekdays.includes(weekday)}
                      onChange={() => toggleWeekday(weekday)}
                      describedBy={describedBy('weekdays')}
                    >
                      <span aria-hidden="true">{weekdayShortName(weekday)}</span>
                      <span className="sr-only">{weekdayName(weekday)}</span>
                    </CheckboxChip>
                  ))}
                </div>
              </FieldGroup>
              <StartDate
                values={values}
                today={today}
                set={set}
                error={text('startDate')}
                hint="Only on the chosen days, starting on this date."
              />
            </>
          ) : (
            <>
              <TextField
                id="intervalDays"
                label="Every (days)"
                error={text('intervalDays')}
                hint="2 or more. For every day, choose Daily."
              >
                <input
                  id="intervalDays"
                  name="intervalDays"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={values.intervalDays}
                  onChange={(event) => set('intervalDays', event.target.value)}
                  autoComplete="off"
                  aria-invalid={invalid('intervalDays')}
                  aria-describedby={describedBy('intervalDays', 'intervalDays-hint')}
                  className={INPUT}
                />
              </TextField>
              <StartDate
                values={values}
                today={today}
                set={set}
                error={text('startDate')}
                label="Starting"
                hint="The start date counts as the first day."
              />
            </>
          )}
        </>
      )}

      {type === 'one_time' && (
        <TextField
          id="questDate"
          label="Quest date"
          error={text('questDate')}
          hint="Appears on this date only. It does not carry over if missed."
        >
          <input
            id="questDate"
            name="questDate"
            type="date"
            min={today}
            value={values.questDate}
            onChange={(event) => set('questDate', event.target.value)}
            aria-invalid={invalid('questDate')}
            aria-describedby={describedBy('questDate', 'questDate-hint')}
            className={INPUT}
          />
        </TextField>
      )}

      <FieldGroup legend="Difficulty" error={text('difficulty')} errorId="difficulty-error">
        <div className="grid grid-cols-2 gap-2">
          {DIFFICULTIES.map((difficulty) => (
            <RadioChip
              key={difficulty}
              name="difficulty"
              value={difficulty}
              checked={values.difficulty === difficulty}
              onChange={() => set('difficulty', difficulty)}
              describedBy={describedBy('difficulty')}
            >
              {difficultyLabel(difficulty)}
            </RadioChip>
          ))}
        </div>
        <p aria-live="polite" className="mt-1 flex items-baseline justify-between gap-3 rounded-[3px] border border-border px-3 py-2 text-sm">
          <span className="text-muted">Reward</span>
          <span className="font-semibold tabular-nums text-accent">{reward === null ? '—' : `+${reward} EXP`}</span>
        </p>
      </FieldGroup>

      <FieldGroup legend="Category" error={text('category')} errorId="category-error">
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((category) => (
            <RadioChip
              key={category}
              name="category"
              value={category}
              checked={values.category === category}
              onChange={() => set('category', category)}
              describedBy={describedBy('category')}
            >
              {categoryLabel(category)}
            </RadioChip>
          ))}
        </div>
      </FieldGroup>

      <div className="flex flex-col gap-3">
        <p role="status" className="text-sm text-muted empty:hidden">
          {submitting ? 'Saving…' : ''}
        </p>
        <button
          type="submit"
          aria-busy={submitting}
          disabled={submitting}
          className="inline-flex min-h-12 items-center justify-center rounded-[3px] border border-accent bg-accent/20 px-4 font-semibold text-foreground system-focus active:bg-accent/30 disabled:opacity-60"
        >
          {mode === 'create' ? 'Create Quest' : 'Save Changes'}
        </button>
        <Link
          to={cancelTo}
          className="inline-flex min-h-12 items-center justify-center rounded-[3px] border border-border px-4 font-medium system-focus active:bg-accent/15"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}

function StartDate({
  values,
  today,
  set,
  error,
  label = 'Start date',
  hint,
}: {
  values: QuestFormValues
  today: DateKey
  set: <K extends keyof QuestFormValues>(key: K, value: QuestFormValues[K]) => void
  error: string | undefined
  label?: string
  hint?: string
}) {
  return (
    <TextField id="startDate" label={label} error={error} hint={hint}>
      <input
        id="startDate"
        name="startDate"
        type="date"
        min={today}
        value={values.startDate}
        onChange={(event) => set('startDate', event.target.value)}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={[hint === undefined ? null : 'startDate-hint', error === undefined ? null : 'startDate-error']
          .filter((id) => id !== null)
          .join(' ') || undefined}
        className={INPUT}
      />
    </TextField>
  )
}

