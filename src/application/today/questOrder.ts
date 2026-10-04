/**
 * Display order of quests (Phase 09: the player's manual order).
 *
 * The rule lives in the domain (`quests/order.ts`): templates are ordered by
 * their stored `sortOrder`, with creation time and id as deterministic
 * tie-breakers for a damaged dataset. This module only re-exports it under the
 * names the application layer has always used; Home, the Quests list and the
 * Weekly quest picker all share this one comparator.
 *
 * It replaces the Phase 04–08 rule ("the six defaults first, then by creation
 * time"), which now exists only, frozen, inside the schema v4 migration that
 * turns the old order into stored values.
 */
export { compareQuestOrder, questOrderKeyOf, sortTemplatesByOrder, type QuestOrderKey } from '@/domain'
