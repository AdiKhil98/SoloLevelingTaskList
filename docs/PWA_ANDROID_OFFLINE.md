# PWA / Android / Offline (Phase 12)

Implementation record for the installable, offline-capable app. It is infrastructure only: **no gameplay, EXP, level, rank, achievement, quest, lifecycle, Weekly or Awakening rule changed, IndexedDB is still schema v5 and the backup is still schema 5.**

## What was built, in one paragraph

A hand-written service worker (`/sw.js`) caches the **application shell** (never user data) so the app starts, navigates and works with no network once it has been loaded once. A small local Vite plugin builds the worker and injects the list of files to cache. A new build installs next to the running one and **waits**; the player sees `SYSTEM UPDATE AVAILABLE [ RESTART ] [ LATER ]` and decides when to switch. There is a web manifest and an original icon set, a Netlify configuration, a silent `navigator.storage.persist()` request, and a small OFFLINE marker. No dependency was added.

## Files

| Area | Files |
|---|---|
| Worker | `src/sw/core.ts` (all logic, injected environment), `src/sw/sw.ts` (the only file touching the worker scope), `src/sw/testing.ts` (test doubles) |
| Build | `tools/shell-precache/manifest.ts` (pure: kinds, build id, prelude), `tools/shell-precache/plugin.ts` (Vite plugin), `vite.config.ts` |
| Page side | `src/platform/shellUpdates.ts` (registration + update lifecycle), `src/platform/connectivity.ts`, `src/platform/storage.ts`, `src/platform/page.ts` (`reloadPage`) |
| UI | `src/features/pwa/` (`UpdateNotice`, `OfflineIndicator`, `formRoutes`), mounted in `src/components/layout/AppShell.tsx` |
| Awakening chunk recovery | `src/app/LazyLoadBoundary.tsx`, `ScreenLoadFailedScreen` in `src/app/StartupScreens.tsx`, used in `AppRuntimeProvider.tsx` |
| Static assets | `public/manifest.webmanifest`, `public/icons/*.png`, `public/favicon.svg`, `index.html` head |
| Icons | `tools/icons/` (`geometry.ts`, `render.ts`, `png.ts`, `svg.ts`, `generate.ts`), `npm run icons` |
| Hosting | `netlify.toml` |
| Checks | `scripts/verify-pwa.mjs`, `npm run verify:pwa` |
| CSS | `html { overscroll-behavior-y: none }` and no text selection on controls (`src/styles/globals.css`) |

## Web app manifest

| Field | Value |
|---|---|
| `id`, `start_url`, `scope` | `/` |
| `name` / `short_name` | `SYSTEM — Quest Tracker` / `SYSTEM` (the repository keeps its name; `<title>` and the description meta were aligned to the new name) |
| `display` | `standalone` |
| `orientation` | **not set**: portrait and landscape both work (a deliberate decision; both are tested) |
| `theme_color`, `background_color` | `#07060d` (the SYSTEM background: dark status bar, dark splash, no white flash) |
| `icons` | 192 `any`, 512 `any`, 512 `maskable` (separate files, never `"any maskable"`) |

`index.html` also links the manifest and an `apple-touch-icon`. No in-app install button exists (D7): Chrome's own install UI is used.

## Icons

