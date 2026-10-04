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

**Phases 00 through 09 are complete and approved.**

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

**Phase 10 has NOT started** and must not start until the owner approves it. Effects/animations, Player Name onboarding, PWA/offline work and hardening are still later phases. Stores and fields for later features are added through versioned database migrations in their owning phases. The `_reference/solo-leveling-effects-pack/` directory remains local, read-only, and git-ignored.

**Non-blocking QA notes (for later phases):**

- Real Android finger-based quest dragging has not yet been tested (Phase 09 drag was verified with synthetic pointer events on the real layout and in automated tests).
- Desktop-width manual verification was unavailable in the Phase 09 browser pane.
- Existing Weekly/Home timing-related test flakiness remains for Phase 13 investigation: `HomeLifecycle.test.tsx` (Phase 08) and `WeeklyPage.test.tsx` (Phase 09) each showed an intermittent timeout under load, and each passed in isolation and on a clean rerun.

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

Some explicitly listed product decisions remain open (for example semantic quest identity such as "Gym", deferred beyond V1 under OD-18, the final Daily Message catalog content, sounds/haptics/animation timings). Typography was decided in Phase 09 (Oxanium display font, platform body font). They are tracked in `docs/OPEN_DECISIONS.md`.

Do not invent answers to open decisions. Keep each behind an isolated decision point until the owner decides.
