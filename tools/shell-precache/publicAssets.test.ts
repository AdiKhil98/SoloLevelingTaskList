// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** The hand-written parts of the PWA (`public/`, `index.html`, `netlify.toml`). The built output is checked by `npm run verify:pwa`. */
const root = new URL('../../', import.meta.url)
const read = (file: string) => readFileSync(new URL(file, root), 'utf8')

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose: string
}
const manifest = JSON.parse(read('public/manifest.webmanifest')) as Record<string, unknown> & { icons: ManifestIcon[] }

describe('web app manifest', () => {
  it('names the app SYSTEM — Quest Tracker, short name SYSTEM', () => {
    expect(manifest.name).toBe('SYSTEM — Quest Tracker')
    expect(manifest.short_name).toBe('SYSTEM')
  })

  it('opens at the root, standalone, scoped to the whole site', () => {
    expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone' })
  })

  it('does not restrict orientation (portrait and landscape both stay available)', () => {
    expect('orientation' in manifest).toBe(false)
  })

  it('uses the SYSTEM background for the splash screen and the status bar', () => {
    expect(manifest.background_color).toBe('#07060d')
    expect(manifest.theme_color).toBe('#07060d')
  })

  it('has 192 and 512 icons for "any" and a SEPARATE 512 maskable icon, all existing PNG files', () => {
    const find = (sizes: string, purpose: string) => manifest.icons.find((icon) => icon.sizes === sizes && icon.purpose === purpose)
    expect(find('192x192', 'any')).toBeDefined()
    expect(find('512x512', 'any')).toBeDefined()
    expect(find('512x512', 'maskable')).toBeDefined()
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png')
      expect(existsSync(new URL(`public${icon.src}`, root)), icon.src).toBe(true)
    }
    expect(new Set(manifest.icons.map((icon) => icon.src)).size).toBe(manifest.icons.length)
  })
})

describe('index.html', () => {
  const html = read('index.html')

  it('links the manifest and the icons, and keeps the safe-area viewport and the theme colour', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('href="/icons/apple-touch-icon.png"')
    expect(html).toContain('viewport-fit=cover')
    expect(html).toContain('<meta name="theme-color" content="#07060d" />')
  })

  it('loads nothing from another origin', () => {
    expect(html).not.toMatch(/(?:src|href)="(?:https?:)?\/\//)
  })
})

describe('netlify.toml', () => {
  const toml = read('netlify.toml')
  const rules = toml.split('[[headers]]').slice(1).map((block) => ({
    for: /for\s*=\s*"([^"]+)"/.exec(block)?.[1],
    cache: /Cache-Control\s*=\s*"([^"]+)"/.exec(block)?.[1] ?? '',
  }))
  const cacheFor = (target: string) => rules.find((rule) => rule.for === target)?.cache ?? ''

  it('builds with the normal build and publishes dist', () => {
    expect(toml).toMatch(/command\s*=\s*"npm run build"/)
    expect(toml).toMatch(/publish\s*=\s*"dist"/)
  })

  it('rewrites unknown paths to the app shell with status 200 (and only that: no catch-all redirect that changes the URL)', () => {
    expect(toml).toMatch(/\[\[redirects\]\][^[]*from\s*=\s*"\/\*"[^[]*to\s*=\s*"\/index\.html"[^[]*status\s*=\s*200/)
    expect(toml.match(/\[\[redirects\]\]/g)).toHaveLength(1)
  })

  it.each(['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/icons/*'])('%s always revalidates', (target) => {
    expect(cacheFor(target)).toBe('public, max-age=0, must-revalidate')
  })

  it('hashed assets are cached for a year as immutable, and nothing else is', () => {
    expect(cacheFor('/assets/*')).toBe('public, max-age=31536000, immutable')
    expect(rules.filter((rule) => /immutable/.test(rule.cache)).map((rule) => rule.for)).toEqual(['/assets/*'])
  })
})