Original, app-owned geometry, no character art and no third-party mark: a violet hexagon ring (the existing favicon's silhouette), a generic double up-chevron, one small cyan diamond, on the near-black SYSTEM background with a soft violet glow. All colours are design tokens.

* **One geometry definition** (`tools/icons/geometry.ts`) feeds both the PNG rasterizer and the SVG favicon, so they cannot drift.
* **Reproducible with only Node** (`npm run icons`, Node 23.6+ runs the TypeScript directly): fixed 6×6 supersampling, plain arithmetic, a minimal PNG encoder (`node:zlib`). Re-running it changes nothing (verified byte-for-byte).
* `any` icons are a dark rounded square; the maskable and Apple-touch icons are full-bleed. **All artwork stays inside the maskable safe zone** (radius 0.4 around the centre), asserted by a test.
* A test decodes the committed PNGs and compares their **pixels** with a fresh render (compressed bytes may differ across zlib versions; pixels cannot).

## The service worker

### What is cached

Exactly the files in the build's shell manifest: `index.html`, every hashed JS and CSS chunk (including the lazy Awakening, overlay and Typewriter chunks, so an offline Level Up works), the local Oxanium font, `manifest.webmanifest`, the icons and `favicon.svg`. About 730 KiB raw / 280 KiB gzip for 15 files.

**Not cached, ever:** anything else. There is no runtime caching, no API, no cross-origin request. `sw.js` itself, source maps, `_reference/` and the development effects lab are never in the list (the build **fails** if any of the last two appear in the output).

### Build id and cache name

`buildId` = first 16 hex digits of `sha256( worker code ‖ "\n" ‖ for every shell file, sorted: "<url> <sha256 of content>\n" )`. Changing the worker logic, `index.html`, the manifest, an icon or any hashed chunk produces a new id. The cache is named `sltl-shell-<buildId>`. The id is injected, with the file list, as one JSON line in front of the worker (`self.__SHELL_MANIFEST__=…`), so the worker's bytes change exactly when something in the shell changed, which is what makes the browser treat it as an update. Builds are deterministic (rebuilding unchanged source gives the same id and byte-identical `sw.js`).

### Install (atomic)

1. Delete any **incomplete** `sltl-shell-*` cache (a partial install is never served from).
2. Pick a cache name that **does not exist yet** (`<id>`, or `<id>~2` … if the same build is somehow installed again, e.g. after a rollback): an install never writes into a cache that existed before it started, so it can never touch the running build's cache.
3. Fetch every file with `cache: 'reload'` and **validate each response before anything is stored**: status exactly 200, same-origin, not redirected, and the content type must fit (only `index.html` may be HTML; a JS/CSS/font/image URL that comes back as `text/html` is rejected, which is what a single-page-app host does for a missing file).
4. Store everything, then write a completion marker **last**.
5. On any failure the new cache is deleted and the install rejects: the running build and its cache are untouched.

There is **no `skipWaiting()`** in install.

### Activate

Keeps this build's complete cache, deletes every other `sltl-shell-*` cache, then `clients.claim()`. If this worker has no usable cache of its own (it was evicted), it deletes nothing (the old caches are all the app could fall back on). Caches without the prefix are never touched.

### Fetch

Only same-origin `GET`. Everything else is left to the network.

* **Exact shell file** (path in the manifest, no query string) → from the cache.
* **Page navigation** (`mode: navigate`, accepts `text/html`, last path segment names no file) → the cached `index.html`. This is why `/`, `/quests`, `/weekly`, `/status`, `/achievements`, `/status/history`, … all work offline, cold.
* **Everything else** (an unknown asset, an API-style path, a navigation to something that names a file such as `/missing.js` or `/sw.js`) → **not** answered by the worker, so it is never turned into `index.html`. Verified in a real browser: such a request fails with a network error offline.
* A cache that cannot be read falls through to the network.

### Messages

Only `{ type: 'SKIP_WAITING' }` (posted by the page when the player presses RESTART) is acted on, and it is a **request**, not an order. Before the worker calls `skipWaiting()` it counts the app's window clients (`clients.matchAll({ type: 'window', includeUncontrolled: true })`):

* **One window** (the requester): it calls `skipWaiting()` and the normal activate → claim → single reload follows.
* **More than one window:** it does **not** call `skipWaiting()`, does not activate and deletes nothing, and replies to the requesting page with `{ type: 'UPDATE_BLOCKED', windows }`.
* **The windows cannot be counted:** it does not activate (never on a guess) and says nothing; the page's button recovers by itself after 10 s.

See "Multi-window update safety" below for why.

### The boundary with player data

The worker never opens IndexedDB, reads or writes player data, migrates data, or decides Awakening or lifecycle state. Enforced four ways: ESLint forbids the identifiers `indexedDB`, `IDB*`, `openDatabase`, `localStorage`, `sessionStorage` and any import from the application in `src/sw/` (`eslint.config.js`); a test runs install/activate/fetch/message with those globals trapped; a test checks the source text; `verify:pwa` checks the built `sw.js`.

## The page side: registration and updates (`src/platform/shellUpdates.ts`)

* **Production only.** `main.tsx` starts it when `import.meta.env.PROD`; `vite dev` never has a service worker. It waits for the page `load`, then registers `/sw.js` at scope `/` with `updateViaCache: 'none'`.
* **Everything is optional infrastructure.** A missing API (plain HTTP), a failed registration, a failed update check, or any throw while starting is caught: at worst the app runs online-only, with one `console.warn` for a registration failure. An offline or failed update check is silent.
* **The first install is not an update.** A waiting worker counts as an update only if a worker already controls the page, and the first `controllerchange` (the worker claiming the page) is ignored.
* **Update checks:** on load (the browser does it), then on `visibilitychange → visible` and `online`, at most once per 10 minutes. This is a separate listener; it never calls the day sync. **The Phase 06 lifecycle remains the only authority on days** (resume, midnight, reconciliation); Phase 12 adds no lifecycle.
* **Nothing reloads by itself.** RESTART posts `SKIP_WAITING` to the waiting worker; the page reloads **once**, only after `controllerchange` that it asked for. If the new worker has not taken over after 10 s the button works again. If the worker answers `UPDATE_BLOCKED` (another app window is open) the page leaves the RESTARTING state, shows the blocked line (below) and does nothing else. If a window nevertheless finds its controller replaced without asking (a narrow race, see below), it is offered a restart, never reloaded under the player.
* **LATER** hides the notice for the session only (in memory; a reload shows it again; a newer build supersedes it).
* **Unsaved forms:** on `/quests/new`, `/quests/:id/edit` and `/weekly/edit` the notice (and so RESTART) is not shown. The update is remembered and the notice appears when the player leaves the form. No dirty-form tracking exists or is needed.
* **During Awakening** the notice does not exist (the Awakening screen replaces the whole app).
* While the notice shows it reserves its own height at the bottom of the page (`--notice-space`, measured with a `ResizeObserver`), so the last item can always be scrolled clear of it.

### Update walk-through

1. Build B is deployed. The running page (build A) notices a changed `sw.js`; B installs into its own cache **beside** A's and waits. The page keeps running A (its chunks come from A's cache).
2. `SYSTEM UPDATE AVAILABLE [ RESTART ] [ LATER ]` appears (not on a form route).
3. RESTART → B activates, deletes every other build's cache, claims the page → the page reloads once → B is authoritative. IndexedDB is not touched at any point.
4. If the player closes every window instead, B activates by itself at the next launch.

