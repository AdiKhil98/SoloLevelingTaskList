import { WEEKLY_GOAL_ID_PREFIX } from '@/domain'

/**
 * Where the application gets fresh random identifiers. Production supplies the
 * Web Crypto-backed source (`systemIds` in `@/platform`); tests supply a
 * deterministic one. Like `Clock`, this interface is the only way randomness
 * enters the application layer, so the domain and persistence stay free of it.
 */
export interface IdSource {
  /** A fresh, unique UUID v4 string (lowercase, hyphenated). */
  uuid(): string
}

/** Prefix of every user-created template id. Seed ids use `tpl_seed_…` and can never collide: a UUID is hex digits and hyphens only. */
export const USER_TEMPLATE_ID_PREFIX = 'tpl_'

/** A new id for a user-created quest template: `tpl_<uuid>`. */
export function newTemplateId(ids: IdSource): string {
  return `${USER_TEMPLATE_ID_PREFIX}${ids.uuid()}`
}

/** A new id for a weekly goal: `wg_<uuid>` (a UUID is hex digits and hyphens only, so it can never collide with another id family). */
export function newWeeklyGoalId(ids: IdSource): string {
  return `${WEEKLY_GOAL_ID_PREFIX}${ids.uuid()}`
}
