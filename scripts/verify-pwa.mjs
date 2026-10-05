// Phase 12: checks the production build (dist/) for everything the offline shell depends on.
//
//   npm run verify:pwa          builds, then checks dist/
//   node scripts/verify-pwa.mjs [--dist <dir>]     checks an existing build only
//
// It deliberately re-implements the build-id derivation instead of importing the build plugin, so a bug in the
// plugin cannot hide itself. Plain Node, no dependencies. Exit code 1 if any check fails.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const argument = (name) => {
  const at = process.argv.indexOf(name)
  return at === -1 ? undefined : process.argv[at + 1]
}
const root = process.cwd()
const dist = path.resolve(root, argument('--dist') ?? 'dist')

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === '' ? '' : `\n        ${detail}`}`)
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(directory, item.name)
    return item.isDirectory() ? walk(full) : [full]
  })
}
const urlOf = (file) => `/${path.relative(dist, file).split(path.sep).join('/')}`
const sha256 = (content) => createHash('sha256').update(content).digest('hex')

if (!existsSync(path.join(dist, 'index.html'))) {
  console.log(`FAIL  ${dist} has no index.html (run the build first)`)
  process.exit(1)
}

const files = walk(dist).map((file) => ({ url: urlOf(file), file, content: readFileSync(file) }))
const byUrl = new Map(files.map((entry) => [entry.url, entry]))

// ---------------------------------------------------------------- manifest
console.log('\nWeb app manifest')
const manifestFile = byUrl.get('/manifest.webmanifest')
check('manifest.webmanifest exists in dist', manifestFile !== undefined)
let manifest = {}
try {
  manifest = JSON.parse(manifestFile?.content.toString('utf8') ?? '{}')
} catch (error) {
  check('manifest.webmanifest is valid JSON', false, String(error))
}
check('name is "SYSTEM — Quest Tracker"', manifest.name === 'SYSTEM — Quest Tracker', String(manifest.name))
check('short_name is "SYSTEM"', manifest.short_name === 'SYSTEM', String(manifest.short_name))
check('start_url and scope are "/"', manifest.start_url === '/' && manifest.scope === '/')
check('display is standalone', manifest.display === 'standalone', String(manifest.display))
check('no orientation restriction (rotation stays free)', !('orientation' in manifest))
check('theme and background colour are the SYSTEM background', manifest.theme_color === '#07060d' && manifest.background_color === '#07060d')

const icons = Array.isArray(manifest.icons) ? manifest.icons : []
let iconsOk = icons.length > 0
for (const icon of icons) {
  const entry = byUrl.get(icon.src)
  const png = entry?.content
  const isPng = png !== undefined && png.length > 24 && png.subarray(1, 4).toString('latin1') === 'PNG'
  const [declaredW, declaredH] = String(icon.sizes).split('x').map(Number)
  const realW = isPng ? png.readUInt32BE(16) : -1
  const realH = isPng ? png.readUInt32BE(20) : -1
  const ok = isPng && realW === declaredW && realH === declaredH && icon.type === 'image/png'
  if (!ok) check(`icon ${icon.src} is a real PNG of the declared size`, false, `declared ${icon.sizes}, found ${realW}x${realH}`)
  iconsOk &&= ok
}
check('every declared icon exists, is a PNG and has the declared dimensions', iconsOk)
const has = (size, purpose) => icons.some((icon) => icon.sizes === size && icon.purpose === purpose)
check('has 192 and 512 icons for purpose "any"', has('192x192', 'any') && has('512x512', 'any'))
check('has a separate 512 maskable icon (not combined "any maskable")', has('512x512', 'maskable'))

// ---------------------------------------------------------------- html
console.log('\nindex.html')
const html = byUrl.get('/index.html')?.content.toString('utf8') ?? ''
check('links the manifest', /<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/.test(html))
check('has the theme-color meta', /<meta[^>]+name="theme-color"[^>]+content="#07060d"/.test(html))
check('viewport uses viewport-fit=cover', /viewport-fit=cover/.test(html))
const touch = /<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]+)"/.exec(html)
check('links an apple-touch-icon that exists', touch !== null && byUrl.has(touch[1]))
const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((match) => match[0])
check('references no external script, style or link', external.length === 0, external.join(', '))

// ---------------------------------------------------------------- worker + precache list
console.log('\nService worker and precache list')
const worker = byUrl.get('/sw.js')
check('sw.js exists in dist', worker !== undefined)
const text = worker?.content.toString('utf8') ?? ''
const newline = text.indexOf('\n')
const prelude = /^self\.__SHELL_MANIFEST__=(\{.*\});$/.exec(text.slice(0, Math.max(newline, 0)))
check('sw.js starts with the injected shell manifest', prelude !== null)
const precache = prelude === null ? { buildId: '', entries: [] } : JSON.parse(prelude[1])
const code = text.slice(newline + 1)

check('worker is a classic script (no import/export, no importScripts)', !/^\s*(import|export)\s/m.test(code) && !code.includes('importScripts'))
check(
  'worker never names IndexedDB or storage',
  !/\b(indexedDB|IDBFactory|IDBDatabase|openDatabase|localStorage|sessionStorage)\b/.test(code),
)

const expected = files.filter((entry) => entry.url !== '/sw.js' && !entry.url.endsWith('.map'))
const listed = new Set(precache.entries.map((entry) => entry.url))
const missing = expected.filter((entry) => !listed.has(entry.url)).map((entry) => entry.url)
const extra = [...listed].filter((url) => !byUrl.has(url) || url === '/sw.js')
check('precache list contains every shipped file', missing.length === 0, `missing: ${missing.join(', ')}`)
check('precache list contains only files that exist (never sw.js)', extra.length === 0, `extra: ${extra.join(', ')}`)
check('precache list has no duplicates', listed.size === precache.entries.length)
check('precache list includes index.html, manifest and the icons', ['/index.html', '/manifest.webmanifest', ...icons.map((icon) => icon.src)].every((url) => listed.has(url)))

const recomputed = (() => {
  const hash = createHash('sha256')
  hash.update(Buffer.from(code, 'utf8'))
  hash.update('\n')
  for (const entry of [...expected].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))) hash.update(`${entry.url} ${sha256(entry.content)}\n`)
  return hash.digest('hex').slice(0, 16)
})()
check('build id matches the worker code and every file (recomputed independently)', precache.buildId === recomputed, `injected ${precache.buildId}, recomputed ${recomputed}`)

// ---------------------------------------------------------------- what must never ship
console.log('\nOutput that must never ship')
const forbiddenPaths = files.filter((entry) => /(^|\/)(_reference|dev)(\/|$)|effectslab/i.test(entry.url)).map((entry) => entry.url)
check('no _reference, /dev or effects-lab file in dist or the precache list', forbiddenPaths.length === 0, forbiddenPaths.join(', '))
const textFiles = files.filter((entry) => /\.(js|css|html|webmanifest|svg)$/.test(entry.url))
const leaks = textFiles.filter((entry) => /EffectsLab|dev\/effects|_reference|solo-leveling-effects-pack/.test(entry.content.toString('utf8'))).map((entry) => entry.url)
check('no dev-lab or _reference text inside any shipped file', leaks.length === 0, leaks.join(', '))
check('no source maps', !files.some((entry) => entry.url.endsWith('.map')))

const ALLOWED_HOSTS = /^(www\.w3\.org|react\.dev|reactrouter\.com|tailwindcss\.com|localhost)$/
const remote = new Set()
for (const entry of textFiles) {
  for (const match of entry.content.toString('utf8').matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
    if (!ALLOWED_HOSTS.test(match[1])) remote.add(`${match[1]} (${entry.url})`)
  }
}
check('no remote runtime dependency (only XML namespaces and error-doc links appear)', remote.size === 0, [...remote].join(', '))

// ---------------------------------------------------------------- budget
console.log('\nSize')
const shellBytes = expected.reduce((sum, entry) => sum + entry.content.length, 0)
const shellGzip = expected.reduce((sum, entry) => sum + gzipSync(entry.content).length, 0)
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`
console.log(`      precache: ${expected.length} files, ${kb(shellBytes)} raw, about ${kb(shellGzip)} gzip; sw.js ${kb(worker?.content.length ?? 0)}`)
check('precache stays under 1 MiB raw', shellBytes < 1024 * 1024, kb(shellBytes))
check('sw.js stays under 16 KiB', (worker?.content.length ?? Infinity) < 16 * 1024)

