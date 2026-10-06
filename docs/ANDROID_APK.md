# Android APK (Phase 15)

Phase record, written 2026-10-06. Baseline: `main` at `554fec6` (Phase 14 closeout; 2,308 passing tests + 1 `todo`, 126 files, all green before any change). The existing web app is packaged as a **private, sideloaded Android APK** with Capacitor. It is packaging only: **no gameplay rule, no EXP/level/streak/Weekly/Awakening change, no IndexedDB schema change (still v5), no backup change (still schema 5), no backup/restore UI, no notifications, no Capacitor plugin.** The PWA is unchanged and still builds and verifies.

## Summary

| Area | Result |
| --- | --- |
| Packages | `@capacitor/core`, `@capacitor/android` (dependencies) and `@capacitor/cli` (dev), all 8.5.2. No plugin. |
| Identity | Release `com.adikhil.system`, label `SYSTEM`. Debug `com.adikhil.system.debug`, label `SYSTEM (debug)`. They install side by side with **separate data**. |
| Output | Debug APK 4.4 MB, release APK 3.2 MB (signed). Web build inside; works fully offline. |
| App code touched | `src/platform/native.ts` (new), `shellUpdates.ts` (one condition), `OfflineIndicator.tsx` (one condition). Nothing else in `src/`. |
| Native fixes (all reproduced on the emulator first) | Back button, haptics permission, status-bar icon colour, launch splash and launcher icon. |
| Not reproduced, so not changed | Safe-area handling, soft keyboard, resume events. |
| Gates | `lint`, `typecheck`, `test:run` (**2,334 passing + 1 `todo`, 127 files**; was 2,308 + 1, 126), `build` and `verify:pwa` all pass. `android:debug` / `android:release` run `verify:android` (10 and 11 checks) and pass. |

## Identity, origin and data (read this before relying on the APK)

- **Application id is permanent.** Changing it creates a different app with an empty database. The release id is `com.adikhil.system`; the debug build adds `.debug` (`applicationIdSuffix`) and a `SYSTEM (debug)` label (`app/src/debug/res/values/strings.xml`).
- **The web origin is pinned to `https://localhost`** (`capacitor.config.json`: `server.androidScheme` `https`, `server.hostname` `localhost`). IndexedDB is keyed by origin, so changing either value is an empty database. `verify:android` asserts the pinned origin inside the finished APK.
- **Where the data lives:** the app's private WebView storage. It survives restarts, force-stops, a WebView update that kills the app, and installing a new APK over the old one (all verified). **It is deleted by uninstalling, by Clear storage, and by anything that forces an uninstall** (a different signing key, a different application id). It does not carry over from Chrome, the PWA or the dev server (a different origin), so a fresh install plays Awakening.
- **Android Auto Backup is OFF** (`android:allowBackup="false"`, owner decision). There is no cloud copy. Until the explicit Backup/Restore UI exists, **the only copy of the player's progress is on the phone**.
- Schema, migrations, the checksum and `crypto.subtle` all work unchanged (`https://localhost` is a secure context; verified: `isSecureContext`, `crypto.subtle`).

## Native behaviour decisions

