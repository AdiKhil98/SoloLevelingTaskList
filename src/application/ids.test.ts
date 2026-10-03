// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { newTemplateId, USER_TEMPLATE_ID_PREFIX } from './ids'
import { DEFAULT_QUEST_SEEDS } from './seeds/defaultQuests'
import { createSequentialIds } from './test-utils/helpers'

describe('newTemplateId', () => {
  it('is `tpl_` followed by the id source’s UUID', () => {
    const ids = { uuid: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
    expect(newTemplateId(ids)).toBe('tpl_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(USER_TEMPLATE_ID_PREFIX).toBe('tpl_')
  })

  it('draws a fresh id each time', () => {
    const ids = createSequentialIds()
    expect(newTemplateId(ids)).not.toBe(newTemplateId(ids))
  })

  it('can never equal a deterministic seed template id (separate namespaces)', () => {
    // A UUID is hex digits and hyphens only; every seed id continues with "seed_".
    for (const seed of DEFAULT_QUEST_SEEDS) {
      expect(seed.templateId.startsWith('tpl_seed_')).toBe(true)
      expect(seed.templateId).not.toMatch(/^tpl_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    }
    expect('tpl_seed_'.slice('tpl_'.length)).not.toMatch(/^[0-9a-f-]+$/)
  })
})
