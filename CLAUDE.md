# SoloLevelingTaskList — Permanent Project Instructions

## Project purpose

This is a private, single-user, mobile-first productivity application inspired by RPG/System-style progression interfaces.

Real-world tasks become quests.
Completing quests awards EXP.
EXP increases the player's permanent level.
The application includes streaks, scheduled quests, one-time quests, Goal Crushers, achievements, ranks, history, statistics, and dramatic progression events.

The application is primarily intended for Android/mobile use.

It is NOT currently intended to be:

- a public SaaS product
- a multi-user application
- an App Store product
- a subscription service
- an authentication-based platform

Do not add public SaaS architecture unless a later phase explicitly requires it.

---

## Core technology direction

Unless a later approved phase explicitly changes this:

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn-compatible project structure
- CSS keyframes and small hooks for animation (Framer Motion was part of the original plan but was never needed and was removed in Phase 14; an animation library would need an approved phase)
- Lucide React for icons
- Progressive Web App
- local-first persistence
- IndexedDB for durable application state
- JSON export/import backups

No backend or Supabase is required for the initial product.

---

## Mobile-first requirement

The primary target is a phone.

Design and implementation decisions must prioritize:

- portrait mobile layouts
- touch interaction
- Android Chrome/PWA
- safe areas
- responsive sizing
- battery/performance efficiency
- offline use

Desktop support is secondary.

Do not design a desktop dashboard and then shrink it for mobile.

---

## Visual direction

The interface is inspired by a dark fantasy / futuristic SYSTEM interface.

Visual language:

- near-black backgrounds
- deep purple
- violet
- subtle cyan highlights
- translucent dark panels
- thin luminous borders
- restrained particles
- HUD-style details
- dramatic earned-event animations

The ordinary task-management interface must remain readable and relatively calm.

Heavy effects are reserved for meaningful events such as:

- Goal Crusher completion
- Perfect Day
- Level Up
- Rank Up
- major achievements
- first-launch Player Awakening

Do not run expensive shader/particle effects continuously on ordinary screens.

---

## Reference material

The directory:

`_reference/`

contains read-only reference material.

In particular:

`_reference/solo-leveling-effects-pack/`

contains visual components, effects, reference implementations, styles, and the supplied Player Awakening image.

Rules:

- NEVER modify files inside `_reference/`.
- NEVER treat `_reference/` as application source code.
- Copy/adapt needed components into the real app during the appropriate implementation phase.
- Inspect reference code before recreating something that already exists there.
- Preserve relevant license/attribution requirements.
- The reference components are ingredients, not a mandate to use every effect.

---

## Architecture stability rule

This project will be built in explicit phases.

Treat all completed previous phases as production code.

Do NOT:

- redesign established architecture
- replace working subsystems without instruction
- rename public interfaces unnecessarily
- perform broad refactors because another pattern seems cleaner
- introduce a different framework
- switch state-management/storage architecture casually
- rewrite previously approved components for stylistic preference

When a new phase requires changes:

1. inspect existing implementation first
2. identify dependents
3. make the smallest compatible extension
4. preserve existing functionality
5. update/add tests
6. explicitly report any unavoidable breaking change before making it

Later phases should EXTEND the project rather than repeatedly rebuild it.

---

## Separation of concerns

Keep these areas logically separate:

1. domain/game rules
2. persistence
3. UI
4. animation/effects
5. platform/PWA behavior

Game rules must not depend on UI components.

Persistence must not contain presentation logic.

Animations must not determine whether EXP, streaks, levels, or quest completion are valid.

The visual layer displays results produced by the game/domain layer.

---

## Game-state integrity

Progression data is important user data.

Never award EXP based only on UI state.

EXP transactions, quest completions, streak changes, achievements, and level changes must be deterministic and auditable.

Prevent:

- duplicate EXP awards
- double-tap completion exploits
- duplicate completion records
- accidental level duplication
- invalid streak increments
- scheduled quests affecting days on which they were not scheduled

When practical, progression-changing operations should be atomic/idempotent.

---

## Time and date rules

Daily quests and streaks depend on calendar dates.

Centralize date/day logic.

Do not scatter direct `new Date()` logic throughout unrelated components.

The application must eventually handle:

