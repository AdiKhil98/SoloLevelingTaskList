import type { ChangeEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Small form building blocks for the quest form: large touch-friendly choice
 * chips built on REAL radio inputs and checkboxes (so selection state, arrow-key
 * navigation and keyboard focus are the browser's own), and field wrappers that
 * connect labels and error text.
 */

const CHIP =
  'flex min-h-12 cursor-pointer items-center justify-center rounded-[3px] border border-border bg-surface px-3 py-2 text-center text-sm font-medium transition-colors has-checked:border-accent has-checked:bg-accent/15 has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent'

interface ChipProps {
  name: string
  value: string
  checked: boolean
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  children: ReactNode
  describedBy?: string
  className?: string
}

/** One option of a radio group, drawn as a chip. */
export function RadioChip({ name, value, checked, onChange, children, describedBy, className }: ChipProps) {
  return (
    <label className={cn(CHIP, className)}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        aria-describedby={describedBy}
        className="sr-only"
      />
      <span>{children}</span>
    </label>
  )
}

/** One option of a multi-select group, drawn as a chip. */
export function CheckboxChip({ name, value, checked, onChange, children, describedBy, className }: ChipProps) {
  return (
    <label className={cn(CHIP, className)}>
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        aria-describedby={describedBy}
        className="sr-only"
      />
      <span>{children}</span>
    </label>
  )
}

/** A labelled group of related controls. The error, if any, is tied to the group. */
export function FieldGroup({
  legend,
  error,
  errorId,
  hint,
  children,
}: {
  legend: string
  error?: string
  errorId: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2"  aria-describedby={error === undefined ? undefined : errorId}>
      <legend className="mb-1 font-display text-xs font-semibold tracking-[0.14em] text-muted uppercase">{legend}</legend>
      {children}
      {hint}
      <FieldError id={errorId} message={error} />
    </fieldset>
  )
}

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (message === undefined) return null
  return (
    <p id={id} className="text-sm text-danger">
      {message}
    </p>
  )
}

export const INPUT =
  'min-h-12 w-full rounded-[3px] border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted system-focus aria-[invalid=true]:border-danger/70'

/** A labelled single input (text, date, numeric). */
export function TextField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  /** The input element; it receives `id`, `aria-invalid` and `aria-describedby` from the caller. */
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-display text-xs font-semibold tracking-[0.14em] text-muted uppercase">
        {label}
      </label>
      {children}
      {hint !== undefined && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}
