/**
 * How the COMPLETE welcome line shares its typing time between the static label
 * ("WELCOME,") and the player's name. The label is typed first and the name starts
 * the moment the label is done, so the two read as one line that takes the usual
 * `typeMs` in total. Pure, so the order and the total are testable without a clock.
 */
export interface WelcomeTyping {
  /** How long the label takes to type. */
  readonly labelMs: number
  /** Delay before the name starts: after the line's own delay and the whole label. */
  readonly nameDelayMs: number
  /** How long the name takes to type. `labelMs + nameMs` is always `typeMs`. */
  readonly nameMs: number
}

export function welcomeTyping({ label, name, typeMs, delayMs }: { label: string; name: string; typeMs: number; delayMs: number }): WelcomeTyping {
  const labelChars = Array.from(label).length
  const nameChars = Array.from(name).length
  const total = Math.max(0, typeMs)
  const labelMs = labelChars + nameChars === 0 ? 0 : Math.round((total * labelChars) / (labelChars + nameChars))
  return { labelMs, nameDelayMs: delayMs + labelMs, nameMs: total - labelMs }
}
