import { Minus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  blankGoalFormValues,
  type LinkableQuest,
  type WeeklyBoardFormErrors,
  type WeeklyBoardFormValues,
  type WeeklyGoalField,
  type WeeklyGoalFormValues,
} from '@/application'
import {
  WEEKLY_BOARD_TOTAL_POINTS,
  WEEKLY_LIMITS,
  WEEKLY_REWARD_TIER_SCORES,
  type DateKey,
  type WeeklyGoalTrackingMode,
  type WeeklyRewardTierScore,
} from '@/domain'
import { FieldError, FieldGroup, INPUT, RadioChip, TextField } from '../quests/FormControls'
import { boardErrorText, formatWeekRange, goalErrorText, rewardErrorText, tierLabel } from './weeklyMessages'

/** What the page tells the form after a save attempt. */
export type WeeklyFormOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'invalid'; readonly errors: WeeklyBoardFormErrors }
  | { readonly status: 'error'; readonly message: string }

interface WeeklyBoardFormProps {
  mode: 'create' | 'edit'
  startDate: DateKey
  endDate: DateKey
  initial: WeeklyBoardFormValues
  quests: readonly LinkableQuest[]
  onSubmit: (values: WeeklyBoardFormValues) => Promise<WeeklyFormOutcome>
  cancelTo: string
}

const STEP =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15 disabled:opacity-40'

const GHOST_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent/15'

const GOAL_FIELD_LABEL: Record<WeeklyGoalField, string> = {
  title: 'Title',
  points: 'Points',
  target: 'Target',
  unit: 'Unit',
  notes: 'Notes',
  link: 'Quest',
}
const GOAL_FIELD_ORDER: readonly WeeklyGoalField[] = ['title', 'target', 'points', 'unit', 'link', 'notes']

/**
 * The Weekly Goal Crusher form: the Weekly Focus, the goals (title, target,
 * unit, points, how progress is measured, optional notes) and the five reward
 * texts. It holds the raw values and shows what the application layer reports;
 * it parses nothing and applies no rule. The "points so far" line is a
 * convenience readout: whether the board may be saved (exactly 10 points, among
 * the other rules) is decided by the domain when the form is submitted.
 */
