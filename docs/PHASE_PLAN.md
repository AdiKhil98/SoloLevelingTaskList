# SoloLevelingTaskList — Phase Plan

**Document status:** Phase 00 deliverable. Defines ownership and boundaries for Phases 00–15.
**Companions:** [MASTER_SPEC.md](MASTER_SPEC.md) · [DATA_MODEL.md](DATA_MODEL.md) · [OPEN_DECISIONS.md](OPEN_DECISIONS.md)

---

## 0. Working agreement for every phase

1. **A completed phase becomes established production architecture.** Later phases **extend** it. They do not redesign, replace, rename public interfaces, or refactor "because another pattern seems cleaner." (`CLAUDE.md` architecture-stability rule.)
2. **Kickoff discussion first.** Each phase begins with a short proposal (approach, files, dependencies with justification, risks, relevant open decisions) and waits for the owner's go-ahead **before code is written.** (Standing owner instruction: no code before it is discussed.)
3. **When a later phase must touch earlier work:** inspect the existing implementation → identify dependents → make the smallest compatible extension → preserve behavior → update/add tests → **report any unavoidable breaking change before making it.**
4. **Phase completion protocol** (every implementation phase): run relevant tests → run TypeScript/build checks → summarize changed files → summarize important architectural decisions → list unresolved issues → **stop and wait for approval.** The next phase never starts automatically.
5. **No destructive git operations** without explicit instruction. Commits/pushes happen only when the owner asks.
6. **Dependencies:** install in the phase that first needs them; state why existing tools are insufficient; prefer no new package for trivial behavior.
7. **Open decisions** (see `OPEN_DECISIONS.md`) must be settled by the phase listed there; a phase may not silently decide one.
8. **`_reference/` is read-only and git-ignored.** Anything used from it is *copied/adapted* into app source in its designated phase, with attribution preserved.
9. **Tests accompany logic** in the phase that writes it; they are not deferred to Phase 13.

### Phase overview

| Phase | Name | Layers touched | Decisions due |
|------:|------|----------------|---------------|
| 00 | Master Product / Architecture Specification | docs only | — |
| 01 | Project Foundation | tooling, shell | — |
| 02 | Domain / Game Engine | A | — |
| 03 | Persistence and Recovery | B | — |
| 04 | Core Mobile Application Shell | C | OD-04 (starter), OD-15 |
| 05 | Quest Management | A/B/C | OD-05, OD-16 |
| 06 | Daily Lifecycle | A/B/C | OD-21, OD-22 |
| 07 | Weekly Goal Crusher | A/B/C | OD-10, OD-19 |
| 08 | Progression / Stats / Achievements | A/B/C | OD-01, OD-03, OD-18 |
| 09 | Visual SYSTEM Layer | C/D | OD-09 |
| 10 | Animation / Event Engine | D | OD-06, OD-07, OD-08, OD-20 |
| 11 | Player Awakening / First Launch | C/D | — |
| 12 | PWA / Phone Experience | E | — |
| 13 | QA / Hardening | all (fix-only) | — |
| 14 | Performance / Polish | all (tune-only) | OD-04 (final) |
| 15 | Optional Android Packaging | E | — |

---

## PHASE 00 — Master Product / Architecture Specification

- **Objective:** Produce the authoritative contracts all later phases follow.
- **Owns:** `docs/MASTER_SPEC.md`, `docs/DATA_MODEL.md`, `docs/PHASE_PLAN.md`, `docs/OPEN_DECISIONS.md`.
- **May modify:** only `docs/` (new files).
- **Must not implement:** any application code, `src/`, scaffolding, package installs, edits to `CLAUDE.md` (without explicit authorization), edits to `_reference/`, commits/pushes.
- **Prerequisites:** root `CLAUDE.md` read; repository and reference-pack inspected.
- **Outputs:** the four documents.
- **Acceptance criteria:** the Phase 00 checklist is satisfied; documents are internally consistent; every unresolved item is recorded as OPEN rather than invented; owner approves.

---

## PHASE 01 — Project Foundation

