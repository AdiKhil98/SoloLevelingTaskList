/**
 * Shared class strings for the SYSTEM look. They only reference design tokens
 * (see `src/styles/globals.css`); nothing here decides behaviour.
 */

const CONTROL =
  'system-focus inline-flex min-h-11 items-center justify-center rounded-[3px] border px-4 text-sm font-medium disabled:opacity-60'

/** A 44 px-high bordered button or link. */
export const BUTTON = `${CONTROL} border-border bg-surface-raised text-foreground active:bg-accent/15`

/** The one emphasised action on a screen. */
export const BUTTON_PRIMARY = `${CONTROL} border-accent bg-accent/10 font-semibold text-accent active:bg-accent/20`

/** A destructive confirmation. */
export const BUTTON_DANGER = `${CONTROL} border-danger/70 bg-danger/15 font-semibold text-foreground active:bg-danger/25`

/** A quiet text-only action (for example Dismiss). */
export const BUTTON_QUIET = 'system-focus inline-flex min-h-11 items-center rounded-[3px] px-3 text-sm font-medium text-accent active:bg-accent/15'

const NOTICE = 'rounded-[3px] border p-3 text-sm'

/** An error the player should read (use with role="alert"). */
export const NOTICE_DANGER = `${NOTICE} border-danger/50 bg-danger/10`

/** A caution that is not a failure. */
export const NOTICE_WARNING = `${NOTICE} border-warning/50 bg-warning/10`

/** A dashed placeholder where a list would be. */
export const EMPTY_STATE = 'rounded-[3px] border border-dashed border-border p-4 text-center text-muted'