export function WeeklyBoardForm({ mode, startDate, endDate, initial, quests, onSubmit, cancelTo }: WeeklyBoardFormProps) {
  const [values, setValues] = useState<WeeklyBoardFormValues>(initial)
  const [errors, setErrors] = useState<WeeklyBoardFormErrors | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [attention, setAttention] = useState(0)
  // Synchronous guard: a double tap on Save must not save twice.
  const inFlight = useRef(false)
  const summaryRef = useRef<HTMLDivElement>(null)
  const nextRow = useRef(initial.goals.length + 1)

  // Move focus to the error summary after a failed save so it is announced.
  useEffect(() => {
    if (attention > 0) summaryRef.current?.focus()
  }, [attention])

  const setGoal = (key: string, patch: Partial<WeeklyGoalFormValues>) =>
    setValues((current) => ({
      ...current,
      goals: current.goals.map((goal) => (goal.key === key ? { ...goal, ...patch } : goal)),
    }))
  /** Steps a goal's points up or down within 1–10, from the latest state (never from a stale render). */
  const adjustPoints = (key: string, delta: number) =>
    setValues((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.key === key ? { ...goal, points: Math.min(WEEKLY_BOARD_TOTAL_POINTS, Math.max(1, goal.points + delta)) } : goal,
      ),
    }))
  const addGoal = () => {
    const key = `new-${nextRow.current}`
    nextRow.current += 1
    setValues((current) => ({ ...current, goals: [...current.goals, blankGoalFormValues(key)] }))
  }
  const removeGoal = (key: string) => setValues((current) => ({ ...current, goals: current.goals.filter((goal) => goal.key !== key) }))
  const setReward = (minScore: WeeklyRewardTierScore, text: string) =>
    setValues((current) => ({ ...current, rewards: { ...current.rewards, [minScore]: text } }))

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
        setErrors(null)
        setFormError(outcome.message)
        setAttention((count) => count + 1)
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const pointsSoFar = values.goals.reduce((sum, goal) => sum + goal.points, 0)
  const goalError = (key: string, field: WeeklyGoalField): string | undefined => {
    const code = errors?.goals[key]?.[field]
    return code === undefined ? undefined : goalErrorText(code)
  }

  const summary: string[] = []
  if (errors !== null) {
    for (const code of errors.board) summary.push(boardErrorText(code, errors.total))
    values.goals.forEach((goal, index) => {
      for (const field of GOAL_FIELD_ORDER) {
        const text = goalError(goal.key, field)
        if (text !== undefined) summary.push(`Goal ${index + 1} · ${GOAL_FIELD_LABEL[field]}: ${text}`)
      }
    })
    for (const minScore of WEEKLY_REWARD_TIER_SCORES) {
      if (errors.rewards[minScore] !== undefined) summary.push(`Reward ${tierLabel(minScore)}: ${rewardErrorText()}`)
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5" aria-labelledby="weekly-form-heading">
      <div className="flex flex-col gap-1">
        <h1 id="weekly-form-heading" className="text-sm font-semibold tracking-[0.4em] text-accent">
          {mode === 'create' ? 'SET WEEKLY GOALS' : 'EDIT WEEKLY GOALS'}
        </h1>
        <p className="text-sm text-muted">{formatWeekRange(startDate, endDate)}</p>
      </div>

      {(summary.length > 0 || formError !== null) && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="flex flex-col gap-1 rounded-xl border border-red-400/50 bg-red-500/10 p-3 text-sm focus:outline-none"
        >
          {formError !== null ? (
            <p>{formError}</p>
          ) : (
            <>
              <p className="font-semibold">Nothing was saved. Please fix:</p>
              <ul className="list-disc pl-5">
                {summary.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <TextField id="weekly-focus" label="Weekly Focus (optional)" error={errors?.board.includes('focus_too_long') ? boardErrorText('focus_too_long', undefined) : undefined}>
        <textarea
          id="weekly-focus"
          rows={2}
          value={values.focus}
          onChange={(event) => setValues((current) => ({ ...current, focus: event.target.value }))}
          placeholder="One sentence about what this week is for"
          aria-invalid={errors?.board.includes('focus_too_long') ? true : undefined}
          className={`${INPUT} py-2.5`}
        />
      </TextField>

      <section aria-labelledby="goals-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="goals-heading" className="text-xs tracking-[0.3em] text-muted">
            GOALS
          </h2>
          <p role="status" className="text-sm font-semibold tabular-nums">
            {pointsSoFar} / {WEEKLY_BOARD_TOTAL_POINTS} points
          </p>
        </div>
        {errors?.board.includes('no_goals') && <FieldError id="goals-error" message={boardErrorText('no_goals', undefined)} />}
        {errors?.board.includes('points_total_invalid') && (
          <FieldError id="points-error" message={boardErrorText('points_total_invalid', errors.total)} />
        )}

        <ul aria-label="Goals" className="flex flex-col gap-3">
          {values.goals.map((goal, index) => {
            const base = `goal-${goal.key}`
            const linkedMissing = goal.trackingMode === 'linked_quest'
            const visibleQuests = quests.filter((quest) => !quest.archived || quest.templateId === goal.templateId)
            return (
              <li key={goal.key}>
                <fieldset className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-3.5">
                  <legend className="px-1 text-xs tracking-[0.2em] text-muted uppercase">Goal {index + 1}</legend>

                  <TextField id={`${base}-title`} label="Title" error={goalError(goal.key, 'title')}>
                    <input
                      id={`${base}-title`}
                      type="text"
                      value={goal.title}
                      maxLength={WEEKLY_LIMITS.goalTitleMaxLength + 20}
                      onChange={(event) => setGoal(goal.key, { title: event.target.value })}
                      aria-invalid={goalError(goal.key, 'title') === undefined ? undefined : true}
                      aria-describedby={goalError(goal.key, 'title') === undefined ? undefined : `${base}-title-error`}
                      placeholder="e.g. Complete backtests"
                      className={INPUT}
                    />
                  </TextField>

                  <div className="grid grid-cols-2 gap-3">
                    <TextField id={`${base}-target`} label="Target" error={goalError(goal.key, 'target')}>
                      <input
                        id={`${base}-target`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={goal.target}
                        onChange={(event) => setGoal(goal.key, { target: event.target.value })}
                        aria-invalid={goalError(goal.key, 'target') === undefined ? undefined : true}
                        aria-describedby={goalError(goal.key, 'target') === undefined ? undefined : `${base}-target-error`}
                        placeholder="20"
                        className={INPUT}
                      />
                    </TextField>
                    <TextField id={`${base}-unit`} label="Unit (optional)" error={goalError(goal.key, 'unit')}>
                      <input
                        id={`${base}-unit`}
                        type="text"
                        value={goal.unit}
                        onChange={(event) => setGoal(goal.key, { unit: event.target.value })}
                        aria-invalid={goalError(goal.key, 'unit') === undefined ? undefined : true}
                        aria-describedby={goalError(goal.key, 'unit') === undefined ? undefined : `${base}-unit-error`}
                        placeholder="backtests"
                        className={INPUT}
                      />
                    </TextField>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span id={`${base}-points-label`} className="text-xs tracking-[0.2em] text-muted uppercase">
                      Points
                    </span>
                    <div role="group" aria-labelledby={`${base}-points-label`} className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Decrease points for goal ${index + 1}`}
                        disabled={goal.points <= 1}
                        onClick={() => adjustPoints(goal.key, -1)}
                        className={STEP}
                      >
                        <Minus aria-hidden="true" className="size-5" />
                      </button>
                      <output aria-label={`Points for goal ${index + 1}`} className="min-w-10 text-center text-lg font-semibold tabular-nums">
                        {goal.points}
                      </output>
                      <button
                        type="button"
                        aria-label={`Increase points for goal ${index + 1}`}
                        disabled={goal.points >= WEEKLY_BOARD_TOTAL_POINTS}
                        onClick={() => adjustPoints(goal.key, 1)}
                        className={STEP}
                      >
                        <Plus aria-hidden="true" className="size-5" />
                      </button>
                    </div>
                    <FieldError id={`${base}-points-error`} message={goalError(goal.key, 'points')} />
                  </div>

                  <FieldGroup legend="Progress is" errorId={`${base}-mode-error`}>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ['manual', 'I update it'],
                          ['linked_quest', 'Counted from a quest'],
                        ] as const satisfies readonly (readonly [WeeklyGoalTrackingMode, string])[]
                      ).map(([mode_, label]) => (
                        <RadioChip
                          key={mode_}
                          name={`${base}-tracking`}
                          value={mode_}
                          checked={goal.trackingMode === mode_}
                          onChange={() => setGoal(goal.key, { trackingMode: mode_ })}
                        >
                          {label}
                        </RadioChip>
                      ))}
                    </div>
                  </FieldGroup>

                  {linkedMissing && (
                    <TextField
                      id={`${base}-quest`}
                      label="Quest to count"
                      error={goalError(goal.key, 'link')}
                      hint="Each completion of this quest during the week counts once. The quest’s own EXP is not changed."
                    >
                      <select
                        id={`${base}-quest`}
                        value={goal.templateId}
                        onChange={(event) => setGoal(goal.key, { templateId: event.target.value })}
                        aria-invalid={goalError(goal.key, 'link') === undefined ? undefined : true}
                        aria-describedby={[`${base}-quest-hint`, goalError(goal.key, 'link') === undefined ? null : `${base}-quest-error`]
                          .filter((id): id is string => id !== null)
                          .join(' ')}
                        className={INPUT}
                      >
                        <option value="">Choose a quest…</option>
                        {visibleQuests.map((quest) => (
                          <option key={quest.templateId} value={quest.templateId}>
                            {quest.title}
                            {quest.archived ? ' (archived)' : ''}
                          </option>
                        ))}
                        {goal.templateId !== '' && !quests.some((quest) => quest.templateId === goal.templateId) && (
                          <option value={goal.templateId}>Unknown quest</option>
                        )}
                      </select>
                    </TextField>
                  )}

                  <TextField id={`${base}-notes`} label="Notes (optional)" error={goalError(goal.key, 'notes')}>
                    <textarea
                      id={`${base}-notes`}
                      rows={2}
                      value={goal.notes}
                      onChange={(event) => setGoal(goal.key, { notes: event.target.value })}
                      aria-invalid={goalError(goal.key, 'notes') === undefined ? undefined : true}
                      aria-describedby={goalError(goal.key, 'notes') === undefined ? undefined : `${base}-notes-error`}
                      className={`${INPUT} py-2.5`}
                    />
                  </TextField>

                  <button type="button" onClick={() => removeGoal(goal.key)} className={`${GHOST_BUTTON} w-fit`}>
                    <Trash2 aria-hidden="true" className="size-4" />
                    Remove goal {index + 1}
                  </button>
                </fieldset>
              </li>
            )
          })}
        </ul>

        <button type="button" onClick={addGoal} className={`${GHOST_BUTTON} min-h-12 border-accent/60 text-accent`}>
          <Plus aria-hidden="true" className="size-5" />
          Add goal
        </button>
      </section>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 text-xs tracking-[0.3em] text-muted">REAL-LIFE REWARDS</legend>
        <p className="text-sm text-muted">
          Write what you will give yourself. Only the highest tier you reach applies. Leave a tier empty for no reward.
        </p>
        {WEEKLY_REWARD_TIER_SCORES.map((minScore) => (
          <TextField
            key={minScore}
            id={`reward-${minScore}`}
            label={`${tierLabel(minScore)} points`}
            error={errors?.rewards[minScore] === undefined ? undefined : rewardErrorText()}
          >
            <input
              id={`reward-${minScore}`}
              type="text"
              value={values.rewards[minScore]}
              onChange={(event) => setReward(minScore, event.target.value)}
              aria-invalid={errors?.rewards[minScore] === undefined ? undefined : true}
              aria-describedby={errors?.rewards[minScore] === undefined ? undefined : `reward-${minScore}-error`}
              className={INPUT}
            />
          </TextField>
        ))}
      </fieldset>

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent-strong px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-90 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Save Goals'}
        </button>
        <Link to={cancelTo} className={`${GHOST_BUTTON} min-h-12`}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
