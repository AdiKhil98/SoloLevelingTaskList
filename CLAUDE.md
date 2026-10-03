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

**Phases 00, 01 and 02 are complete and approved.**

- **Phase 00** — the master product / architecture specification is complete and authoritative.
- **Phase 01** — the application foundation is complete (React/Vite/TypeScript/Tailwind scaffold, placeholder UI, lint-enforced layer boundaries). See `docs/FOUNDATION.md`.
- **Phase 02** — the pure domain/game engine is complete. `src/domain/` now exists and covers: DateKey/calendar primitives, quest recurrence and eligibility, occurrence snapshots, completion/idempotency, XP transactions, levels and ranks, daily progress classification, and typed domain events. 250 tests pass as of Phase 02. See `docs/DOMAIN_ENGINE.md`.

**Phase 03 (persistence) has NOT started** and must not start until the owner approves it. IndexedDB is not implemented, and no game UI features exist yet (the UI is still the Phase 01 placeholder). The `_reference/solo-leveling-effects-pack/` directory remains local, read-only, and git-ignored.

### Specification documents

- `docs/MASTER_SPEC.md` is the **authoritative source for approved game/product rules**.
- `docs/DATA_MODEL.md` defines the conceptual data model and invariants (guides Phases 02–03).
- `docs/PHASE_PLAN.md` defines phase ownership, boundaries, and acceptance criteria.
- `docs/OPEN_DECISIONS.md` lists the decisions that are deliberately still undecided.
- `docs/FOUNDATION.md` and `docs/DOMAIN_ENGINE.md` record implementation facts for Phases 01 and 02.

Do not duplicate approved values here; read them from `docs/MASTER_SPEC.md`. If this file and the specification documents appear to conflict, stop and report the conflict instead of guessing.

### Approved (see `docs/MASTER_SPEC.md` for the exact values)

- difficulty EXP values
- the player level formula (no maximum level; progression continues past Level 100)
- rank thresholds
- daily completion thresholds and day-quality rules (exact-ratio classification)
- streak behavior (persisted only at day finalization)
- Weekly Goal Crusher scoring, bonus EXP, and reward-tier rules

These approved values must live in centralized configuration/domain code when implemented, never scattered through the UI.

### Still open

Some explicitly listed product decisions remain open (for example the display name of the Level-100+ special rank, the achievement catalog, the Daily Message catalog, quest EXP overrides, sounds/haptics/animation timings, typography, and some Weekly Goal Crusher lifecycle details). They are tracked in `docs/OPEN_DECISIONS.md`.

Do not invent answers to open decisions. Keep each behind an isolated decision point until the owner decides.