### Multi-window update safety

RESTART deletes every older cache and takes control of every open window, and the page code deliberately never reloads a window the player did not ask to reload. With **two or more windows** on build A, activating B from one of them would therefore leave the others running A's JavaScript with A's cache gone, and an A lazy chunk they had not loaded yet could no longer be found (it is also no longer on the server after a deployment). That would break the rule that a running session stays safe until the player chooses RESTART.

So the switch is allowed **only when the requesting window is the only app window open** (the worker counts them; see "Messages"). Otherwise nothing changes at all: the new build keeps waiting, the old cache stays, the other window keeps working, and the requesting window shows

```
OTHER SYSTEM WINDOW OPEN
CLOSE IT TO RESTART          [ RESTART ] [ LATER ]
```

RESTART stays enabled: once the other window is closed, pressing it again succeeds (the worker counts afresh every time). Nothing closes or reloads the other window, nothing is written to IndexedDB, and LATER, the unsaved-form rule, supersession by a newer build, and the first install all behave as before. A window that is open but not yet controlled by any worker (for example after a hard reload) counts too, and so does any other window of the site (including a tab showing a plain file such as `/sw.js`): the rule errs on the side of not switching.

Residual race (accepted): a window that finishes opening in the instant between the count and the activation could still end up on a replaced build; the existing "offer a restart, never reload" path covers it.

