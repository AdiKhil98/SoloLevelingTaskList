export type DomainErrorCode =
  | 'invalid_date_key'
  | 'invalid_date_parts'
  | 'date_out_of_range'
  | 'invalid_level'
  | 'invalid_total_exp'
  | 'invalid_exp_amount'
  | 'invalid_count'
  | 'invalid_recurrence'
  | 'numeric_boundary'

/**
 * Thrown only when a caller passes a value that violates a function's
 * contract (a programming or data-corruption error). Expected outcomes are
 * returned as `Result` values instead.
 *
 * `numeric_boundary` is a technical limit of IEEE-754 safe integers, never a
 * gameplay cap.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}
