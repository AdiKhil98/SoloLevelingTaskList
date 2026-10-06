// Checks a finished APK (Phase 15). `node scripts/verify-android.mjs <debug|release>` (`npm run android:*` runs it).
//
// It asserts the few facts that, if they drifted, would cost the player their data or break the app silently:
// the application id (a different one is a different app with an empty database), the pinned web origin (a different
// origin is a different IndexedDB), Auto Backup off, the two permissions the app needs, a real signature, and that the
// web build is inside. It reads the APK with the SDK's own tools and changes nothing.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const type = process.argv[2]
const EXPECTED = {
  debug: { id: 'com.adikhil.system.debug', label: 'SYSTEM (debug)', apk: 'debug/app-debug.apk', debuggable: true },
  release: { id: 'com.adikhil.system', label: 'SYSTEM', apk: 'release/app-release.apk', debuggable: false },
}[type]
if (!EXPECTED) {
  console.error('usage: node scripts/verify-android.mjs <debug|release>')
  process.exit(2)
}

const root = fileURLToPath(new URL('..', import.meta.url))
const windows = process.platform === 'win32'
const exists = (path) => Boolean(path) && existsSync(path)
const javaHome =
  process.env.JAVA_HOME || ['C:\\Program Files\\Android\\Android Studio\\jbr'].find(exists) || ''
const androidHome =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  [join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'), join(homedir(), 'Android', 'Sdk')].find(exists) ||
  ''
const buildTools = join(androidHome, 'build-tools', readdirSync(join(androidHome, 'build-tools')).sort().at(-1) ?? '')

const outputs = join(root, 'android', 'app', 'build', 'outputs', 'apk')
const apk = join(outputs, EXPECTED.apk)
if (!existsSync(apk)) {
  const unsigned = join(outputs, 'release', 'app-release-unsigned.apk')
  console.error(
    type === 'release' && existsSync(unsigned)
      ? 'The release APK is UNSIGNED, so it cannot be installed. Create android/keystore.properties (see android/keystore.properties.example) and build again.'
      : `No APK at ${apk}`,
  )
  process.exit(1)
}

function tool(command, args, options = {}) {
  // A .bat file has to go through cmd.exe on Windows.
  const batch = windows && command.endsWith('.bat')
  const result = spawnSync(batch ? 'cmd.exe' : command, batch ? ['/d', '/s', '/c', command, ...args] : args, { encoding: 'utf8', ...options })
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures.push(name)
}

console.log(`\n${apk}  ${(statSync(apk).size / 1024 / 1024).toFixed(2)} MB`)

const badging = tool(join(buildTools, windows ? 'aapt2.exe' : 'aapt2'), ['dump', 'badging', apk]).out
const manifest = tool(join(buildTools, windows ? 'aapt2.exe' : 'aapt2'), ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk]).out
const versionName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const permissions = [...badging.matchAll(/^uses-permission: name='([^']+)'/gm)].map((match) => match[1]).sort()
const wanted = ['android.permission.INTERNET', 'android.permission.VIBRATE', `${EXPECTED.id}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`].sort()

check('application id', badging.includes(`package: name='${EXPECTED.id}'`), EXPECTED.id)
check('label', badging.includes(`application-label:'${EXPECTED.label}'`), EXPECTED.label)
check('version name follows package.json', badging.includes(`versionName='${versionName}'`), versionName)
check('permissions are exactly INTERNET and VIBRATE', JSON.stringify(permissions) === JSON.stringify(wanted), permissions.join(', '))
check('Android Auto Backup is off', /android:allowBackup\([^)]*\)=(false|\(type 0x12\)0x0)/.test(manifest))
check(EXPECTED.debuggable ? 'is a debuggable build' : 'is NOT debuggable', badging.includes('application-debuggable') === EXPECTED.debuggable)

const jar = join(javaHome, 'bin', windows ? 'jar.exe' : 'jar')
const entries = tool(jar, ['tf', apk]).out.split(/\r?\n/)
check('the web build is inside (assets/public/index.html)', entries.includes('assets/public/index.html'))
check('no dev lab or reference material inside', !entries.some((entry) => /_reference|dev\/effects/i.test(entry)))

const scratch = mkdtempSync(join(tmpdir(), 'system-apk-'))
try {
  tool(jar, ['xf', apk, 'assets/capacitor.config.json'], { cwd: scratch })
  const config = JSON.parse(readFileSync(join(scratch, 'assets', 'capacitor.config.json'), 'utf8'))
  check(
    'web origin is pinned to https://localhost (a different origin would be an empty database)',
    config.server?.androidScheme === 'https' && config.server?.hostname === 'localhost',
    `${config.server?.androidScheme}://${config.server?.hostname}`,
  )
} catch (error) {
  check('the packaged Capacitor config can be read', false, String(error))
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

const signature = tool(join(buildTools, windows ? 'apksigner.bat' : 'apksigner'), ['verify', '--print-certs', apk], { env: { ...process.env, JAVA_HOME: javaHome } })
check('has a valid signature', signature.ok, signature.out.match(/certificate SHA-256 digest: (\w+)/)?.[1] ?? signature.out.trim().split(/\r?\n/)[0])
if (type === 'release') check('is not signed with the debug key', !/Android Debug/i.test(signature.out))

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join('; ')}`)
  process.exit(1)
}
console.log('\nAPK checks passed.')