A reload of a single tab does **not** activate a waiting worker (the old page's controller stays alive across the reload), so the notice returns after a reload until RESTART or until every window is closed. That is deliberate.

## Offline behaviour

After the app has loaded once, with no network: startup, Home, Quests (list, create, edit, archive), Weekly (create and view a board), Status, rename, achievements, Daily History, the Daily Report, quest completion, the day lifecycle, and **first-launch Awakening on a fresh database** all work. (Every quest-management and Weekly action uses the same local persistence; create, edit, archive and Weekly creation were exercised offline specifically.) The application itself makes **no network request at all** (no `fetch`, XHR, WebSocket or beacon in `src`; no remote URL in the bundle; the font is local). A test makes the network fail loudly and asserts it is never used.

* `navigator.onLine` is **informational only**. It drives only the small `OFFLINE` marker (top centre, fixed, pointer-transparent, takes no layout space) and **never** decides whether a local action is allowed.
* A genuinely new install cannot start offline (nothing has been downloaded). Once the shell is on the device, a fresh IndexedDB still shows Awakening and creates nothing until the identity is saved; an existing profile still goes straight to Home with no Awakening frame. The worker never creates or reads the profile row.

## IndexedDB relationship

None, by design. The worker caches static files; the data lives in IndexedDB and is owned entirely by the page. A service-worker update, a failed update, a kill switch or a cache reset cannot change a byte of it. Measured in a real browser: the SHA-256 of every store was identical before and after build A → B, and before and after the kill switch (see "Verification").

## Storage persistence

After the app first reaches `ready` (for a new player: after Awakening is saved), once per session, it calls `navigator.storage.persist()` (skipping it if `persisted()` is already true). It is silent: Chrome decides by its own heuristics (an installed app is favoured) and shows no prompt. A refusal, a failure, or the API not existing (plain HTTP) is normal, harmless and invisible: no UI, no log, nothing depends on it. **Nothing about storage is shown in Settings (D8).** On a desktop tab that is not installed it answers `false`.

## Install UX

Chrome's native install UI only (D7): no in-app install button, no `beforeinstallprompt` handling, no install state.

## Secure context and backups

| Where the app is opened | `crypto.subtle` | Service worker | `navigator.storage` | Backup export / import |
|---|---|---|---|---|
| HTTPS (production) and the installed app | yes | yes | yes | works |
| `http://localhost` / `127.0.0.1` (dev, preview, `adb reverse`) | yes | yes | yes | works |
| plain `http://192.168.x.x` (LAN) | **no** | **no** (the app runs as an ordinary tab) | **no** | fails with the typed `checksum_unavailable` |

Backup export and import both compute the SHA-256 checksum with `crypto.subtle` (`src/persistence/backup/envelope.ts`). **The checksum and the backup integrity model are unchanged**; there is no fallback checksum and none must be added. `crypto.randomUUID` is also missing on LAN HTTP; ids already fall back to `getRandomValues`.

**There is no Backup/Restore UI yet**, so there is nowhere a message could be shown. See "Follow-ups".

## Android / Chrome notes

* `viewport-fit=cover`, safe-area insets (AppShell, bottom nav, startup screens) and `dvh` units were already in place; `theme_color` colours the status bar, `background_color` and the icon make the splash.
* **Pull-to-refresh is disabled** (`overscroll-behavior-y: none` on `html`), so an overshooting scroll cannot reload the installed app mid-session. Controls (`button`, `nav`, `[role=button]`) are not text-selectable on a long press; body text still is.
* The Phase 06 lifecycle already handles returning from the background (`visibilitychange`, `pageshow`, `focus`) and midnight; a frozen/discarded page simply cold-starts into the normal startup reconciliation.
* Soft keyboard: the default `interactive-widget` behaviour is kept (no change was made). Real-device behaviour of the name field and the quest forms is still to be checked.
* **Orientation is not locked.** Portrait and landscape were audited (see below).

## Hosting (Netlify, root path)

`netlify.toml`: build `npm run build`, publish `dist`; one rewrite `/*` → `/index.html` (status 200; Netlify serves a real file when one exists, so only paths without a file are rewritten); `Cache-Control: public, max-age=0, must-revalidate` for `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` and `/icons/*`; `public, max-age=31536000, immutable` for `/assets/*` only (Vite content-hashes everything there). The service worker is served from `/`, so its scope is the whole site. HTTPS is required for install (Netlify provides it). The SPA rewrite means a missing asset answers `200 text/html`; the worker's install validation exists precisely so that cannot poison the cache.

## Recovery and troubleshooting (there is deliberately no reset button)

A user-facing "reset offline cache" control could remove the offline shell and leave the app unavailable until the next successful online load, so it is not part of V1 settings (D9). Use these instead.

* **Never clear the site's data from the browser settings** to fix a service-worker problem: on Android Chrome that also deletes IndexedDB, which is the player's progression. Use the steps below, which never touch it.
* **A bad deployment** (a listed file missing or HTML-for-JS): the new worker's install fails and the old build keeps running, with no partial cache. Fix the deployment and redeploy, or roll back by deploying the earlier build: because the build id and `sw.js` bytes derive from the files, a rollback is a different worker from the broken one and installs normally.
* **A page that cannot load a lazy screen** (the first-launch screen's chunk, after a deployment or offline before it was cached): the Awakening screen shows "This screen could not be loaded" with a **Reload** button (nothing is saved, nothing changes, no automatic reload, so no loop). The Level Up/Rank Up overlays already fall back to plain popups (Phase 10).
* **Obsolete caches:** removed at activation; an orphan left by a superseded worker disappears at the next activation.
* **A worker that misbehaves (emergency kill switch):** deploy this as `/sw.js`. Every device that checks for an update installs it, deletes the shell caches, unregisters, reloads its pages from the network, and **never touches IndexedDB**; the next normal deploy registers the real worker again. Verified in a real browser (zero registrations, zero caches, identical IndexedDB hash, clean re-install afterwards).

```js
// Emergency kill switch: removes the offline shell from this device. Never touches IndexedDB.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith('sltl-shell-')) await caches.delete(name)
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
    })(),
  ),
)
```

* **Looking inside (desktop Chrome DevTools → Application):** Service Workers shows the active and waiting worker; Cache Storage shows one `sltl-shell-<buildId>` cache (two during an update); the build id is also at the top of `/sw.js`.

## Verification

### Automated

`npm run lint`, `typecheck`, `test:run` and `build` pass, and so does **`npm run verify:pwa`** (build, then 35 checks of `dist/`: manifest fields and icon files, head metadata, a classic-script worker that names no IndexedDB, a precache list equal to the shipped files, an **independently recomputed** build id, no `_reference` / `/dev` / effects-lab output, no remote URL, size budgets, and the Netlify rules). `verify:pwa` was also run against eight deliberately corrupted copies of `dist/` and failed each time.

Tests added (all deterministic, none weakened, no retries): the worker core with fake caches and a SPA-host fake network (install atomicity, no write into an existing cache, partial-cache cleanup, content-type validation, activation, navigation fallback and its refusals, messages, the no-IndexedDB trap), the build id and manifest (sensitivity to worker code, hashed chunks and stable files; agreement with the worker's own parser), the icons (PNG codec, committed pixels equal a fresh render, safe zone, palette), the static manifest/head/Netlify files, the update lifecycle (first install, update, restart, other-tab, timeout, supersession, throttle, store contract), connectivity, storage, the notices (form routes, LATER, reserved space, semantics, keyboard), and application-level tests with the network made to fail loudly (existing player offline, no Awakening frame, every major route, quest completion and a double tap, rename, create, edit, archive and Weekly board offline, reload persistence, the day lifecycle, a fresh install still playing Awakening and creating nothing, the update notice inside the real shell, persistence requested once after `ready` and never visibly, and the Awakening-chunk failure screen). The multi-window rule has its own tests: the worker (one window calls `skipWaiting`; two, three or seven windows do not and reply `UPDATE_BLOCKED`; both caches stay intact and the old one is removed only when a later RESTART finds a single window; a retry after the other window closes succeeds and counts afresh; an unreachable or throwing requester, and a failed window count, never activate; the first install is untouched), the page store (the reply leaves RESTARTING and reports blocked without reloading; a retry clears it and reloads once on success; unsolicited or malformed replies are ignored; LATER and supersession by a newer build behave as before; page and worker message names match), the notice (wording, RESTART still enabled, exits RESTARTING, form-route hiding, reserved space) and the real shell. Each was also checked by deliberately breaking the implementation and watching the tests fail. Worker, tools and platform tests run in the Node environment. The heavy build checks live in `verify:pwa`, **not** in `test:run`, so they add no load to the known timing-sensitive UI suite.

### Real service worker, production preview (`vite preview`, `http://localhost`, desktop browser pane)

* Online first load: worker registered and controlling the first page; one cache named by the build id; cached files equal the manifest list; completion marker present; manifest and all icons load at their declared sizes; the title is `SYSTEM — Quest Tracker`.
* Server stopped (genuinely unreachable): reload; direct cold navigation to `/`, `/quests`, `/weekly`, `/status`, `/achievements`, `/status/history`, `/weekly/edit`; `/dev/effects` shows Not Found (no lab); quest completion (one ledger row); rename; Weekly board creation; reload persistence of all of them; unknown assets and API-style paths fail with a network error and are **not** answered with the shell.
* A **fresh IndexedDB** with the shell cached and the server down: Awakening plays, nothing is created until the identity is saved, the profile row is written before Home, then Home. An existing profile goes straight to Home.
* **Two windows (the multi-window rule), both on build A, with A's main chunk deleted from the server:** B installed and waited. RESTART in window 1 → the notice changed to `OTHER SYSTEM WINDOW OPEN / CLOSE IT TO RESTART`; B did **not** activate; no reload; A stayed active and **both caches stayed**; RESTART was enabled again; the IndexedDB hash was unchanged. Window 2 stayed fully functional: A's main chunk (no longer on the server) still loaded from A's cache, a lazy chunk imported, navigation worked, and its own RESTART was blocked too. After **closing window 2**, RESTART in window 1 again → B activated, the page reloaded exactly once (no second reload), **A's cache was deleted only then**, and the IndexedDB hash was identical before and after. The ordinary one-window RESTART (A with only one window open) was also re-checked on the fixed worker: activated, one reload, one cache.
* **Build A → B:** B installed beside A and waited; the running page stayed on A; the notice appeared; LATER hid it for the session (navigation did not bring it back); a reload brought it back; it stayed hidden on `/quests/new` with an unsaved draft untouched and appeared after leaving; RESTART switched to B with one reload, deleted A's cache, and **the SHA-256 of all IndexedDB stores was identical before and after**.
* **A broken deployment** (a listed chunk missing, so the host answers `200 text/html`): the new worker went `redundant`; the running build kept control; no waiting worker, no notice, **no partial cache**. After fixing the deployment the same build installed normally. A newer build superseded a waiting one (the older worker became redundant); at the next activation four accumulated caches collapsed to one.
* The emergency kill switch and the clean re-install afterwards (above).
* Layout, by DOM measurement with the notice and the OFFLINE marker both showing, on every route: **360×800, 320×568, 800×360 and 568×320 (landscape): no horizontal overflow; no interactive element under 44 px (the only small hits are 1×1 px visually-hidden native radio/checkbox inputs whose visible labels are the targets); the OFFLINE marker covers nothing; the last item can be scrolled clear of the update notice.** `overscroll-behavior-y` computes to `none`; control `user-select` to `none`.

### Not verified (cannot be, from this environment)

**Android / WebAPK.** Nothing here installed the app on a phone or ran it in standalone mode. Not verified: the Chrome "Install app" entry and the generated WebAPK, the launcher icon and its maskable crop, the splash screen, the status-bar colour, standalone display, the Android back button, real pull-to-refresh suppression, the soft keyboard with the name field and the quest forms, rotation on a device, real haptics and sound, finger dragging, and persistent-storage grants for an installed app. No Lighthouse run was possible or meaningful: Lighthouse removed its PWA category in v12, so installability is covered by the manifest/worker/icon/HTTPS requirements, checked above. A short device checklist is below.

## Manual device checklist (Android Chrome, HTTPS)

1. Open the Netlify URL. Wait for the page to load (a few seconds for the shell to be cached).
2. Chrome menu → **Install app** (not "Add to Home screen" shortcut). Check the launcher icon, the splash and that it opens standalone.
3. Airplane mode. Open the installed app: Home loads, the OFFLINE marker shows. Visit every tab, complete a quest, rename, create/archive a quest, a Weekly goal. Close and reopen: all still there.
4. Rotate the phone in each screen; open the name field and a quest form with the keyboard.
5. Deploy a new build, reopen the app online, wait for the notice, test LATER, then RESTART; confirm progress is unchanged.
6. Scroll a long list upward past the top: the app must not reload.

## Decisions recorded

D1 hand-written worker plus a local Vite plugin, no dependency · D2 Netlify, root path · D3 **no Backup UI in Phase 12** (follow-up below) · D4 name `SYSTEM — Quest Tracker` / `SYSTEM` · D5 **no orientation lock** · D6 the original icon direction above · D7 native install UI only · D8 persist silently, **no visible storage status** · D9 **no reset button** · D10 `RESTART` / `LATER`, LATER for the session, never a forced reload.

## Follow-ups

1. **High priority: a Backup/Restore UI.** Local backups are the real protection against browser or site-data loss (Android may evict storage; `persist()` is best-effort and an installed app is only less likely to lose it). The export/import functions, schema 5 and the checksum already exist; what is missing is the screen, a backup-reminder strategy, and a human-readable message for `checksum_unavailable` on a non-secure origin. A restore is a destructive full replace and deserves its own phase and review.
2. Real Android/WebAPK QA (the checklist above), including the keyboard, rotation, back button and haptics.
3. Optional later: an in-app install row (declined for V1, D7).
4. The main JS chunk (522 kB as Vite reports it) is still above Vite's 500 kB advisory; splitting it is not Phase 12 work.