- local day boundaries
- midnight rollover
- scheduled weekdays
- one-time dates
- missed days
- rest days
- daylight-saving/timezone changes
- reopening after multiple days away

Specific gameplay rules will be supplied in later phases.

Do not invent them prematurely.

---

## Storage rules

IndexedDB will be the durable source of truth for initial local application data.

The app must eventually support:

- schema versioning
- migrations
- backup export
- backup import
- validation of imported data
- recovery/error handling

Do not replace this architecture with localStorage-only persistence.

Small non-critical preferences may use localStorage if appropriate.

---

## Effects and animation rules

Reference effects include components such as:

- BorderTrail
- ParticleCanvas
- SystemAura
- HolographicCard
- HudFrame
- XPProgress
- AnimatedNumber
- TextScramble
- SystemPopup
- LevelUpOverlay
- RankUpOverlay
- DailyStreak

Do not integrate all of them immediately.

Effects will be introduced in a dedicated visual/animation phase.

Support reduced-motion behavior.

Prefer approximately 60 FPS on modern phones, but visual spectacle must never compromise basic task interaction.

---

## Accessibility and interaction

Do not sacrifice usability for theme.

Maintain:

- readable contrast
- semantic buttons
- keyboard support where practical
- ARIA attributes where appropriate
- reduced motion
- adequate touch targets
- visible interaction states

---

## Dependency discipline

Before installing a package:

1. determine whether the project already has equivalent functionality
2. prefer existing dependencies
3. avoid unnecessary libraries
4. explain why a new dependency is needed

Do not install large packages for trivial functionality.

---

## Code quality

Use:

- TypeScript strict typing
- small focused modules
- descriptive names
- testable pure logic for game systems
- reusable UI primitives
- clear domain types

Avoid:

- giant components
- `any` unless unavoidable
- duplicated business logic
- magic numbers scattered across the project
- game rules embedded directly in JSX
- silent error swallowing

---

## Testing philosophy

Important game logic must be testable independently from React.

Critical areas eventually requiring tests include:

- quest recurrence
- scheduled quest eligibility
- one-time quest dates
- completion idempotency
- EXP calculations
- level thresholds
- multi-level gains
- streak calculations
- daily completion percentage
- achievements
- rank thresholds
- backup/import validation
- midnight/day transitions

Do not postpone all testing until the end.

---

## Git / phase discipline

At the end of each implementation phase:

1. run relevant tests
2. run TypeScript/build checks
3. summarize changed files
4. summarize important architectural decisions
5. identify unresolved issues
6. stop and wait for approval

Do not automatically begin the next phase.

Do not push destructive changes without explicit instruction.

---

## Current status

**Phases 00 through 14 are complete and approved.** HEAD before the Phase 14 docs-closeout commit: `01f79ae` (`polish: refine navigation and performance`, the Phase 14 commit).

