// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Pull-to-refresh must not reload the installed app (Phase 12). Phase 13 verified on real Android Chrome 133 that
 * `overscroll-behavior-y: none` on `html` ALONE does not stop it: a downward swipe at the top reloaded the page, and
 * the same swipe did not once `body` had the rule too. jsdom cannot show this, so the stylesheet itself is guarded.
 */
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')

/** The declarations of the first top-level `selector { ... }` rule in the base layer. */
function ruleBody(selector: string): string {
  const match = new RegExp(`(?:^|\\n)\\s{2}${selector}\\s*\\{([^}]*)\\}`).exec(css)
  if (match === null) throw new Error(`no "${selector}" rule found in globals.css`)
  return match[1] ?? ''
}

describe('pull-to-refresh suppression', () => {
  it.each(['html', 'body'])('%s sets overscroll-behavior-y: none (Chrome Android needs both)', (selector) => {
    expect(ruleBody(selector)).toMatch(/overscroll-behavior-y:\s*none\s*;/)
  })
})
