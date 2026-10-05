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
- Framer Motion for animation
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

**Phases 00 through 12 are complete and approved.** HEAD before the Phase 12 docs-closeout commit: `d6b05c7`.

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

**Phase 13 (QA / hardening) is next and has NOT started**; it must not start until the owner approves it. Polish (Phase 14) is still later. Stores and fields for later features are added through versioned database migrations in their owning phases. The `_reference/solo-leveling-effects-pack/` directory remains local, read-only, and git-ignored.

**Non-blocking QA notes (for later phases):**

- Real Android finger-based quest dragging has not yet been tested (Phase 09 drag was verified with synthetic pointer events on the real layout and in automated tests).
- Desktop-width manual verification was unavailable in the Phase 09 browser pane.
- **Phase 10 later-device QA:** real Android haptics have **not** been verified; the synthesized sounds have **not** been listened to on a device; continuous particle / scramble animation could not be fully observed in the browser pane (it often reports the page hidden, which pauses animation; it was confirmed from drawn frames, computed styles and tests); real Android effects and performance remain for device QA (Phase 13). Gameplay data on desktop and phone is unaffected, because presentation is cosmetic and writes nothing to the database.
- **Known test-harness follow-up (Phase 13):** timing-sensitive UI tests can still fail intermittently. Known examples: `PresentationFlow`, `SystemSettingsPanel`, `WeeklyEditor` and `HomeLifecycle`, and, seen during Phase 12, the Phase 11 Awakening focus assertion (`AwakeningFlow.test.tsx`, "moves focus to the control that matters": it asserts focus the instant ACCEPT appears while the screen focuses it in a passive effect). Fix them **deterministically** (preconditions, flushed effects, deterministic setup); **do not add blanket retries or weaken assertions**. (`WeeklyPage.test.tsx` was stabilized in Phase 10.) Details in `docs/CURRENT_STATE.md`.
- **Phase 12 follow-ups:** (1) **Real Android/WebAPK QA is still required** (see `docs/CURRENT_STATE.md` for the list). (2) **High priority: the Backup/Restore UI.** The export/import engine and its SHA-256 checksum already exist and must not change, but there is no screen, no backup reminder and no human-readable `checksum_unavailable` message; local backups are the real protection against site-data loss, and restore is destructive, so it needs careful UX and review. (3) The main JS chunk is still above Vite's ~500 kB advisory; evaluate splitting during QA/performance work, without a premature refactor.
- **Phase 11 later-device QA:** the name field with a real Android soft keyboard, the `awakening` haptic cue and the continuous particle / scramble / typing animation on a real phone have **not** been verified (the first-launch layout was checked with DOM measurements at 360×800 and 320×568). A typed name draft is not kept across a refresh, by design.

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

Some explicitly listed product decisions remain open (for example semantic quest identity such as "Gym", deferred beyond V1 under OD-18, and the final Daily Message catalog content). Typography was decided in Phase 09 (Oxanium display font, platform body font). Sound, haptics, animation intensity and the Goal Crusher spectacle were decided in Phase 10 (their V1 tones and timings are polish for Phase 14). The open ones are tracked in `docs/OPEN_DECISIONS.md`.

Do not invent answers to open decisions. Keep each behind an isolated decision point until the owner decides.