- **Phase 00** — the master product / architecture specification is complete and authoritative.
- **Phase 01** — the application foundation is complete (React/Vite/TypeScript/Tailwind scaffold, placeholder UI, lint-enforced layer boundaries). See `docs/FOUNDATION.md`.
- **Phase 02** — the pure domain/game engine is complete. `src/domain/` now exists and covers: DateKey/calendar primitives, quest recurrence and eligibility, occurrence snapshots, completion/idempotency, XP transactions, levels and ranks, daily progress classification, and typed domain events. 250 tests pass as of Phase 02. See `docs/DOMAIN_ENGINE.md`.
- **Phase 03** — local persistence is complete. `src/persistence/` implements native IndexedDB persistence (no wrapper library). DB schema v1 currently contains four stores: `questTemplates`, `questOccurrences`, `questCompletions` and `xpTransactions`. Atomic quest completion with XP ledger persistence, backup export/import (full-replace restore) and integrity validation are implemented. The XP ledger is authoritative; total EXP, level and rank are derived from it. 421 tests pass as of Phase 03. See `docs/PERSISTENCE.md`.
- **Phase 04** — the functional mobile UI is implemented. A framework-free application layer (`src/application/`) connects the domain and persistence to React; the `/` (Home) and `/status` (Status) routes exist with bottom navigation. The six approved default quests (five prayers + Sleep before 00:00) seed idempotently; quest completion persists atomically and updates the visible level, rank, EXP and daily progress; a deterministic local Daily Message is implemented. 521 tests pass as of Phase 04. See `docs/CORE_UI.md`.
- **Phase 05** — Quest Management is complete. Create / Edit / Archive / Restore quest flows exist (`/quests`, `/quests/new`, `/quests/:templateId/edit`) for Daily, selected-weekday, Interval and One-Time recurrence. Normal quest EXP remains difficulty-derived only (no custom override). An occurrence that already exists for the current day is a frozen snapshot: edits never change it, and archiving stops future generation while today's existing occurrence stays visible, completable and in the denominator. The app has Home (`/`), Quests (`/quests`) and Status (`/status`) routes. 805 tests pass as of Phase 05. See `docs/QUEST_MANAGEMENT.md`.
- **Phase 06** — Daily Lifecycle is complete. IndexedDB schema is now **v2** (adds `dailySummaries`; backup schema 2). Immutable Daily Summaries are the authoritative record of finalized days and of streaks (no streak cache). Days finalize atomically; midnight/resume/startup reconciliation finalizes every missed date in chronological order; Daily Streak, Best Streak, Perfect Day Streak and Total Perfect Days exist. Sleep completion opens the LIVE/PROVISIONAL Daily Report (`/report`). A backward device clock enters a safe paused state, and every mutating action (completion, create, edit, archive, restore) synchronizes the day first. 912 tests pass as of Phase 06. See `docs/DAILY_LIFECYCLE.md`.
- **Phase 07** — Weekly Goal Crusher is complete. IndexedDB schema is now **v3** (adds `weeklyBoards` and `weeklyRewardClaims`; backup schema 3). One board per Monday→Sunday week (`WeekKey` = the Monday), with weighted goals whose points total exactly 10. Goals are tracked either by a manual numeric count or by the count of one linked quest's completions in the week. Scoring is binary per goal; the weekly bonus EXP is finalized exactly once through the XP ledger, and finalized weekly snapshots (including the exact progress scored) are immutable at the domain, application and persistence levels. Real-life reward claiming exists and awards no EXP. Weekly finalization runs after the daily reconciliation, so catch-up after days or weeks away integrates with the Daily Lifecycle. Navigation is Home / Quests / Weekly / Status (`/weekly`, `/weekly/edit`, `/weekly/history`). 1,244 tests pass as of Phase 07. See `docs/WEEKLY_GOAL_CRUSHER.md`.
- **Phase 08** — Progression / Stats / Achievements is complete. The database remains **IndexedDB schema v3** (no migration). Achievements are **fully derived** from immutable history (XP ledger, Daily Summaries, finalized weekly boards); **no achievement store or unlock row exists**. V1 has **28 achievements, all awarding 0 EXP**. Level continues indefinitely past 100 and the Level 100+ rank displays `???` (internal id `special_100_plus`). Category, quest (Top 3), daily and weekly statistics exist; the Status dashboard is expanded; `/achievements` and `/status/history` (Daily History) exist. Gym-specific achievements remain deferred (OD-18). 1,396 tests pass as of Phase 08. See `docs/PROGRESSION_STATS_ACHIEVEMENTS.md`.
- **Phase 09** — Visual SYSTEM Redesign + Manual Quest Ordering is complete. IndexedDB schema is now **v4** and the backup schema is **4**. `QuestTemplate` has a persistent, unique `sortOrder`: seeded and custom quests can be reordered manually, new quests default to the bottom, edits preserve the order, and archive/restore preserves the quest's previous slot. Home follows the saved order without changing occurrence snapshots. `/quests` supports pointer drag plus accessible Move Up / Move Down. **Oxanium** is bundled locally for SYSTEM/display typography, and the static SYSTEM visual language (design tokens, Panel / SectionLabel / RankBadge / MeterBar primitives) is implemented across the app. 1,534 tests pass as of Phase 09. See `docs/VISUAL_SYSTEM_AND_ORDERING.md`.
- **Phase 10** — Effects / Animations / Event Engine is complete. It is cosmetic: it only presents results the domain already produced, and XP, levels, streaks, scoring and achievement conditions are unchanged. **IndexedDB remains schema v4 and the backup remains schema 4** (no new store, no migration). There is **one centralized, in-memory presentation queue** with **minor / medium / major / critical** classes (first-in-first-out, deduplicated, soft-bounded; nothing replays after a reload). It delivers quest-completion `+EXP` feedback and an animated EXP bar; an **animated EXP/HUD hold** keeps the old level and a full bar across a Level Up until its overlay is open; **Level Up and Rank Up** presentation (one overlay per award; Level 100+ shows `???`); **achievement unlock presentation without seen-state persistence** (an unlock is shown only if the record that unlocked it is one the action just wrote); a **live Perfect Day** moment that never claims finalization; and the **Weekly Goal Crusher finalization spectacle**, tiered by score (only a strict overnight reconciliation of at most 1 day and 1 board is presented; longer catch-up stays silent). Effects are **typewriter / scramble text, finite particles, aura and border light** (CSS plus small hooks; Framer Motion is not used; the overlays are a lazy chunk). Modes are **NORMAL and REDUCED**, and **the OS reduced-motion setting overrides NORMAL**. **Haptics default ON; sound (original, synthesized with Web Audio) defaults OFF.** These presentation preferences are **`localStorage`-only and outside backups**. A **DEV-only `/dev/effects` lab** (synthetic events only) is excluded from production builds. OD-06, OD-07, OD-08 and OD-20 are retired. The Weekly page test flake was stabilized in the test harness (vitest worker cap plus a listener precondition; no production change). **1,766 tests in 96 files pass.** See `docs/EFFECTS_EVENT_ENGINE.md`.
- **Phase 11** — Player Awakening / first-launch onboarding is complete (feature commit `f1d1320`; RTL follow-up `aee0493`). It is identity and presentation only: it never changes EXP, levels, ranks, achievements, quest seeds, weekly logic or streaks. **IndexedDB is now schema v5 and the backup schema is 5.** The new `playerProfile` store holds the one player identity row `{ id: 'player', name, awakenedAt }`, and **row existence is the only "Awakening complete" gate**. A fresh 0→5 database has **no row** and requires Awakening; an existing pre-Phase-11 database receives the legacy-completed row `{ id: 'player', name: null, awakenedAt: null }` (the v5 migration decides from the ORIGINAL upgrade version, `originalFrom`, not the previous step). **`awakenedAt: null` on a migrated row is legacy metadata and NEVER means onboarding is required.** Backups older than schema 5 migrate to the same legacy-completed state. A new player is awakened **before `startApplication`**, so no seed quests, occurrences or reconciliation exist until the identity is saved. First-launch stages: **boot → notice → identify → registering → complete**; **ACCEPT is explicit** and cannot be triggered by the tap or key that finishes the notice animation. The player name is persistent profile data (IndexedDB and backups), **not `localStorage`**: Unicode/NFC, at most 20 graphemes, normalized whitespace, invalid invisible/control characters rejected, `PLAYER` fallback. It can be edited later from Status (IDENTITY panel) without rerunning Awakening or changing progression, and RTL names are bidirectionally isolated wherever they appear (their own `<bdi>` or `dir="auto"` element), including the COMPLETE welcome, which keeps the static `WELCOME,` apart from the name in its own `<bdi dir="auto">`. Awakening reuses the Phase 10 finite effects and obeys reduced motion. The supplied reference image was **not shipped** (unclear provenance/licensing; composition inspiration only). The DEV effects lab has a persistence-safe Awakening preview. **1,982 tests in 106 files** in the final green run. See `docs/PLAYER_AWAKENING.md`.
- **Phase 12** — PWA / offline is complete (feature commit `6bcacf6`, multi-window update-safety fix `d6b05c7`). It is infrastructure only: **no gameplay, EXP, level, rank, achievement, quest, lifecycle, Weekly or Awakening rule changed; IndexedDB is still schema v5 and the backup still schema 5; no npm dependency was added.**
  - **Manifest / install:** name `SYSTEM — Quest Tracker`, `short_name` `SYSTEM`, `standalone`, **no orientation lock** (portrait and landscape both work). Original app-owned icons (192 any, 512 any, 512 maskable, apple-touch) generated reproducibly with local Node tooling (`npm run icons`). Chrome's native install UI only: no in-app install button.
  - **Offline architecture:** a hand-written service worker (`src/sw/`) plus a local Vite shell-precache plugin (`tools/shell-precache/`) cache the **application shell only** (no runtime or API caching). The shell is **atomically precached and validated** (status, same-origin, no redirect, content type: a SPA host's `200 text/html` for a missing file can never poison the cache); the build id covers the worker code and every shell file; SPA navigation fallback works for app routes offline. **IndexedDB stays completely page-owned: the worker never reads or writes it or any progression** (lint, tests and `verify:pwa` enforce this). `_reference/` and the DEV effects lab can never ship (the build fails if they appear).
  - **Updates:** a new build installs **beside** the running one and waits; `SYSTEM UPDATE AVAILABLE [ RESTART ] [ LATER ]`; it **never force-reloads**; the notice is hidden on unsaved-form routes (`/quests/new`, `/quests/:id/edit`, `/weekly/edit`); LATER lasts for the session. **Multi-window protection:** RESTART activates the new build **only if the requesting window is the only open app window**; otherwise nothing changes (no activation, old build and cache intact) and the page shows `OTHER SYSTEM WINDOW OPEN / CLOSE IT TO RESTART`, and RESTART works again once the other window is closed. IndexedDB is unchanged by any update.
  - **Other:** informational `OFFLINE` marker (`navigator.onLine` never gates an action); silent best-effort `navigator.storage.persist()` after `ready` (no visible storage status); pull-to-refresh suppression; a narrow Reload recovery if the Awakening lazy chunk cannot load; Netlify root-path config (`netlify.toml`: SPA fallback, revalidating shell, immutable `/assets/*`); **no user-facing cache-reset button** (recovery is documented instead). `npm run verify:pwa` checks the production build.
  - **Verified:** lint, typecheck, build and `verify:pwa` pass; **2,271 tests in 120 files**. Real service-worker behaviour (offline reload and routes, fresh-database Awakening offline, A→B update, failed install, kill switch, two-window update) was verified in a desktop browser on `vite preview`; **real Android/WebAPK was not**. See `docs/PWA_ANDROID_OFFLINE.md` (the detailed record).
- **Phase 13** — QA / hardening is complete (commit `def66e9`). It made the existing app reliable and added **no feature, no game rule, no schema change and no npm dependency: IndexedDB is still schema v5 and the backup still schema 5.** `docs/QA_HARDENING.md` is the detailed record.
  - **Production fixes (5):** a SYSTEM-styled **root error boundary** (crash screen with Reload and Home, used as the router's root `errorElement` and as an app-level boundary; it replaces React Router's developer page and a blank screen, never reloads by itself and never resets or deletes data); **Android pull-to-refresh** suppression (`overscroll-behavior-y: none` on `body` as well as `html`: `html` alone did not stop the installed app from reloading, which corrects the Phase 12 claim); **Chrome Translate protection** (`translate="no"` plus the `notranslate` meta; Translate had rewritten quest names); **200% text-size overflow** (quest row, weekly steppers, bottom nav, Home weekly card); and the **"Scheduled" chip word-break at 320 dp**.
  - **Flaky-test hardening:** the known flaky tests and several nobody had listed were root-caused (each proven with a temporary amplifier) and fixed **without retries, longer timeouts or weakened assertions** (the shared resume-listener helper `src/test/resume.ts`, the jsdom animation-frame clock origin, effect-timing waits, less UI setup in the heaviest flow). Result at the default worker count: **15/15 full-suite runs clean and 30/30 runs of the eleven formerly flaky files clean**. **No `test:stress` script is committed** (owner decision); the stress procedure is documented in `docs/QA_HARDENING.md`.
  - **New coverage:** lifecycle/data-integrity stress, a backup-engine audit including a 2,000-mutation fuzz, and guards for the crash screen, `index.html` and the overscroll rule.
  - **Android emulator QA completed** (real Android 16 / Chrome 133 on an AVD, **not a physical phone**): install and standalone, status bar, back button, the real soft keyboard on the name field, widths / rotation / 200% text, real touch (three simultaneous taps award once), finger-drag reorder, pull-to-refresh, offline cold load, sleep/wake and the update flow. Unverified (physical phone): an HTTPS install and a real WebAPK (maskable crop, splash), the storage-persistence grant, haptic feel, audible sound, OEM battery/storage eviction, TalkBack, the weekly editor with the keyboard, a notch/cutout and the installed app's own cold restart.
  - **Known gap deferred to the Backup/Restore UI:** an accepted backup whose default quest (`tpl_seed_*`) has a damaged `id` or `seedKey` restores and validates, but startup then collides with the occupied id and fails on every launch. It needs a deliberately re-signed file, so the risk is low. It is kept as `it.todo` in `src/application/backupAudit.test.ts`; **no backup, validation or startup logic was changed**.
  - **Verified:** lint, typecheck, build and `verify:pwa` pass; **2,302 passing tests + 1 `todo` in 125 files**. Main JS grew 522.9 → 524.4 kB (the crash screen); code splitting was evaluated and **not** recommended now.

- **Phase 14** — Polish / performance is complete (commit `01f79ae`, `polish: refine navigation and performance`). A deliberately small phase: **no gameplay rule, no feature, no schema and no PWA/update change; IndexedDB is still schema v5 and the backup still schema 5; no dependency was added and one was removed.** `docs/POLISH_PERFORMANCE.md` is the detailed record.
  - **Polish:** a new screen **starts at the top** (`usePageChrome` in `AppShell`: scroll resets when the path changes and the browser's own scroll restoration is turned off, so Back lands at the top too; `platform/page.ts`); **per-screen document titles** (`Quests — SYSTEM`; each route carries `handle: { title }`); a **SYSTEM-style 404**; the **Daily Report date is formatted** (`Oct 6, 2026`); the **Weekly score row wraps** instead of squeezing the score at 320 dp; shared button styles reused on the recovery screens and the archive confirmation; the unused `achievementsSummary` removed.
  - **`framer-motion` removed** (never imported, never bundled; its stale doc and ESLint-list references too). Animation stays CSS keyframes plus small hooks.
  - **Measured before and after** (interleaved A/B of the baseline and new builds, production build, throttled CPU, 540-day dataset): **no regression**; startup does not scale with history; CLS 0; about 60 fps during a Level Up at 4× to 6× throttle. **No code splitting** (non-Home screens are only about 12% of the main bundle). Main JS 524.32 → 524.64 kB. The kickoff's "service-worker warm" label was really HTTP-cache warm; a real SW-controlled launch is still part of the physical-phone pass.
  - **Deferred by the owner:** the **achievement-derivation / quest-tap latency optimization** (each tap re-reads the whole history to derive achievements before the new state is shown; roughly half of a tap at a year of data; revisit around 5,000 ledger rows; the Phase 10 ordering is deliberately untouched), the **compact landscape navigation**, and **OD-04** (the final Daily Message catalog).
  - **Known follow-up:** at 320 dp with 200% text the "Missed · 0 / 4 pts" lines in the Weekly History goal results extend past the viewport (pre-existing, found by the Phase 14 layout scan, not fixed).
  - **Verified:** lint, typecheck, build and `verify:pwa` pass; **2,308 passing tests + 1 `todo` in 126 files**.

**Phase 15 (optional Android packaging) has NOT started** and needs the owner's explicit go-ahead; do not begin it on your own. The **real-phone / Netlify (HTTPS) pass is still pending** (it was deferred until after Phase 14, which is now complete; nothing is deployed). Stores and fields for later features are added through versioned database migrations in their owning phases. The `_reference/solo-leveling-effects-pack/` directory remains local, read-only, and git-ignored.

**Non-blocking QA notes (for later phases):**

- **Physical-phone QA is still outstanding** (deliberately deferred until after Phase 14, which is now complete; it needs a Netlify/HTTPS deployment; nothing is deployed). Phase 13 completed the **Android emulator** pass only, so a real WebAPK install, the persistent-storage grant, haptic feel, audible sound, finger-feel and performance on phone hardware, OEM eviction, TalkBack and the weekly editor with the keyboard are still unverified (the full list is in `docs/QA_HARDENING.md` and `docs/CURRENT_STATE.md`). Finger-drag reorder was verified on the emulator; desktop width (1280×720, a centred 448 px column) was verified in Phase 13.
- **Phase 10 / 11 device QA:** the synthesized sounds have **not** been listened to and haptic **feel** (the Phase 10 cues and the `awakening` cue) has not been judged on a device (the emulator shows only that `navigator.vibrate` is called and accepted); continuous particle / scramble / typing animation was confirmed from drawn frames, computed styles and tests rather than watched on a phone. The Awakening name field was verified with the real Gboard soft keyboard on the emulator. Gameplay data is unaffected, because presentation is cosmetic and writes nothing to the database. A typed name draft is not kept across a refresh, by design.
- **Test harness (resolved in Phase 13).** The known timing-sensitive UI tests were root-caused and fixed deterministically (15/15 full runs, 30/30 targeted runs). If a UI test fails intermittently again, find the cause first (an amplifier that delays an effect pass, then `waitFor` the observable consequence); **do not add blanket retries, longer timeouts or weakened assertions**. The procedure is in `docs/QA_HARDENING.md`; no stress script is committed.
- **Follow-ups:** (1) **High priority: the Backup/Restore UI.** The export/import engine and its SHA-256 checksum already exist and must not change, but there is no screen, no backup reminder and no human-readable `checksum_unavailable` message; local backups are the real protection against site-data loss, and restore is destructive, so it needs careful UX and review. **It must also resolve the deferred default-seed backup validation gap** (a signed backup with a damaged `tpl_seed_*` id/`seedKey` fails startup every launch; the `it.todo` in `src/application/backupAudit.test.ts` marks it): either reject such a file in validation or make seeding tolerant. (2) The main JS chunk (about 525 kB) is still above Vite's ~500 kB advisory; Phases 13 and 14 both measured it and found **no code splitting** worthwhile (every non-Home screen together is about 12% of startup JS, under about 5 ms at 4× throttle); revisit only with a new measured reason. (3) Per-screen document titles were added in Phase 14. (4) **Weekly History overflow at 320 dp with 200% text** (the "Missed · 0 / 4 pts" lines; pre-existing, documented in `docs/POLISH_PERFORMANCE.md`). (5) Deferred by the owner at Phase 14: the **quest-tap latency / achievement-derivation optimization** (revisit around 5,000 ledger rows), a **compact landscape navigation**, and **OD-04** (the final Daily Message catalog).

**Session handoff:** after `/clear`, read this file and `docs/CURRENT_STATE.md` first. Do not reread every historical specification; open the detailed docs below only when the current phase needs them or an ambiguity/conflict appears.

### Specification documents

- `docs/CURRENT_STATE.md` is the **short session handoff** (architecture map, essential invariants, schema, limitations, active open decisions). Read it first.
- `docs/MASTER_SPEC.md` is the **authoritative source for approved game/product rules**.
- `docs/DATA_MODEL.md` defines the conceptual data model and invariants (guides Phases 02–03).
- `docs/PHASE_PLAN.md` defines phase ownership, boundaries, and acceptance criteria.
- `docs/OPEN_DECISIONS.md` lists the decisions that are deliberately still undecided.
- `docs/FOUNDATION.md` and `docs/DOMAIN_ENGINE.md` record implementation facts for Phases 01 and 02.
- `docs/PERSISTENCE.md` records the implemented storage contract (Phase 03): database, stores, indexes, transactions, backup and errors.
- `docs/CORE_UI.md` records the implemented application layer and mobile UI (Phase 04): runtime, seeding, today's load, completion flow, Daily Message, screens and the deliberate Phase 04 limitations.
- `docs/DAILY_LIFECYCLE.md` records the implemented daily lifecycle (Phase 06): finalization, Daily Summary chain, reconciliation, streaks, midnight/resume sync, Sleep/Daily Report, backward-clock guard, catch-up rule and the v2 migration.
- `docs/WEEKLY_GOAL_CRUSHER.md` records the implemented Weekly Goal Crusher (Phase 07): rules, OD-10/OD-19 resolutions, data model, schema v3, finalization and catch-up, immutability layers, rewards and screens.
- `docs/PROGRESSION_STATS_ACHIEVEMENTS.md` records the implemented progression, statistics and achievements (Phase 08): the derived (not persisted) achievement design that replaces the old `achievementUnlocks` store, the statistics and their sources, the 28-achievement catalog, unlock evidence and dating, the OD-01 / OD-03 resolutions, the OD-18 deferral and the new screens.
- `docs/VISUAL_SYSTEM_AND_ORDERING.md` records the implemented visual SYSTEM layer and manual quest ordering (Phase 09): tokens, typography and font licence, reusable components, `sortOrder` storage, the frozen schema v4 migration, append/edit/archive/restore/reorder semantics, stale-tab protection, drag and accessible-fallback UX, verification and the Phase 10 boundary.
- `docs/EFFECTS_EVENT_ENGINE.md` records the implemented effects and event presentation (Phase 10): the presentation queue and its classes, event-to-effect mapping, Level/Rank, derived-achievement detection without persistence, Perfect Day, the Weekly Goal Crusher spectacle (OD-20), catch-up suppression, text/particle rules, reduced motion and settings, sound and haptics (OD-06/07/08), performance, the dev lab, verification and limitations.
- `docs/PLAYER_AWAKENING.md` records the implemented Player Awakening and Player Name (Phase 11): the `playerProfile` store and its row-existence gate, the schema v5 / backup 5 migration rules (fresh versus existing, `originalFrom`), startup order, the onboarding state machine and ACCEPT rule, name rules and RTL handling, rename from Status, reduced motion, the reference-image decision, the DEV preview and failure/recovery behavior.
- `docs/PWA_ANDROID_OFFLINE.md` records the implemented PWA / offline support (Phase 12): the manifest and icons, the service-worker architecture (shell-only precache, build id, atomic install, activation, fetch rules, the no-IndexedDB boundary), the update lifecycle and notice (including unsaved-form hiding and multi-window update safety), offline behaviour, storage persistence, secure-context/backup behaviour, Netlify hosting, recovery and the kill switch, the verification record and what is not verified (Android/WebAPK), and the follow-ups.
- `docs/QA_HARDENING.md` records the Phase 13 QA / hardening work: the five production fixes, the proven root causes of the flaky tests and the repeated-run results, the lifecycle/backup/privacy audits, the Android emulator checklist and what remains unverified on a physical phone, the performance measurements, the deferred default-seed backup gap, and the documented stress procedure.
- `docs/POLISH_PERFORMANCE.md` records the Phase 14 polish / performance work: the approved polish fixes and the Weekly score wrap found by the populated pass, the `framer-motion` removal, the measurement method (including the correction that the kickoff "warm" numbers were HTTP-cache warm), the interleaved before/after results, the 72-scan layout comparison, what the owner deferred (tap latency, compact landscape nav, OD-04, code splitting) and the known Weekly History 320 dp / 200% text overflow.
- `docs/QUEST_MANAGEMENT.md` records the implemented quest management (Phase 05): routes, form and validation, use cases, the frozen-occurrence rule, archive/restore, the Home loader change, id generation and the deliberate Phase 05 limitations.

Do not duplicate approved values here; read them from `docs/MASTER_SPEC.md`. If this file and the specification documents appear to conflict, stop and report the conflict instead of guessing.

### Approved (see `docs/MASTER_SPEC.md` for the exact values)

- difficulty EXP values
- the player level formula (no maximum level; progression continues past Level 100)
- rank thresholds
- daily completion thresholds and day-quality rules (exact-ratio classification)
- streak behavior (persisted only at day finalization)
- Weekly Goal Crusher scoring, bonus EXP, and reward-tier rules
- the 28-achievement V1 catalog (derived from history, 0 EXP) and the Level 100+ rank display `???`

These approved values must live in centralized configuration/domain code when implemented, never scattered through the UI.

### Still open

Some explicitly listed product decisions remain open (for example semantic quest identity such as "Gym", deferred beyond V1 under OD-18, and the final Daily Message catalog content, OD-04, which the owner deferred at Phase 14). Typography was decided in Phase 09 (Oxanium display font, platform body font). Sound, haptics, animation intensity and the Goal Crusher spectacle were decided in Phase 10 (their V1 tones and timings stay as built; their feel can only be judged in the physical-phone pass). The open ones are tracked in `docs/OPEN_DECISIONS.md`.

Do not invent answers to open decisions. Keep each behind an isolated decision point until the owner decides.
