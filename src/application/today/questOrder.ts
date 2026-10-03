import type { EpochMs } from '@/domain'
import { DEFAULT_QUEST_SEEDS } from '../seeds/defaultQuests'

/**
 * Display order of quests on Home (Phase 04 rule, deliberately kept out of the
 * domain records because the data model has no sort field yet):
 *
 *   1. the approved default quests, in the order of `DEFAULT_QUEST_SEEDS`
 *      (Fajr, Dhuhr, Asr, Maghrib, Isha, Sleep before 00:00);
 *   2. every other quest, oldest template first, then by template id.
 *
 * Phase 05 can introduce an explicit user-controlled order by replacing this
 * one comparator; the Home screen only consumes already-ordered quests.
 */
export interface QuestOrderKey {
  readonly seedKey: string | null
  readonly templateCreatedAt: EpochMs
  readonly templateId: string
}

const SEED_POSITION: ReadonlyMap<string, number> = new Map(
  DEFAULT_QUEST_SEEDS.map((seed, index) => [seed.seedKey, index]),
)

function seedPosition(key: QuestOrderKey): number | undefined {
  return key.seedKey === null ? undefined : SEED_POSITION.get(key.seedKey)
}

export function compareQuestOrder(a: QuestOrderKey, b: QuestOrderKey): number {
  const positionA = seedPosition(a)
  const positionB = seedPosition(b)

  if (positionA !== undefined && positionB !== undefined && positionA !== positionB) {
    return positionA - positionB
  }
  if (positionA !== undefined && positionB === undefined) return -1
  if (positionA === undefined && positionB !== undefined) return 1

  if (a.templateCreatedAt !== b.templateCreatedAt) return a.templateCreatedAt - b.templateCreatedAt
  if (a.templateId < b.templateId) return -1
  if (a.templateId > b.templateId) return 1
  return 0
}
