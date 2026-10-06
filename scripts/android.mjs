// Builds the private Android APK (Phase 15): web build -> Capacitor sync -> Gradle -> a short check of the result.
//
//   npm run android:debug     android/app/build/outputs/apk/debug/app-debug.apk       (com.adikhil.system.debug)
//   npm run android:release   android/app/build/outputs/apk/release/app-release.apk   (com.adikhil.system; needs
//                                                                                      android/keystore.properties)
//
// It only finds the JDK and the Android SDK (Android Studio's bundled JDK is enough) and runs the real tools in order;
// nothing is signed, copied or published anywhere else. JAVA_HOME / ANDROID_HOME win when they are set.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const type = process.argv[2]
if (type !== 'debug' && type !== 'release') {
  console.error('usage: node scripts/android.mjs <debug|release>')
  process.exit(2)
}

const windows = process.platform === 'win32'
const root = fileURLToPath(new URL('..', import.meta.url))
const firstExisting = (paths) => paths.find((path) => path && existsSync(path))

const javaHome =
  process.env.JAVA_HOME ||
  firstExisting([
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/android-studio/jbr',
  ])
const androidHome =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  firstExisting([
    join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
    join(homedir(), 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
  ])
if (!javaHome || !androidHome) {
  console.error('Could not find the JDK and the Android SDK. Set JAVA_HOME and ANDROID_HOME (Android Studio ships both).')
  process.exit(2)
}
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome }

function run(command, args, cwd = root) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  // npm, npx and gradlew.bat are batch files on Windows, which only cmd.exe can start.
  const result = windows
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], { cwd, env, stdio: 'inherit' })
    : spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`\n${command} ${args[0] ?? ''} failed`)
    process.exit(result.status ?? 1)
  }
}

run('npm', ['run', 'build'])
run('npx', ['cap', 'sync', 'android'])
run(windows ? '.\\gradlew.bat' : './gradlew',[type === 'debug' ? 'assembleDebug' : 'assembleRelease', '--console=plain'], join(root, 'android'))
run('node', ['scripts/verify-android.mjs', type])
