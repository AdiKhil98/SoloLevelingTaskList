import type { DateKey, EpochMs, QuestTemplate } from '@/domain'
import {
  createTemplate,
  getTemplateBySeedKey,
  PersistenceError,
  type PersistenceDatabase,
} from '@/persistence'
import { DEFAULT_QUEST_SEEDS, type DefaultQuestSeed } from './defaultQuests'

export interface EnsureDefaultQuestsInput {
  /** The local date of this initialization; the seeds start on it (never earlier). */
  readonly startDate: DateKey
  readonly now: EpochMs
}

export interface EnsureDefaultQuestsResult {
  /** Seed keys created by this call (empty on every call after the first). */
  readonly created: readonly string[]
}

function buildSeedTemplate(seed: DefaultQuestSeed, input: EnsureDefaultQuestsInput): QuestTemplate {
  return {
    id: seed.templateId,
    title: seed.title,
    difficulty: seed.difficulty,
    category: seed.category,
    recurrence: { kind: 'daily' },
    role: seed.role,
    seedKey: seed.seedKey,
    activeFrom: input.startDate,
    activeUntil: null,
    status: 'active',
    revision: 1,
    createdAt: input.now,
    updatedAt: input.now,
  }
}

/**
 * Creates any approved default quest that does not exist yet, identified by
 * its `seedKey`. Idempotent: an existing template with that key (even one the
 * user later archived or edited) counts as present, so nothing is duplicated
 * and nothing existing is touched.
 */
export async function ensureDefaultQuests(
  database: PersistenceDatabase,
  input: EnsureDefaultQuestsInput,
): Promise<EnsureDefaultQuestsResult> {
  const created: string[] = []
  for (const seed of DEFAULT_QUEST_SEEDS) {
    if (await ensureSeed(database, seed, input)) created.push(seed.seedKey)
  }
  return { created }
}

/** Returns true when this call created the template. */
async function ensureSeed(
  database: PersistenceDatabase,
  seed: DefaultQuestSeed,
  input: EnsureDefaultQuestsInput,
): Promise<boolean> {
  if ((await getTemplateBySeedKey(database, seed.seedKey)) !== null) return false

  try {
    await createTemplate(database, buildSeedTemplate(seed, input))
    return true
  } catch (error) {
    // Another tab (or a StrictMode remount) may have created it between the
    // lookup and the write. A constraint violation is treated as "already
    // seeded" only if a fresh read by seedKey proves the seeded template now
    // exists; any other cause (for example an unrelated template occupying the
    // id) is reported as the original error.
    if (error instanceof PersistenceError && error.code === 'constraint_violation') {
      const stored = await getTemplateBySeedKey(database, seed.seedKey)
      if (stored !== null && stored.seedKey === seed.seedKey) return false
    }
    throw error
  }
}
