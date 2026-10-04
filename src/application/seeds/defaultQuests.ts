import type { Category, Difficulty, QuestRole } from '@/domain'

/**
 * One approved default quest. EXP is deliberately absent: it derives from
 * `difficulty` (MASTER_SPEC §5.3), so the seed cannot disagree with the economy.
 */
export interface DefaultQuestSeed {
  /** Stable semantic identity (unique index in storage). Never change a shipped key. */
  readonly seedKey: string
  /** Deterministic template id, so racing tabs and backups agree on identity. */
  readonly templateId: string
  readonly title: string
  readonly difficulty: Difficulty
  readonly category: Category
  readonly role: QuestRole
}

const prayer = (key: string, title: string): DefaultQuestSeed => ({
  seedKey: `prayer.${key}`,
  templateId: `tpl_seed_prayer_${key}`,
  title,
  difficulty: 'E',
  category: 'discipline',
  role: 'standard',
})

/**
 * The approved seed set (MASTER_SPEC §5.5, OD-15): five prayers and Sleep, all
 * Daily. The array order is only the INITIAL order a fresh install gives them;
 * from Phase 09 the player's manual order (`sortOrder`) decides how they are
 * shown, and they can be moved anywhere. Nothing else is seeded; further quests
 * are user-created in Phase 05.
 */
export const DEFAULT_QUEST_SEEDS: readonly DefaultQuestSeed[] = [
  prayer('fajr', 'Fajr'),
  prayer('dhuhr', 'Dhuhr'),
  prayer('asr', 'Asr'),
  prayer('maghrib', 'Maghrib'),
  prayer('isha', 'Isha'),
  {
    seedKey: 'sleep',
    templateId: 'tpl_seed_sleep',
    title: 'Sleep before 00:00',
    difficulty: 'D',
    category: 'discipline',
    role: 'sleep',
  },
]