- **Objective:** A clean, runnable, strictly-typed project skeleton with tooling that *enforces* the architecture.
- **Owns:** project scaffolding and configuration: React + Vite + TypeScript (strict), Tailwind, shadcn-compatible structure and path aliases (`@/…`), routing, lint/format, **test framework** (Vite-native such as Vitest is the expected choice; confirm in the kickoff proposal), PWA-*ready* foundation (viewport/theme-color meta, `public/` layout, build config that can host a service worker later — **no** real service worker/manifest logic yet), app-shell skeleton, npm scripts (`dev`, `build`, `typecheck`, `lint`, `test`).
- **May modify:** repo root config, `package.json`, `.gitignore` (carefully), new `src/` skeleton, `docs/` progress notes.
- **Must not implement:** any game rule, IndexedDB code, real screens/features, effects, copying of reference components, state beyond a minimal shell.
- **Prerequisites:** Phase 00 approved. Owner decides whether to authorize updating the stale "Current status" block in `CLAUDE.md` to point at `docs/` (not done unless authorized).
- **Outputs:** a runnable shell; folder layout reflecting layers A–E (MASTER_SPEC §3.4); **import-boundary lint rule** (domain may import nothing from persistence/UI/effects/platform).
- **Acceptance criteria:** `typecheck`, `lint`, `build`, `test` all pass; a sample test runs; a deliberate boundary violation is shown to fail lint; dependency list is justified (e.g., why `clsx`/`tailwind-merge`, if the shadcn `cn` helper is adopted); app opens at phone viewport; no business logic exists.

---

## PHASE 02 — Domain / Game Engine

- **Objective:** The complete pure rules of the daily game, fully tested, with no UI or storage.
- **Owns:** `src/domain/`: the **centralized date-key module** (date keys, week keys, day arithmetic, weekday math — MASTER_SPEC I-13); domain entity types from DATA_MODEL (all of them, so later phases share one vocabulary); economy configuration (`DIFFICULTY_EXP`, level curve, rank bands, daily thresholds, weekly bonus table as constants); quest recurrence and eligibility; occurrence materialization (pure); completion command producing `{writes, events}`; XP transaction creation and idempotency-key rules; level derivation incl. multi-level gains; rank derivation; daily completion percentage and day quality; streak fold; domain event types. (Weekly scoring logic arrives in Phase 07; achievement engine in Phase 08.)
- **May modify:** `src/domain/`, shared test utilities, docs notes.
- **Must not implement:** persistence, React, finished UI, animations, a clock/rollover *service* (Phase 06), weekly or achievement logic (Phases 07/08).
- **Prerequisites:** Phases 00–01 approved. Levels after 100 are approved (MASTER_SPEC §8.4: no level cap, no prestige) and are implemented as specified. The completion-finality (MASTER_SPEC §5.6), streak-finalization (§7.4), and No-Active-Quests (§7.5) rules are already approved and are implemented as specified.
- **Outputs:** pure, dependency-free domain modules + extensive tests.
- **Acceptance criteria:**
  - Level golden table (MASTER_SPEC §8.1) reproduced exactly; XP→level round-trips; multi-level gain example (T=500 → L4) correct.
  - Boundary tests for 69/70/84/85/99/100 % using exact ratios and integer/rational comparison (e.g., 13/20, 14/20, 17/20, and non-round ratios like 696/1000, 849/1000, 999/1000); the whole-number display percentage **floors** (69.6 → 69, never 70) and is shown never to influence classification.
  - Streak fold: finalized ≥70 % → +1, <70 % → 0, best updated only from finalized values; Perfect Day Streak +1 at 100 %, reset below; a zero-eligible day is `no_active_quests` and neutral (no increment, no reset, not Perfect). No division by zero.
  - A completed occurrence cannot be un-completed through any domain command (completion is final in V1).
  - Weekly-bonus-style transactions carry distinct `createdAt`, `effectiveDate`, and `sourceWeekKey` (types and constructors; weekly logic itself arrives in Phase 07).
  - Eligibility: weekdays, interval-from-anchor (incl. across month/year/leap day and DST dates), one-time, active-period edges; ineligible dates never produce occurrences.
  - Completion is idempotent: second application yields no new writes/EXP.
  - Domain has zero imports from persistence/UI/effects/platform (lint-enforced) and reads time only via an injected value.
  - Prayers seeded as five separate E/10 Discipline quests; Sleep as D/20 Discipline.

---

## PHASE 03 — Persistence and Recovery

