# QA / Hardening (Phase 13)

Phase record, written 2026-10-05; approved by the owner 2026-10-06. Baseline: `main` at `a2d62f0` (Phase 12 closeout). This phase made the existing app reliable; it added **no feature**, changed **no game rule**, and changed **no schema** (IndexedDB is still v5, the backup still 5). No dependency was added.

Every Android result below is labelled **emulator**: real Android 16 (API 36) and real Android Chrome 133 on a Pixel-like AVD (`Medium_Phone_API_36.0`), driven through adb and Chrome's devtools socket. It is not a physical phone. What an emulator cannot show is listed in "Not verified".

## Summary

| Area | Result |
| --- | --- |
| Test-suite stability | The five known flaky tests **and two more nobody had listed** (`offline.test` midnight, `ExpProgressBar` count-up), plus two more at-risk tests (one of them **vacuous**); every cause proven; see "Test stability". |
| Production defects fixed | **5** (no error boundary, pull-to-refresh on Android, Chrome Translate, text-resize overflow, a 320 dp chip word-break). |
| Defects reported, not changed | 3 (a default-quest identity gap in accepted backups, a blank page when a chunk is missing offline, the static document title). The backup gap is **deferred by the owner to the Backup/Restore UI** (`it.todo` kept). |
| Tests | 2,271 → **2,302 passing + 1 `todo`**, 120 → 125 files. |
| Final stability (default workers) | full suite **15 of 15 runs clean**; the eleven formerly flaky files **30 of 30 clean**. Overload (100% workers) still loses starvation timeouts in the heaviest flows (information only). |
| Gates | `npm run lint`, `typecheck`, `test:run`, `build` and `verify:pwa` pass. |
| Bundle | main JS 522.9 → 524.4 kB (+1.5 kB: the crash screen). |

## Test stability

### Method

A flake is only "fixed" if its **cause is proven**, not if it stops appearing. Each fix was proven by an **amplifier**: a temporary, uncommitted change that makes the race happen every time (a delayed listener or effect). The old test must fail under it and the new test must pass. Then repeated runs corroborate (see "Repeated-run results").

Before the fixes, the same eight files run ten times in isolation with nothing else running failed in **4 of 10 iterations**; a full run at 100% workers failed once; one of three default full runs failed (that run overlapped diagnostics, so it was discounted but later reproduced).

### Findings