// ---------------------------------------------------------------- netlify
console.log('\nNetlify configuration')
const toml = existsSync(path.join(root, 'netlify.toml')) ? readFileSync(path.join(root, 'netlify.toml'), 'utf8') : ''
check('netlify.toml publishes dist', /^\s*publish\s*=\s*"dist"/m.test(toml))
check('SPA fallback rewrites /* to /index.html with status 200', /\[\[redirects\]\][^[]*from\s*=\s*"\/\*"[^[]*to\s*=\s*"\/index\.html"[^[]*status\s*=\s*200/.test(toml))
const headerRules = toml.split('[[headers]]').slice(1).map((block) => ({
  for: /for\s*=\s*"([^"]+)"/.exec(block)?.[1],
  cache: /Cache-Control\s*=\s*"([^"]+)"/.exec(block)?.[1] ?? '',
}))
const rule = (target) => headerRules.find((item) => item.for === target)?.cache ?? ''
check('/index.html and /sw.js revalidate', ['/index.html', '/sw.js'].every((target) => /max-age=0/.test(rule(target)) && /must-revalidate/.test(rule(target))))
check('/assets/* is long-term immutable', /max-age=31536000/.test(rule('/assets/*')) && /immutable/.test(rule('/assets/*')))
check('the manifest is not long-term cached', !/immutable|max-age=[1-9]/.test(rule('/manifest.webmanifest')) && rule('/manifest.webmanifest') !== '')

console.log(`\n${failed === 0 ? 'All PWA checks passed.' : `${failed} PWA check(s) FAILED.`}`)
process.exit(failed === 0 ? 0 : 1)
