# Polish / Performance (Phase 14)

Phase record, written 2026-10-06. Baseline: `main` at `27a96ac` (Phase 13 closeout). The owner approved a deliberately **small** phase: measure first, then a short list of polish fixes and the removal of an unused dependency. **No gameplay rule, no schema (IndexedDB is still v5, the backup still 5), no PWA/update behaviour and no feature changed. No dependency was added; one was removed.**

## Summary

| Area | Result |
| --- | --- |
| Polish fixes | 5 approved items done, plus **one** found by the populated Weekly pass (see "Found by the Weekly pass"). |
| Dependency | `framer-motion` (and its two packages `motion-dom`, `motion-utils`) removed; zero source usage was confirmed first. |
| Performance | Measured before and after with an interleaved A/B: **no regression**. Startup is independent of history size; the one history-scaling cost (quest tap) is documented and deferred by the owner. |
| Tests | 2,302 → **2,308 passing + 1 `todo`**, 125 → 126 files. |
| Gates | `lint`, `typecheck`, `test:run`, `build` and `verify:pwa` (35 checks) pass. |
| Bundle | main JS 524.32 → 524.64 kB (gzip 155.40 → 155.81); shared chunk 60.60 → 60.63; CSS 45.45 → 45.12 kB; precache 15 files, 732.9 KiB raw (unchanged), 279.7 → 280.1 KiB gzip. |

## What changed

1. **A new screen starts at the top.** Before: scroll Status down, tap Quests, and the page landed part-way down Quests with its heading off-screen (measured: 1,800 px on Status gave 416 on Quests, 400 on Home gave 358). Going **Back** was worse: the browser restored the old position against a half-loaded screen (428 px down). Now `usePageChrome` (mounted by `AppShell`, `src/components/layout/pageChrome.ts`) scrolls to the top when the **path** changes, and turns off the browser's own scroll restoration (`platform/page.ts`: `takeOverScrollRestoration`, `scrollToTop`). The first render, a query-only change and re-opening the same path leave the scroll position alone, so a quest tap on Home never moves the page. Verified in a real browser: tab taps and Back both land at 0.
2. **Per-screen document titles** (WCAG 2.4.2; also what the installed app shows in recent apps). Each route in the table carries `handle: { title }` (`RouteHandle`); the page title is `Quests — SYSTEM`, `Home — SYSTEM`, `New Quest`, `Edit Quest`, `Weekly`, `Weekly Goals`, `Weekly History`, `Daily Report`, `Status`, `Daily History`, `Achievements`, `Page not found`. The static `index.html` title (`SYSTEM — Quest Tracker`) stays for the startup, Awakening and crash screens. No quest name or player name is ever put in a title.
3. **SYSTEM-style 404.** The not-found screen now uses the same `[ SECTION LABEL ]` h1, the shared primary button and `system-focus` as every other screen (it was a plain heading with a hand-written button and a different focus ring).
4. **Daily Report date.** "Provisional: 2026-10-06 is still in progress" now reads "Oct 6, 2026" through the existing `formatDateKey`.
5. **Dead code removed:** `achievementsSummary` (`features/presentation/entryText.ts`, no caller anywhere). `BUTTON_DANGER` turned out not to be dead once the shared styles were reused (below), so it stays and is now used.
6. **Shared button styles reused where they were hand-copied:** the three recovery screens in `StartupScreens` (Reload, Retry, Home) use `BUTTON_PRIMARY` / `BUTTON` with one size override (`min-h-12 min-w-32 px-6 text-base`), and `ArchiveConfirmation` uses `BUTTON` / `BUTTON_DANGER` instead of its own local copy. The only visible difference is a semibold label and, for Cancel and Home, the shared raised-surface fill. Other hand-written buttons (the quest form, weekly editor, report link, overlays) were left alone on purpose (a different size or weight; not worth the churn).
7. **`framer-motion` removed** (`npm uninstall`): `package.json`, `package-lock.json` (3 packages; `tslib` became dev-only because only `framer-motion` needed it at runtime), the stale `'framer-motion'` entry in the ESLint UI-package list, and the stale doc lines (`MASTER_SPEC` §3.1 and §3.2 layer D, `FOUNDATION`, `VISUAL_SYSTEM_AND_ORDERING`, `QA_HARDENING`). It was never in `dist/`, so users see no difference; 11.5 MB less in `node_modules`.

### Found by the Weekly pass

