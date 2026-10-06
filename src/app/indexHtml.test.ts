// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The page shell (`index.html`) carries two promises that only a real browser can break, so the file is guarded here.
 *
 * Phase 13, real Android Chrome: its built-in Translate rewrote the page ("Dhuhr" became "Noon" and "Sleep before
 * 00:00" became "Source ...") and rewrites text nodes underneath React. Quest names are written by the player, so
 * machine translation is never wanted.
 */
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

describe('index.html', () => {
  it('opts out of machine translation, both ways Chrome honours', () => {
    expect(html).toMatch(/<html\b[^>]*\btranslate="no"/)
    expect(html).toMatch(/<meta\s+name="google"\s+content="notranslate"\s*\/?>/)
  })

  it('keeps the viewport fit and theme colour the installed app relies on', () => {
    expect(html).toContain('viewport-fit=cover')
    expect(html).toContain('<meta name="theme-color" content="#07060d" />')
  })
})