- **Objective:** A durable, versioned, atomic IndexedDB layer plus safe backup/restore.
- **Owns:** `src/persistence/`: database open/versioning, object stores and indexes (DATA_MODEL §14), repositories, atomic application of domain `writes` (single transaction with in-transaction uniqueness re-checks), `PlayerProgress` cache maintenance, **verify/rebuild** routine, migration framework (+ fixtures), JSON **export/import** (DATA_MODEL §15), validation, recovery from malformed data.
- **May modify:** `src/persistence/`, minimal additive changes to domain *types* if a genuine gap is found (reported first), tests, docs notes.
- **Must not implement:** UI screens, presentation logic, business rules duplicated from the domain, cloud sync.
- **Prerequisites:** Phase 02 approved. Dependency choices (thin IndexedDB wrapper, schema validation approach, fake-IndexedDB for tests) proposed and justified in the kickoff.
- **Outputs:** repositories + command-application service usable by UI; backup module.
- **Acceptance criteria:**
  - Duplicate completion attempts (sequential and concurrent) yield exactly one completion and one ledger row.
  - An injected mid-transaction failure rolls back everything.
  - Insert-only stores expose no update/delete.
  - Ledger chain verified; rebuilt `PlayerProgress` equals cache.
  - Import: valid backup round-trips; corrupted JSON, wrong format, bad checksum, newer schema are rejected with specific errors and **leave existing data intact**; older schema migrates; caches rebuilt rather than trusted.

---

## PHASE 04 — Core Mobile Application Shell