At **320 dp** the big score in the Weekly cards wrapped onto two lines ("10 /" over "10") next to "3 / 3 goals complete" (Weekly History cards; the active card would do the same at a 10/10 score). The row is now `flex-wrap` with the goal count on the right (`ml-auto`), so the goal count drops under the score instead of the score being squeezed. It is not in the original approved list; it is two classes in two components, found by the pass the owner asked for, and easy to revert. The 72-scan layout comparison below shows no overflow at 200% text.

## Measurements

Production build, headless Chrome driven over the DevTools protocol, 360×800 mobile emulation at 3× pixel ratio, CPU throttled 1× / 4× / 6× (4× to 6× approximates a mid-range phone). The data was built by driving the real app with a shifted clock: **180 days** (846 ledger rows, 1,086 occurrences) and **540 days** (2,350 ledger rows), plus **six finished Weekly boards and one active board** created through the real UI. Throwaway scripts in the session scratchpad; nothing was added to the repo.

**Correction to the kickoff report.** The kickoff's "warm (service-worker cache)" numbers were **HTTP-cache-warm** loads: headless Chrome could not open Cache Storage under the very long profile path, so no service worker ever installed. A real SW-controlled launch also pays worker start-up and was **not** measured. The comparison below is unaffected (both builds were measured the same way), and the SW/WebAPK launch remains part of the deferred physical-phone pass.

**Machine noise.** The test laptop varies by 2× to 4× between runs (power state and other apps), so only the **interleaved A/B** is trusted: the baseline build (`27a96ac`) and the Phase 14 build are served by one static server on one origin and measured alternately on the same profile, 4 to 5 rounds each.

| Measured at the 540-day dataset (ms, median of per-round medians) | baseline | Phase 14 |
| --- | --- | --- |
| Home content, 1× CPU | 46 | 45 |
| Home content, 4× CPU | 197 | 203 |
| First contentful paint, 4× | 136 | 140 |
| → Quests tab, 4× | 44 | 50 |
| → Status tab, 4× | 175 | 175 |
| → Achievements tab, 4× | 126 | 118 |
| *same, laptop in its slow state (another run)*: Home 4× / Status 4× | 793 / 593 | 737 / 566 |
| Quest tap to completed row, 4× (later taps, 5 rounds, slow state) | 588 | 597 |

All differences are inside the run-to-run spread (a +6 ms on Home at 4× in one run reversed in the next). **No regression.** For orientation, the quiet-machine baseline session measured Home content at 48 ms (1×), about 190 ms (4×) and about 300 ms (6×), a Status tab of 95 ms (4×, 846 rows) and 120 ms (2,350 rows), and a tap of 125 to 190 ms at 4×.

Other checks (unchanged by this phase, re-confirmed where the code was touched):

- **Startup does not scale with history** (identical at 180 and 540 days). Home reads only the ledger and daily-chain tips.
- **No layout shift** on any navigation (CLS 0), **no animation running at idle**, and **zero console warnings or errors** on all 11 routes (Weekly included).
- **OS reduced motion**: effects switch to `data-fx="reduced"` and no animations run; normal mode runs 4 finite animations for a completion. A real Level Up overlay (aura, sweep, particles) holds about **60 fps** (p95 frame 16.8 ms) at 4× and 6×.
- **Route splitting** would still save under about 5 ms at 4×: only 24% of the main bundle's bytes run at Home startup and 36% after visiting every screen, and all non-Home screens together are about 12% of the bytes. Phase 13's "no splitting" holds. `tailwind-merge` is 26.7 kB (the shadcn `cn` convention) and was left alone.

### Deferred by the owner (recorded, not changed)

- **Quest tap latency grows with history.** After each completion `completionPresentationEvents` re-reads the whole ledger, daily summaries and boards to derive achievements, and the completed row is shown only afterwards (`AppRuntimeProvider.completeQuest`; this ordering is deliberate: the HUD hold). Measured: tap to completed row at 4× is about 70 to 150 ms at 846 rows and 125 to 190 ms at 2,350 rows; roughly half is the history read (a raw IndexedDB read of 2,350 + 540 rows is about 49 ms at 4×). Extrapolated, it is still about 500 ms at 4× only after roughly 5,000 rows (about 5 years at six quests a day). **Decision: do not touch the Phase 10 ordering for a hypothetical scaling issue.** Revisit if the ledger approaches that size.
- **OD-04 (final Daily Message catalog)** stays open (the mechanism and a 40-line starter catalog exist).
- **No compact landscape navigation** (at 800×360 the 56 px nav leaves about 304 px of content).
- **No code splitting.**

## Verification