| Test | Class | Root cause (proven) | Fix | Layer |
| --- | --- | --- | --- | --- |
| `offline.test` "returning after midnight reconciles the missed day" (**new**) | listener race | `findBy*` resolves on the DOM mutation; `useDaySync` attaches its `focus` listener in a passive effect that can run later, so the event is **lost** (5 s wait, `[]`). | `src/test/resume.ts`: tracks the app's resume listeners; `resumeApp()` waits for "the app is listening", then delivers the event. | test harness |
| `HomeLifecycle` "resume reconciles", "clock catches up" ×2, `WeeklyEditor` "clock behind", `WeeklyPage` clock-behind | same | same | all use `resumeApp()` (WeeklyPage's private spy was replaced by it) | test |
| `HomeLifecycle` "a same-day resume changes nothing" | same, **vacuous** | with no listener attached the "nothing changed" assertion passes without proving anything | `resumeApp()` makes it a real result | test |
| `AwakeningFlow` "moves focus to the control that matters" | effect timing | focus is set in a passive effect after the control appears; the test asserted at the instant it was found | `waitFor(toHaveFocus)` per stage (same assertion) | test |
| `PresentationFlow` "live Perfect Day" | transient state | the popup is visible for 80 ms (`QUICK`) and the test awaited the Daily Report first; popups queue **FIFO** ("FIRST QUEST" is first) | only the `perfect_day` popup stays up; the rest keep draining | test |
| `SystemSettingsPanel` haptics switch | controlled input, stale DOM | the panel's store subscription effect was still pending at the first click, so the checkbox showed the old state and a second click toggled that (diagnostic: store `false`, DOM `checked=true`, same connected node) | wait until the switch shows the new state before the second click (also asserts the UI) | test |
| `ExpProgressBar` count-up (**new**) | clock origin | jsdom stamps animation frames on **its window clock** (starts at window creation) while `useCountUp` measures against `performance.now()` (process clock): a constant offset of about 0.9 s idle, **more than the 5 s wait under heavy contention**. The test took 945–994 ms for an 80 ms animation. | `setup.ts` stamps frames with `performance.now()`, as real browsers do: 104–117 ms | test harness |

Amplifier results: resume tests, old 4 failed / new 72 of 72 pass; Awakening focus, old fails / new passes. Typing and scramble effects share the clock-origin fix.

**Found by the repeated full-suite runs themselves** (none was on any list; the first ten default full runs failed in 3 of 10, all in tests below):

| Test | Root cause | Fix |
| --- | --- | --- |
| `AppErrorBoundary.test` "crash screen" (**my own new test**) | it asserted the `console.error` that the crash screen logs from a passive effect, the instant the screen appeared | `waitFor` the log |
| `shellNotices.test` "LATER lasts for the session" (Phase 12) | the notice follows the update store through a subscription that attaches in an effect; the click was asserted before it flushed (same class as the haptics switch). Two more store-driven assertions in the file had the same shape. | wait until the notice shows / is gone / the button reads RESTARTING... |
| `QuestReorder.test` "Home reflects a reorder made on the Quests screen" | the stored order is committed a moment before the app adopts the refreshed Home state, so Home briefly shows the old order | wait until Home reflects it (no reload involved) |
| `HomeLifecycle.test` "the midnight timer finalizes the day" | the test moved the clock to Tuesday noon right after Home appeared; if the timer-arming effect had not run yet, `arm()` computed its delay from the *advanced* clock (about 12 h), so no tick came. Proven with an amplifier that delays the whole effect pass: as written 3 of 3 fail, with the fix 3 of 3 pass. | `appIsListeningForResume()` first (the timer is armed by the same effect pass as the listeners) |
| `PresentationFlow.test` "live Perfect Day" | still the test most exposed to a loaded machine (six UI round trips of setup) | the five prayers are played through the application layer; only the last completion is under test |

**Overload is a different thing.** With a deliberately oversubscribed machine (8 busy processes on 12 cores, or `--maxWorkers=100%`), a different set of tests fails: `PresentationFlow`, `HomeLifecycle`, `WeeklyEditor`, `WeeklyPage`, `QuestReorder`, `offline.test`. Those are **starvation timeouts of the heaviest end-to-end flows** ("Unable to find heading ... within 5 s", "Test timed out in 20000ms"), in clusters inside one run, not races. The project caps workers at 50% for exactly this reason (Phase 10), and that is the supported configuration; overload runs are reported as information only, and no timeout was raised.

## Production defects fixed

Each was found by probe or on the emulator, fixed minimally, and has a guard where jsdom can show it.

1. **No error boundary.** Probe: a render error in a screen showed React Router's developer page ("Unexpected Application Error!" with a stack trace, no controls); outside the router the page was **blank**. Fix: `AppCrashScreen` (SYSTEM styled, `role=alert`, **Reload** and **Home**), used as the root route's `errorElement` (`RouteErrorScreen`) and by `AppErrorBoundary` around the whole app. Never reloads by itself; nothing is deleted or reset; the error is logged, never shown. Home is a plain link because an installed app has no address bar. `src/app/AppErrorBoundary.test.tsx` (6).
2. **Pull-to-refresh reloaded the installed app (emulator).** `overscroll-behavior-y: none` on `html` alone did **not** stop it (a downward swipe at the top changed `performance.timeOrigin`, navigation type `reload`); on `body` as well it does (A/B on the device, three swipes, no reload). Fix: the rule on `body` too. `src/styles/overscroll.test.ts` guards both selectors. **This corrects the Phase 12 claim** (`docs/PWA_ANDROID_OFFLINE.md`: "on `html`"), which had only been checked on desktop.
3. **Chrome Translate rewrote the page (emulator).** It translated quest names ("Dhuhr" became "Noon", "Sleep before 00:00" became "Source...") and wraps text nodes under React. Fix: `translate="no"` on `<html>` plus `<meta name="google" content="notranslate">`; verified (no translated markers, names intact). `src/app/indexHtml.test.ts`.
4. **Text-resize at 200% overflowed (browser pane, then the device).** Quests pushed Archive off-screen (58 px), the Weekly progress stepper and points stepper pushed "+" off-screen, the bottom nav was wider than the viewport, the Home weekly card text overflowed. Fix: the quest row actions wrap; the −/+ buttons stop growing past 56 px; nav labels stop growing at about 145%; the card text has a width cap; the progress input can shrink. Verified clean at 100%, 150%, 200% at 360 and 320 px (all 11 routes) and on the device at 360 and 320 dp. No change at 100%.
5. **"Scheduled" broke mid-word at 320 dp (emulator).** Chip padding is tighter only below 360 px (`px-2 min-[360px]:px-3`). A scan of every route at 320 dp finds no mid-word break.
## Reported, not changed

- **Backup accepted a damaged default quest.** The fuzz (below) found one class: a signed backup whose default quest `tpl_seed_*` has a changed `seedKey` or `id` is **accepted, restored and valid**, but startup then tries to seed it again, collides with the occupied id and fails with the startup error screen on **every launch**. `ensureSeed` deliberately reports an occupied id as an error. It needs a deliberately re-signed file (the checksum catches accidents), so the risk is low, but the failure is permanent. **Decision (owner, 2026-10-06): DEFERRED, unresolved.** It will be fixed when the Backup/Restore UI is built; **no backup, validation or startup logic was changed in Phase 13.** The options then are to reject such a file in validation (seed ids must carry their seedKey) or to make seeding tolerant. It stays recorded as `it.todo` in `src/application/backupAudit.test.ts`, and the fuzz there declines exactly that one mutation (13 of 2,000) so it keeps hunting for others.
- **Blank page when an app chunk is missing from the cache while offline** (artificial: browsers evict a whole origin, not one entry; online it self-recovers through the network). Recorded in the recovery notes; no code.
- **The document title never changes per screen** (WCAG 2.4.2, minor). Each page has one `h1` and the nav marks the current tab.

## Audits that found nothing wrong

- **Lifecycle and data integrity** (`src/application/hardening.test.ts`, 12 tests, direct database assertions): 12 simultaneous taps award once; all six quests ×3 taps give 6 awards and an exact ledger; a completion at 23:59:59.999 counts and at 00:00:00.000 is refused until the day is synchronized; create/edit/archive/restore/reorder/complete all at once keep unique sort slots and one occurrence per quest-day; a stale reorder is refused; ten days away with six windows waking at once finalizes each day exactly once and a repeat changes nothing (byte-identical dataset); the 25-hour and 23-hour daylight-saving days lose and repeat nothing; a backward clock refuses every change and writes nothing; travelling west pauses until the local date catches up (documented OD-22 behaviour); three weeks away with four windows waking finalizes the board once, one bonus row, nothing for empty weeks; five simultaneous reward claims record one claim and no EXP; a finalized week refuses stale edits.
- **Backup engine** (`src/application/backupAudit.test.ts`, 7 tests): a three-week real life restores byte-for-byte; the checksum-unavailable path is typed and writes nothing (it was untested); a file cut off at ~160 positions is always rejected; one changed character at ~400 positions is refused or changes nothing that matters; a rejected file changes nothing; **2,000 seeded mutations** with the checksum re-signed: 1,455 rejected with a typed reason, 532 accepted and every one restored, integrity-valid, started and loaded every screen's reader, 13 declined (the gap above).
- **Startup / Awakening**: existing coverage was already deep; two cases added (double CONFIRM/BEGIN saves once, seeds once; a backgrounded page does not advance onboarding).
- **Privacy**: the only `fetch` in shipped source is the worker fetching its own shell; no XHR, WebSocket, beacon, `innerHTML` or `eval`; no external URLs; no tracked secrets.

## Responsive, touch and accessibility (browser pane, populated fixture)

A fixture built through the app's own use cases (RTL name, 80-character titles, 21 finalized days, three weekly boards, a ten-goal board with maximum-length text): **360×800, 320×568, 568×320, 800×360, 1280×720, plus 280 and 240 px**, 11 routes each. No horizontal overflow, nothing off-screen, no touch target under 44 px, last item clear of the nav; the desktop layout is a centred 448 px column. Structure: one `h1` per route, every control named, no dangling `aria-labelledby`/`aria-describedby`, no duplicate ids, one `main`, labelled `nav`. **Contrast**: every text element on 11 routes meets AA (lowest 6.82:1, translucent backgrounds composited). **Keyboard**: all 268 focusable controls show a visible focus indicator.

## PWA, offline and update

Desktop (`vite preview`, localhost, **three builds**): the waiting update showed the notice; a newer build superseded it (three caches coexisted until activation); the stored-data fingerprint never changed; a second window made RESTART show `OTHER SYSTEM WINDOW OPEN` with the old build, caches and data untouched and no reload; after closing it RESTART reloaded **once**, activated the new build and deleted the other caches; offline cold load of a deep route worked; a quest completed offline wrote one ledger row; failed update checks produced no unhandled rejection. **Emulator**: the same update flow with a real touch on RESTART (78×44 CSS px), data fingerprint identical, old cache deleted.

## Android emulator checklist

| Item | Result |
| --- | --- |
| Chrome installability | Chrome reports **no installability errors**; manifest parsed cleanly. (Served on `localhost`, a secure context; an HTTPS origin was not tested.) |
| Install | Chrome's Install dialog, then a launcher pin; opens in Chrome's `WebappActivity`, `display-mode: standalone`. **No WebAPK package was minted** (needs Google's server and a real origin): a real WebAPK is still open. |
| Launcher icon | Shows the app's own artwork, cleanly framed by the launcher mask. **Maskable crop of a WebAPK not verified.** |
| Status bar | Dark, matching the theme (`#07060d`). |
| Back button | `/` → `/quests` → `/weekly`, Back retraces; Back on Home leaves the app. |
| Soft keyboard | Awakening name field (real Gboard): field and ring visible, CONFIRM/SKIP below the keyboard; the visual viewport pans to them (verified by a swipe) and Enter submits. Quest editor at 320 dp: typing works and the page is scrollable, so Create Quest can be reached (a real scroll gesture was not exercised). **The weekly editor with the keyboard was not tested on the device.** |
| Widths and rotation | 412, 360 and 320 dp portrait, landscape: 10 routes clean each (also at 200% root text for 360 and 320 dp). |
| Real touch | ACCEPT 159×48, quest rows 380×68, drag handles 44×44, tabs 103×56 (CSS px). One tap awards once; **three simultaneous taps award once**. |
| Drag reorder | Finger drag moved Fajr to position 2, persisted with unique slots, announced "Fajr moved to position 2 of 6." |
| Pull-to-refresh | Reproduced, fixed, verified (defect 2). |
| Offline | Server stopped and Chrome killed: a cold process loaded a deep route from the cache; a quest completed offline (ledger row 4, total 40) survived another cold restart. **The installed app's own cold restart was not completed**: the emulator launcher removed the pinned icon after Chrome's process was killed. |
| Background / sleep | Device sleep and wake with the app open: same document, `hidden` then `visible`, no crash or reload. |
| Haptics | The app calls `navigator.vibrate([15])` on a real-touch completion and Chrome returns `true`. **The feel is not verifiable here.** |
| Sound | Off by default (0 oscillators created). **Not enabled or listened to.** |
| Storage | `persisted()` is `false` on `localhost` (quota about 3.5 GB). The `persist()` result for an installed HTTPS app is open. |

Startup on the emulator (an accelerated x86 desktop CPU, **indicative only**): first contentful paint 0.58 to 1.22 s (the first run included Chrome's cold start), DOM content loaded 0.39 to 0.72 s, the main script served from the worker cache in 48 to 82 ms.

### Not verified (needs a physical phone)

HTTPS install and a real **WebAPK** (maskable crop, splash, status-bar colour from the WebAPK), Chrome's real storage-persistence grant, haptic feel, audible sound, finger-feel and performance on phone hardware, OEM battery/storage eviction, long-running background/doze, the weekly editor's keyboard, TalkBack, a notch/cutout, the installed app's own cold restart.

## Performance (measured before touching anything)

Startup JS about 584 kB (main 524.4 kB / 155.4 gzip, shared 60.6 kB); CSS 45 kB; precache 15 files about 731 KiB raw / 279 KiB gzip. The main chunk by source map: react-dom 202 kB (39.5%), react-router 90 kB (17.6%), persistence 42, weekly 28, quests 27, application 27, domain 16, app 12, presentation 12, status 12, home 10, lucide 8. **Every non-Home screen together is about 72 kB (about 12% of startup JS).** Because the shell is precached, download size is paid once, and the emulator numbers above are small; splitting would add chunk-failure paths for a small gain. **Recommendation: no code splitting now.** `framer-motion` was installed and unused (not bundled), untouched as agreed; Phase 14 removed it.

## Repeated-run results

All runs on a quiet machine, vitest default workers (`maxWorkers: '50%'`, the supported configuration) unless stated. The runner is a throwaway loop kept in the scratchpad, not in the repo (see Follow-ups).

| Stage | Isolated flaky files | Full suite (default workers) | Full suite at 100% workers (overload) |
| --- | --- | --- | --- |
| Before any fix | 7 files ×10: **4 of 10 iterations failed** (offline midnight ×2, Perfect Day, haptics) | ×3: 1 failed (overlapped diagnostics) | ×1: 1 failed (`ExpProgressBar`) |
| After the first fixes | 8 files ×30: **0 of 30** | ×10: **3 of 10 failed**, all in tests nobody had listed (`AppErrorBoundary` ×2, `shellNotices`) | ×3: 2 of 3 failed |
| **Final (this tree)** | **11 files ×30: 0 of 30** | **×15: 0 of 15** (about 2,300 tests each, 138 to 166 s) | ×3: 2 of 3 clean; the failing run lost 3 starvation-timeout tests (`HomeLifecycle` Sleep report, two `WeeklyPage` steps) |

Eleven files in the final isolated set: `AwakeningFlow`, `PresentationFlow`, `SystemSettingsPanel`, `WeeklyEditor`, `HomeLifecycle`, `offline`, `WeeklyPage`, `ExpProgressBar`, `AppErrorBoundary`, `shellNotices`, `QuestReorder`.

Honest limits of this evidence: 0 of 15 bounds the true failure rate of a full run under about 18% at 95% confidence (0 of 30 under about 10%); the **amplifier proofs above, not these counts, are what show each cause is gone**. The measurement also showed that fixing the listed flakes was not enough: three more surfaced only in repeated full runs, and a fourth (`HomeLifecycle` midnight) after that. Others of the same class may exist at rates too low to have appeared in the roughly 30 full runs; the diagnostic recipe (an amplifier that delays an effect pass, then `waitFor` the observable consequence) is in this document for the next one.

## Files

New: `src/test/resume.ts`, `src/app/AppErrorBoundary.tsx`, `src/app/AppErrorBoundary.test.tsx`, `src/app/indexHtml.test.ts`, `src/application/hardening.test.ts`, `src/application/backupAudit.test.ts`, `src/styles/overscroll.test.ts`. Production changes: `src/app/App.tsx`, `src/app/routes.tsx`, `src/app/StartupScreens.tsx`, `index.html`, `src/styles/globals.css`, `src/components/layout/BottomNav.tsx`, `src/features/quests/QuestRow.tsx`, `src/features/quests/FormControls.tsx`, `src/features/weekly/WeeklyGoalItem.tsx`, `src/features/weekly/WeeklyBoardForm.tsx`, `src/features/home/WeeklyCard.tsx`. Test changes: `src/test/setup.ts`, `src/test/renderApp.tsx` (an optional `routes`), and nine existing test files (`AwakeningFlow`, `PresentationFlow`, `SystemSettingsPanel`, `WeeklyEditor`, `WeeklyPage`, `HomeLifecycle`, `offline`, `shellNotices`, `QuestReorder`). No snapshot, assertion or timeout was weakened: every change waits for an observable condition, or reduces setup work.

## Follow-ups

1. **A real-phone pass over HTTPS** (Netlify): the "Not verified" list above, including a second deployment to exercise the update flow on the phone. **Owner decision (2026-10-06): deferred until after Phase 14; nothing is deployed.**
2. **Backup/Restore UI** (still the high-priority follow-up): fix the default-quest gap above when it is built (deferred by the owner; the `it.todo` marks it).
3. Optional: a per-screen document title (WCAG 2.4.2).
4. **No stress script is committed** (owner decision, 2026-10-06). The procedure is below, for the next time a flaky test appears.

### Stress procedure (documented, not a script)

1. Pick the suspect files. Run `npx vitest run <files>` in a loop, 30 times, on a quiet machine, and keep each run's output; tally the failing test names. For the whole suite, loop `npx vitest run` 10 to 15 times. Use the default workers: that is the supported configuration.
2. To make a failure likelier without changing code, add CPU load (for example eight busy-loop `node` processes on a 12-core machine) or pass `--maxWorkers=100%`. Treat what fails under such overload as **starvation, not races**, unless the failure message shows a lost event or a stale value rather than a timeout.
3. Find the cause before fixing. Read the failure (a 5 s wait ending in an empty result means a lost event; a stale value means the UI had not caught up). Add temporary diagnostics, or an **amplifier**: an uncommitted edit that delays the effect pass in question by about 80 ms. The test as written must fail every time under it.
4. Fix the test (or the harness) so it waits for the real condition (`waitFor` the observable result, or the app's own listener via `src/test/resume.ts`), never with a longer timeout or a retry. Re-run under the same amplifier: it must pass every time. Revert the amplifier (`git status` must show it gone), then repeat step 1.
5. Beware that scripted file edits can silently not match on CRLF files; check that an edit really applied before trusting a run.