- **No service worker in the APK.** The APK already holds every file and an update is a new APK, so the worker, its precache and the "SYSTEM UPDATE AVAILABLE" flow would only be wrong. `isNativeApp()` (`src/platform/native.ts`) reads the `Capacitor` global the shell injects (the app never imports Capacitor, so a browser build carries none of it); `browserEnvironment()` in `shellUpdates.ts` then gives the update store no service-worker container, which is the existing "no worker here" path. `sw.js` still ships inside the APK as an inert file. Verified on the device: no registration, no controller. A test fails if the guard is removed (checked by mutation).
- **OFFLINE marker hidden in the APK** (`OfflineIndicator`): the app never needs a network.
- **`INTERNET` permission kept** (owner decision). **`VIBRATE` added**: the template does not declare it and the WebView then refuses every `navigator.vibrate` (logcat: `cr_VibrationManager: Failed to use vibrate API, requires VIBRATE permission`); after the fix the warning is gone. A normal permission, granted at install.
- **Back button** (`MainActivity.java`): Capacitor's core has no back handling, so Back left the app from every screen (reproduced: from `/status`, history length 3, one Back closed the app). The activity now retraces the WebView history first (the routes are history entries) and lets the system close the app only at the root. No plugin and no JS involved. Verified: Status → Quests → Home, then Back at Home leaves the app.
- **System bars:** `plugins.SystemBars.style = "DARK"` (light icons for the always-dark app) and `android:windowBackground` = the app's near-black. The status bar was reproduced as dark-on-dark (the emulator is in light mode); it is readable now.
- **Launch splash and launcher icon** were Capacitor's own (blue logo on light grey) and are replaced with the app's own icon on `#07060d`. They are generated, reproducibly and without a new dependency, from the same geometry as the web icons: `npm run icons:android` (`tools/icons/generateAndroid.ts`; two new render variants in `render.ts`, `foreground` scaled into Android's 66 dp adaptive safe zone and `circle`). The adaptive background is the solid colour `ic_launcher_background`; the same foreground is the Android 12+ splash icon. The template's splash images and unused vector drawables were deleted.
- **Left as the template has it:** `minifyEnabled false`; `adjustResize` handling; `minSdk 24`, `compileSdk`/`targetSdk 36`; AndroidX versions; the two example test stubs under `com.getcapacitor.myapp` (never run).

## Safe area, keyboard, resume: checked, not changed

The kickoff flagged these as possible blockers. Each was tested on the emulator before anything was changed:

- **Safe area.** On the emulator's original WebView (133) Capacitor pads the WebView inside the system bars and reports `env(safe-area-inset-*)` as 0, so the app fits (white bars, now fixed by the dark window background). After Google Play auto-updated the WebView to **153** the app is truly edge-to-edge and `env(safe-area-inset-top)` is a correct 24 px (bottom 23.7), which is what the app's existing `env()` usage expects. No CSS change was needed. (Capacitor's `SystemBars` documentation describes exactly this split at WebView 140.) On WebView 133 Capacitor logged `Error injecting safe area CSS ... reading 'style'` three times at startup (not re-checked on 153); on 153 the `--safe-area-inset-*` variables exist (top 24 px). The app does not use them. Not investigated further.
- **Soft keyboard.** With the real Gboard on the Status rename field the WebView shrinks (914 → 578 px) and the page scrolls the field into view: the field and SAVE stay visible above the keyboard. A typed name saved and survived a force-stop.
- **Resume.** Sending the app to the background and back fires `visibilitychange` (`hidden`, then `visible`), the signal `useDaySync` listens for. (`focus` did not fire; it is not needed.)

## Build and install

All of it is `npm run` from the project root. The scripts find Android Studio's bundled JDK and the SDK in their standard places (`JAVA_HOME` / `ANDROID_HOME` win when set); nothing needs to be on `PATH`.

```bash
npm run android:debug     # web build, cap sync, Gradle, checks -> android/app/build/outputs/apk/debug/app-debug.apk
npm run android:release   # same, signed -> android/app/build/outputs/apk/release/app-release.apk
npm run verify:android    # re-check the debug APK (the build scripts already do this)
npm run icons:android     # regenerate the launcher icons
```

`scripts/verify-android.mjs` asserts the application id and label, the version name (= `package.json`), exactly `INTERNET` + `VIBRATE`, Auto Backup off, debuggable or not, the web build inside, no reference/dev-lab material, the pinned `https://localhost` origin, and a valid signature (and, for release, not the debug key). It reads the APK with the SDK's own `aapt2`, `apksigner` and `jar`.

The first Gradle build downloads Gradle 8.14.3, the Android Gradle Plugin 8.13 and AndroidX (5 min 21 s); later debug builds take seconds and a release build about a minute. Android Studio 2025.1 (build 251) is older than Capacitor 8 asks for **if you open the project in the IDE**; the command-line build does not need Studio and was verified without it.

To install on a phone: copy the APK over (cable, cloud drive) and open it, allowing installs from that source once; or `adb install -r <apk>`. `-r` keeps the app's data.

### Release signing (the owner's keystore; never in the repo)

1. Create the keystore once, outside the repository, and **back it up**. Using Android Studio's bundled `keytool` (it prompts for the passwords, so nothing is typed into a file or a chat):

   ```powershell
   & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore "$env:USERPROFILE\keys\system-release.jks" -alias system -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Copy `android/keystore.properties.example` to `android/keystore.properties` (git-ignored) and fill in the path and passwords.
3. `npm run android:release`. Without `keystore.properties` the release APK is unsigned and `verify:android` says so (an unsigned APK cannot be installed).

**If the keystore is lost, a new APK cannot be installed over the old one; the only way forward is an uninstall, which deletes the data.** `*.jks`, `*.keystore` and `android/keystore.properties` are git-ignored.

### Updates (no auto-update)

A new APK installs over the old one when it has **the same application id, the same signing key and a higher `versionCode`** (`android/app/build.gradle`, currently 1; bump it by one for every release you install, an equal or lower one is refused). `versionName` follows `package.json`. Installing over keeps the data. The debug build uses the debug key and the release build your key, so moving a phone from a debug install to a release one is an uninstall (a different app and a different database); decide up front which one the phone runs.

## Verification record (emulator only)

Android 16 / API 36 AVD (`Medium_Phone_API_36.0`, 2 GB RAM), WebView 133 at first and **153 after a Play auto-update that happened mid-test** (it killed the app once and briefly invalidated the first Back test; the test was re-run cleanly). Driven with real `adb input` taps and the WebView DevTools protocol.

- Debug build installs and opens; Awakening plays (ACCEPT → identify → SKIP), Home shows the six default quests.
- Quest completions by real tap (4 of 6 completed): EXP, the completion count and the XP ledger rows in IndexedDB (schema v5, all 8 stores present) matched what the screen showed.
- Persistence: survives `force-stop`, a WebView update that killed the process, and `adb install -r` of a rebuilt APK (EXP and the saved name intact).
- Offline: with airplane mode on, a cold start works and quests complete. (The emulator kept reporting `navigator.onLine` as true, so the OFFLINE-marker hiding is covered by its unit test, not by this run.)
- Back, soft keyboard, resume, system bars, splash, launcher icon, haptics permission: as above.
- A signed **release** APK (built with a throwaway test key that was deleted afterwards; no key of the owner's was involved) installs next to the debug app as a separate app with an empty database, is not debuggable, and passes `verify:android`.

**Not verified:** a physical phone (haptic feel, audible sound, finger feel, performance, OEM battery/storage behaviour, TalkBack, a notch/cutout); a real midnight rollover inside the APK (the emulator has no root to change the clock; only the resume signal was observed); the 133-WebView path *after* the dark window background was added (the emulator had already updated to 153); installing over an APK with a higher `versionCode`; the owner's own release key. WebView storage-eviction behaviour under disk pressure is unknown; backups are the protection.

Known cosmetic, left alone: on an edge-to-edge WebView the page scrolls under the transparent status bar (the clock can overlap content while scrolled). A status-bar scrim would fix it; it was not asked for.

## Files

New: `capacitor.config.json`, `android/` (the Capacitor project, 43 files, about 255 KB: Gradle wrapper, manifest, `MainActivity.java`, resources, 15 generated icon PNGs, `keystore.properties.example`), `scripts/android.mjs`, `scripts/verify-android.mjs`, `src/platform/native.ts` and `native.test.ts`, `tools/icons/generateAndroid.ts`, this document.
Edited: `package.json` / `package-lock.json` (3 packages, 4 scripts), `.gitignore` (keystore files), `eslint.config.js` (`android` is ignored), `src/platform/shellUpdates.ts` (+ test), `src/features/pwa/OfflineIndicator.tsx` (+ test), `tools/icons/render.ts` and `icons.test.ts`.
Untouched: domain, persistence, application, effects, `src/sw/`, the shell-precache plugin, `netlify.toml`, the schema, the backup.

`npm audit` reports 3 moderate `uuid` advisories that come only from the Capacitor CLI's dev-only dependencies (a production audit is clean; there were none before). They never ship in the app.

## Follow-ups

1. **Backup/Restore UI** is now more important: the APK has Auto Backup off and no other copy of the data. The default-seed backup validation gap (Phase 13) stays with it.
2. Physical-phone pass with the APK (replaces the Netlify/HTTPS route for a real-phone check).
3. Local notifications: a separate mini-phase, deferred by the owner.
4. Optional: status-bar scrim; `minWebViewVersion` (Tailwind 4 needs about Chrome 111, Capacitor's default is 60; phones update WebView automatically); updating Android Studio if the project is to be opened in the IDE.