- `npm run lint`, `typecheck`, `test:run` (**2,308 passing + 1 `todo`**, 126 files), `build` and `verify:pwa` (35 checks, build id recomputed) pass.
- New tests (`src/app/pageChrome.test.tsx`, 6): the title for every route and the not-found screen, the fallback for a missing or malformed handle, scroll reset on a path change and on Back, no reset on first render / query-only change / same path, and scroll restoration taken over. Updated: `routes.test` (the 404 is the page's one SYSTEM h1 inside the app frame), `HomeLifecycle.test` (the report shows `Oct 5, 2026`, never the key). `src/test/setup.ts` stubs `window.scrollTo` (jsdom only logs "not implemented").
- **Layout comparison, baseline vs Phase 14, 72 DOM scans** (every route at 360×800, 320×568, 800×360 and 568×320, and at 200% root text at 360 and 320): **0 horizontal overflow, 0 touch targets under 44 px, results identical between the builds.** One off-screen element pair remains **in both builds**: at **200% text and 320 dp**, the "Missed · 0 / 4 pts" lines in the Weekly History goal results extend past the viewport. Pre-existing and not touched (it needs a missed goal in a history card at the largest text size).
- **Visual passes** (screenshots on populated data). Weekly, after the changes: the active board (a manual and a linked goal, rewards, last result with CLAIM REWARD), the Weekly editor with a saved board, and Weekly History with six finished weeks, at 360 and 320 dp and Weekly / Weekly History in landscape (800×360). Also reviewed at 360 dp (Home, Quests, New Quest, Status, Daily History, Achievements, 320 dp Home/New Quest/Weekly editor, landscape Home/Quests) on the baseline build during the kickoff; those screens are untouched by this phase. Re-shot after the changes: the Daily Report, the 404 and a forced startup-error screen (the shared buttons). Every route in every viewport was also covered numerically by the layout scan above. The only defect found was the 320 dp score wrap.

## Known follow-up

- **Weekly History overflow at 320 dp and 200% text.** At the largest text size on the narrowest phone width, the "Missed · 0 / 4 pts" lines in the Weekly History goal results extend past the viewport. It is **pre-existing** (identical in the Phase 13 build), found by the Phase 14 layout scan, **not fixed** in this phase by the owner's decision, and needs a finalized week with a missed goal to reproduce. Phase 13's 200% sweep did not cover it for that reason. Fix in a later polish pass (let the points text wrap inside the goal row).

## Observations left alone

- `formatDateKey` exists twice (`displayLabels.ts` and `quests/recurrenceSummary.ts`); `difficultyName` is used only by a test.
- The Home streak tile is half empty beside the TODAY tile, and Status shows the player name twice (Player row and IDENTITY panel). Cosmetic and content-owned.
- The "66% · Incomplete" label for a day still in progress is a MASTER_SPEC wording rule.
- A back-navigation lands at the top of a screen rather than where the player was; that is deliberate (a screen's content arrives after the page, so restoring was unreliable).
- Sound tones and haptic feel cannot be judged until the physical-phone pass (still deferred until after this phase).

## Closeout edits still pending (not done: the owner said not yet)

`CLAUDE.md` (the "Framer Motion for animation" tech line and the Phase 14 status entry), `docs/CURRENT_STATE.md` (the Phase 14 entry and the `framer-motion` sentence, the test baseline 2,308 + 1 todo in 126 files) and the Phase 14 status in `docs/PHASE_PLAN.md`. OD-04's "Needed by: Phase 14" in `docs/OPEN_DECISIONS.md` should be re-targeted when the owner decides when to take it.

## Files

New: `src/components/layout/pageChrome.ts`, `src/app/pageChrome.test.tsx`, this document. Production: `src/app/routes.tsx`, `src/components/layout/AppShell.tsx`, `src/platform/page.ts`, `src/pages/NotFoundPage.tsx`, `src/features/report/ReportPage.tsx`, `src/features/presentation/entryText.ts`, `src/app/StartupScreens.tsx`, `src/features/quests/ArchiveConfirmation.tsx`, `src/features/weekly/ActiveBoardCard.tsx`, `src/features/weekly/FinalizedWeekCard.tsx`. Tooling and packages: `package.json`, `package-lock.json`, `eslint.config.js`. Tests: `src/test/setup.ts`, `src/app/routes.test.tsx`, `src/features/home/HomeLifecycle.test.tsx`. Docs: `FOUNDATION.md`, `MASTER_SPEC.md`, `QA_HARDENING.md`, `VISUAL_SYSTEM_AND_ORDERING.md` (stale `framer-motion` lines only).