- **Objective:** The first usable phone-first app: see today, complete quests, watch EXP move.
- **Owns:** navigation, **Home** (greeting, level, rank, streak display, Daily Message starter, today's progress, eligible quest list, EXP bar), a **basic Player Status** screen, a functional task list wired to the domain via application services, daily-progress indicator, seeding of the six default quests (OD-15), responsive portrait layout.
- **May modify:** `src/features/`, `src/app/`, shell/routing, minimal additive domain/persistence extensions (reported).
- **Must not implement:** quest creation/editing UI (Phase 05), midnight/rollover service and Daily Report (Phase 06), weekly system, achievements UI, heavy effects (minimal feedback only), reference-pack integration beyond trivial needs.
- **Prerequisites:** Phases 02–03 approved; starter Daily Message bank agreed (OD-04); seed set agreed (OD-15).
- **Outputs:** an app a user can actually use for the day.
- **Acceptance criteria:** completing a quest persists across reload and awards EXP exactly once; rapid double-tap and reload never duplicate EXP; ineligible quests are not shown; usable at ~360×800 portrait with safe touch targets, semantic buttons, visible focus/active states; **no continuous animation**; reduced-motion respected; domain logic not present in components.

---

## PHASE 05 — Quest Management

- **Objective:** Let the user create and maintain quests without ever corrupting history.
- **Owns:** create/edit/deactivate-delete of templates; Daily, Scheduled (weekdays and interval+anchor), One-Time; difficulty and category pickers (EXP shown, derived); recurrence editor with eligibility preview; validation; safe archive semantics per DATA_MODEL §9.
- **May modify:** quest feature UI, application services, template-related domain/persistence code (extension-only).
- **Must not implement:** free-form EXP input (unless OD-05 approves overrides), history rewriting, weekly goals, lifecycle/rollover changes.
- **Prerequisites:** Phase 04 approved; **OD-05** and **OD-16** decided.
- **Outputs:** quest-management screens and flows.
- **Acceptance criteria:** editing a template never alters past occurrences/completions/summaries; deleting preserves all history and earned EXP; a scheduled quest never appears on or affects an ineligible day; interval quests do not shift when a session is missed; validation rejects empty weekdays, `N < 2`, invalid dates.

---

## PHASE 06 — Daily Lifecycle

- **Objective:** Make days real: midnight, catch-up, streaks, summaries, and the report.
- **Owns:** local-day/clock service built on the Phase 02 date module; **reconcile** on launch, resume, and a foreground midnight timer (convenience only); multi-day catch-up with per-day atomic, resumable finalization; Daily Summary generation; streak/Strong/Perfect Day computation and persistence; Sleep-quest interaction; **Daily Report**.
- **May modify:** lifecycle service, summaries repository/UI, Home streak display, minimal extensions elsewhere.
- **Must not implement:** weekly finalization (Phase 07), heavy celebration effects (Phase 10), achievements (Phase 08).
- **Prerequisites:** Phases 02–05 approved; **OD-21, OD-22** decided.
- **Outputs:** correct day transitions and historical day records.
- **Acceptance criteria:** with an injected clock — app open across midnight; app closed and reopened after 1, 3, 40 days; DST-change days; a zero-eligible day is classified No Active Quests and is neutral for both streaks (MASTER_SPEC §7.5); persisted streaks change only at finalization while the live "STREAK SECURED"/projection is display-only; finalized days never rewritten; interrupted catch-up resumes; Sleep action does *not* alter rollover; reconcile is idempotent (running it twice changes nothing).

---

## PHASE 07 — Weekly Goal Crusher

- **Objective:** The Monday→Sunday weighted-goal system, separate from daily quests.
- **Owns:** board create/edit (focus, weighted goals totaling exactly 10); manual progress and linked-quest progress; scoring; bonus table; reward tiers (user-configurable text) and **CLAIM REWARD**; weekly history; **finalization** hooked into reconcile (after the week's Sunday); `WeeklyGoalCompleted`/`WeeklyBoardFinalized` events.
- **May modify:** weekly domain/persistence/UI; reconcile (additive); settings (reward tiers).
- **Must not implement:** fractional scoring, additional tracking modes beyond OD-10's decision, any effect on Daily Streak/denominator, extra quest EXP for linked completions.
- **Prerequisites:** Phase 06 approved; **OD-10, OD-19** decided.
- **Outputs:** the complete weekly loop.
- **Acceptance criteria:** board totals exactly 10; bonus is a single lookup (9/10 → 325); exactly-once bonus under repeated reconcile and concurrent finalization; only the highest reward tier applies; claim only after finalization; finalized boards immune to template edits; reopening after multiple weeks finalizes each week once; week/year boundaries correct; no category EXP for weekly bonus.

---

## PHASE 08 — Progression / Stats / Achievements

- **Objective:** Make long-term progress visible and give milestones a home.
- **Owns:** detailed Status page; category totals (derived from the ledger); rank presentation; **achievement engine** (data-driven, 0 EXP, one unlock each) and the approved catalog; history views; **EXP ledger** view; progression statistics.
- **May modify:** status/stats/history features; achievement domain+persistence; minimal additive extensions.
- **Must not implement:** achievements that award EXP, duplicate category state, heavy effects (Phase 10).
- **Prerequisites:** Phase 07 approved; **OD-01, OD-03, OD-18** decided. (Perfect Week is already defined: a finalized Weekly Goal Crusher board scored exactly 10/10.)
- **Outputs:** Status, Achievements, History, Ledger screens.
- **Acceptance criteria:** category totals reconcile with the ledger (INV-9); achievements idempotent and awarded zero EXP; rank thresholds (10/20/35/50/75/100) correct; Level-100 rank presented only with the owner-approved name.

---

## PHASE 09 — Visual SYSTEM Layer

- **Objective:** Apply the dark-fantasy SYSTEM visual identity to the *static* app without compromising calm readability.
- **Owns:** design tokens (black/violet/cyan), panel system, HUD styling, typography (OD-09), selective adaptation of reference visual primitives (e.g., `BorderTrail`, `HudFrame`, `HolographicCard`, `XPProgress`, `AnimatedNumber`, `TextScramble` as appropriate), third-party attribution notices.
- **May modify:** styling/UI primitives across features; Tailwind theme; `src/effects/` (static/low-cost components only).
- **Must not implement:** the event/animation engine, level-up/rank-up overlays, particles on ordinary screens, anything that changes game rules.
- **Prerequisites:** Phase 08 approved; **OD-09** decided. Reference components are *copied/adapted* (the pack is git-ignored); license/attribution preserved.
- **Outputs:** consistent themed UI; documented tokens.
- **Acceptance criteria:** WCAG-reasonable contrast; hard-coded reference colors replaced with tokens; no infinite animations on always-visible screens (the reference `DailyStreak` flame loop and `XPProgress` shimmer are gated or removed); reduced-motion honored; no regression in task-list usability.

---

## PHASE 10 — Animation / Event Engine

- **Objective:** Present earned events dramatically and efficiently, strictly as a consumer of domain events.
- **Owns:** event queue/presenter (priority, coalescing, ordering per DATA_MODEL §11); quest-completion feedback; EXP gain; Goal Crusher presentation (per OD-20); Perfect Day; **Level Up**; **Rank Up** (rarer and heavier); haptics and sound hooks (OD-06/07); reduced-motion handling; effect-intensity setting (OD-08); on-demand mounting and cleanup of heavy canvases.
- **May modify:** `src/effects/`, presenter wiring in features, settings UI.
- **Must not implement:** any logic deciding whether EXP/levels/ranks/streaks/achievements occurred; always-on particles.
- **Prerequisites:** Phases 06–09 approved; **OD-06, OD-07, OD-08, OD-20** decided.
- **Outputs:** the event-driven effects layer.
- **Acceptance criteria:** disabling all effects leaves identical game state; heavy effects mount only during their event and fully unmount (no running loops, verified on a mid-range Android device); a multi-event result (completion + 2 levels + rank + achievement) plays in the defined order without overlap; rapid taps never stack overlays; intensity/sound/haptics settings respected.

---

## PHASE 11 — Player Awakening / First Launch

- **Objective:** The cinematic first-launch onboarding.
- **Owns:** the Awakening sequence — SYSTEM notification → qualification message → **ACCEPT** → initialization → Level 1 → first Daily Quest experience; copying the supplied reference image into app assets (the pack is git-ignored); first-use state (`awakenedAt`).
- **May modify:** onboarding feature, `PlayerProfile` usage, app entry routing.
- **Must not implement:** gameplay changes, new progression rules, re-awakening/reset flows not specified.
- **Prerequisites:** Phase 10 approved; image provenance/licensing acknowledged for private use.
- **Outputs:** first-launch experience.
- **Acceptance criteria:** shown once, only before acceptance; ACCEPT initializes the player and seeded quests exactly once; interrupted/reloaded mid-sequence is safe; works offline; reduced-motion path exists; the image does not block startup (lazy/optimized).

---

## PHASE 12 — PWA / Phone Experience

- **Objective:** A properly installable, offline-capable Android PWA.
- **Owns:** web manifest, icons, **service worker** (app-shell precache, offline startup, update flow), safe-area handling, standalone display behavior, Android Chrome installability, touch ergonomics, evaluation of requesting persistent storage and a backup-reminder strategy (IndexedDB eviction risk).
- **May modify:** platform layer (`src/platform/`), build/PWA config, `public/`.
- **Must not implement:** push notifications/background sync/accounts unless separately approved; gameplay changes.
- **Prerequisites:** Phase 11 approved.
- **Outputs:** installable offline app.
- **Acceptance criteria:** installs from Chrome on Android; cold-start offline works; resume-from-background triggers reconcile; service-worker updates don't corrupt/lose local data; Lighthouse PWA checks pass; safe areas correct on notched devices.

---

## PHASE 13 — QA / Hardening

- **Objective:** Break the app on purpose, then fix what breaks, minimally.
- **Owns:** an adversarial test pass and fixes. Scenarios include: midnight crossings; timezone/DST changes; app closed several days; rapid repeated taps; duplicate EXP attempts; deleting quests; changing schedules; multi-level gains; rank thresholds; Weekly Goal Crusher finalization; **duplicate weekly bonus prevention**; importing a corrupted backup; importing an older schema; **zero eligible quest day**; leap dates; week/year boundaries; two-tab races; storage-quota failure; clock moved backwards.
- **May modify:** any layer, **fix-only** and minimal, with each breaking change reported first; test suites.
- **Must not implement:** new features or rule changes; broad refactors.
- **Prerequisites:** Phases 01–12 approved.
- **Outputs:** hardened code + regression tests + a QA report.
- **Acceptance criteria:** all invariants INV-1…INV-20 have tests; no duplicate-EXP path reproducible; every found defect has a regression test; all open decisions required by this point are closed.

---

## PHASE 14 — Performance / Polish

- **Objective:** Make it smooth, light, and consistent on real phones.
- **Owns:** animation tuning, mobile performance and battery profiling, visual consistency, loading and error states, accessibility pass, final UX cleanup, final Daily Message catalog (OD-04).
- **May modify:** tuning-only changes across UI/effects; assets; copy.
- **Must not implement:** new gameplay systems or architectural rewrites.
- **Prerequisites:** Phase 13 approved.
- **Outputs:** release-quality polish.
- **Acceptance criteria:** ~60 FPS on a modern phone during earned-event effects; no background animation work while hidden; error/empty/loading states exist; accessibility checklist (contrast, touch targets, semantics, reduced motion) passes; bundle size reviewed.

---

## PHASE 15 — OPTIONAL Android Packaging

- **Objective:** Optionally wrap the stable PWA as a private sideloaded APK.
- **Owns:** Capacitor setup, Android project, APK build, private sideload workflow.
- **May modify:** packaging config and a native wrapper only; app code only for platform-bridge needs (reported).
- **Must not implement:** app-store publishing, accounts, cloud features, gameplay changes.
- **Prerequisites:** PWA (Phase 12) stable and QA'd; explicit owner go-ahead (this phase is optional).
- **Outputs:** an installable APK and instructions.
- **Acceptance criteria:** APK installs and runs offline with data persisting across restarts and updates; backup export/import works inside the wrapper; no regression to the PWA build.
