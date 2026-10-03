# SoloLevelingTaskList — Core UI (Phase 04)

Implementation facts about the first functional mobile application: `src/application/`, the runtime provider in `src/app/`, and the Home and Status screens. Product rules live in [MASTER_SPEC.md](MASTER_SPEC.md), the domain API in [DOMAIN_ENGINE.md](DOMAIN_ENGINE.md) and the storage contract in [PERSISTENCE.md](PERSISTENCE.md); this file does not repeat them.

Phase 04 changed **no domain or persistence code and added no schema migration or dependency.** The only change outside the new code is the layer-boundary lint config (below) and the route table.

## Layer structure

```
src/platform/clock.ts     systemClock — the only place that reads Date / Intl (imports nothing)
src/application/          framework-free use cases (domain + persistence only)
  index.ts                public API
  clock.ts                Clock interface, readClock(clock) → ClockReading
  context.ts              ApplicationContext { database, clock }
  errors.ts               ApplicationError, FailureReason, classifyFailure
  seeds/                  DEFAULT_QUEST_SEEDS, ensureDefaultQuests
  today/                  loadToday, questOrder
  player/                 loadPlayerStatus
  completion/             completeTodayQuest
  dailyMessage/           catalog + selectDailyMessage
  home.ts                 HomeSnapshot, loadHome
  initialize.ts           initializeApplication
  test-utils/             test-only helpers (not exported)
src/app/                  AppRuntimeProvider (lifecycle), runtimeContext, StartupScreens, routes, App
src/features/home|status/ Home and Status screens and their parts
src/features/displayLabels.ts   rank / day-quality / category text (presentation only)
src/components/ui/ExpProgressBar.tsx
src/components/layout/    AppShell, BottomNav
```

Dependency direction (lint-enforced in `eslint.config.js`; `application` was added to the layer list):

- `application` may import `domain` and `persistence` only, and no React, router or animation packages.
- `domain`, `persistence`, `effects` and `platform` may not import `application`.
- UI (`app`, `features`, `components`) talks to `@/application`, never to repositories directly. The one UI file that imports `@/persistence` is the runtime provider, because it owns the database handle.

The application layer is a set of plain functions that take an explicit `ApplicationContext`. There is no service singleton and no global state.

## Database handle ownership

`AppRuntimeProvider` (the owner of the runtime) opens **one** `PersistenceDatabase` with `openDatabase` in an effect, keeps it in its state as part of the `ApplicationContext`, and closes it when the effect is disposed or retried. Screens never open connections. It is StrictMode-safe: a run disposed before its database finished opening closes that late handle and never publishes state (tests check that exactly one connection stays open and every connection is closed on unmount). If another tab upgrades the database, the persistence handle closes itself and later calls fail with `database_closed`, which the UI reports as a recoverable error.

`AppRuntimeProvider` takes `options: { clock, database?: { name?, factory? } }` (kept referentially stable by the caller). Tests inject a fresh `fake-indexeddb` factory and a fixed clock; production passes `{ clock: systemClock }`.

## Clock and time zone

`systemClock` (`src/platform/clock.ts`) is the single ambient reader: `Date.now()` and `Intl.DateTimeFormat().resolvedOptions().timeZone`. `src/application/clock.ts` defines the `Clock` interface it satisfies structurally and `readClock(clock)`, which resolves one reading to `{ epochMs, dateKey, utcOffsetMinutes, timeZone }` with the domain's `clockReadingAt`. Every use case derives "today" through `readClock`, and the completion command receives the same instant and zone, so the loaders, the seeder and the completion rule cannot disagree about the date. An unusable clock/zone throws `ApplicationError('clock_unavailable')`.

## Initialization flow

`initializeApplication(context)`:

1. one `readClock` reading;
2. `ensureDefaultQuests` with `startDate = reading.dateKey`;
3. `loadHome` (today's occurrences, completions, progress, progression, Daily Message).

It is safe on every launch against any valid database (fresh, existing, or restored from a backup): it only adds missing approved seeds.

## Seeding

Exactly the six approved defaults (MASTER_SPEC §5.5):

| Order | `seedKey` | Template id | Title | Difficulty (EXP) | Category | Role |
|------:|-----------|-------------|-------|------------------|----------|------|
| 1 | `prayer.fajr` | `tpl_seed_prayer_fajr` | Fajr | E (10) | discipline | standard |
| 2 | `prayer.dhuhr` | `tpl_seed_prayer_dhuhr` | Dhuhr | E (10) | discipline | standard |
| 3 | `prayer.asr` | `tpl_seed_prayer_asr` | Asr | E (10) | discipline | standard |
| 4 | `prayer.maghrib` | `tpl_seed_prayer_maghrib` | Maghrib | E (10) | discipline | standard |
| 5 | `prayer.isha` | `tpl_seed_prayer_isha` | Isha | E (10) | discipline | standard |
| 6 | `sleep` | `tpl_seed_sleep` | Sleep before 00:00 | D (20) | discipline | sleep |

All are `daily`, `status: 'active'`, `revision: 1`, `activeUntil: null`, with `activeFrom` = the DateKey of the first initialization (nothing is generated for earlier dates). Seed keys follow the convention already used by DATA_MODEL §4 and the tests; template ids are deterministic so racing tabs and backups agree on identity. EXP is not stored on the seed or the template: it derives from difficulty.

- **Identity is the `seedKey`.** `getTemplateBySeedKey` finds an existing template under any id, including one the user later edited or archived; such a seed is present and is never recreated.
- **Races.** If the write hits a `constraint_violation` (another tab, or a StrictMode remount, created the seed between the lookup and the write), it counts as "already seeded" **only after a fresh read by `seedKey` returns the seeded template.** Otherwise the original `PersistenceError` is surfaced (for example, an unrelated template occupying the seed's id). Both paths are tested, the stale-lookup one deterministically.
- Seeding is not one transaction; it is idempotent per seed, so a partial run completes on the next launch.

## Today's load

`loadToday(context, reading?)`:

1. list **active** templates;
2. `isQuestEligibleOnDate(template, today)` for each (any recurrence kind; nothing assumes "all daily");
3. for an eligible template, `ensureOccurrence` returns the persisted occurrence or creates it with the domain factory; **a stored snapshot always wins** over a changed template;
4. join `listCompletionsByDate(today)`;
5. `computeDailyProgress` counts every eligible occurrence once and classifies by exact ratio; the display percentage is the domain's floor.

The result (`TodayView`) holds quests in display order, each with its snapshot fields, `completed` and `completedAt`, plus the `DailyProgress`.

**Order.** `questOrder.compareQuestOrder`: seeded quests in `DEFAULT_QUEST_SEEDS` order (Fajr … Isha, Sleep), then everything else by template creation time and id. It lives in the application layer because the data model has no sort field. Phase 05 can replace this one comparator with explicit user ordering.

**Not decided here (OD-16).** Only active templates are scanned, so an occurrence whose template is archived mid-day would disappear from Home. Phase 04 has no way to archive, and the same-day behavior is Phase 05's decision.

## Completion flow

`completeTodayQuest(context, occurrenceId)`:

1. read the clock once;
2. `completeQuestAtomically` (Phase 03: one transaction; the domain decides validity and EXP);
3. map the result, then re-read stored state with `loadHome` (the dataset is small; no guessed arithmetic).

| Result | Meaning | UI |
|--------|---------|----|
| `completed` | saved; carries the domain `events` in order | state refreshed; small status line ("Fajr completed. +10 EXP.", plus Level Up / Rank Up text when those events exist) |
| `already_completed` | repeat of a saved completion; nothing awarded | state refreshed |
| `rejected` (`day_ended`, `not_yet_active`, `not_found`, `invalid_state`) | the domain refused; nothing written | concise message; Refresh when the day may have moved on |
| `failed` (`FailureReason`) | storage or clock failure; nothing written; `cause` kept for logging | concise message, never raw error text |

`home` is `null` only if the completion WAS saved but re-reading failed (`refreshCause` set); the provider then reloads rather than show stale state. The screens guard a double tap in the same tick, but persistence remains the real protection against duplicate EXP. Events are returned untouched, so Phase 10 can consume them; Phase 04 builds no cinematic.

A completed quest is rendered as a plain, non-interactive row (no checkbox): completion is final in V1 (MASTER_SPEC §5.6).

## Player progression

`loadPlayerStatus` calls `readProgression` (ledger tip, cross-checked against the row count) and returns `{ totalExp, level, expIntoLevel, expToNext, rank }` from the Phase 02 engine. The main bar uses `expIntoLevel / expToNext`; `totalExp` (lifetime) appears only on Status. `special_100_plus` displays `???` (OD-01), from one map in `displayLabels.ts`.

## Daily Message

A starter catalog of 40 original, unattributed lines (`dailyMessage/catalog.ts`; no quotations, no network). Selection is a pure function of the `DateKey`:

```
index = daysBetween(2026-01-01, dateKey) mod catalogSize   (non-negative)
```

The catalog is walked one entry per day and cycles without repeating until exhausted. No `Math.random`, no stored assignment, no gameplay effect. Editing or reordering the catalog changes which message a date maps to; that is acceptable because the message has no historical role. The final catalog and wording remain a Phase 14 task (OD-04).

## Screens and navigation

| Route | Screen |
|-------|--------|
| `/` | Home |
| `/status` | Status |
| `*` | Not found |

- **Home** (top to bottom): SYSTEM header; `PLAYER` summary (`LV. n`, rank, current-level EXP bar); Daily Message; `TODAY` (`completed / eligible`, floored `%`, status); `DAILY QUESTS` list. A quest shows its title, `Difficulty X · Category`, and `+N EXP`. The Player label is the neutral `PLAYER`.
- **Status:** Player, Level, Rank, Lifetime EXP, and the current-level EXP bar.
- **Navigation:** a fixed bottom bar with Home and Status (56 px targets, safe-area aware, labelled `Primary`, `aria-current="page"` on the active link), constrained to the same 448 px column as the content on wide screens. `AppShell` reserves space under it.

## UI states

| State | Behavior |
|-------|----------|
| Loading | `SYSTEM INITIALIZING...`; children (and so any "0 EXP") render only after real stored state has loaded |
| Loaded | Home / Status from the runtime snapshot |
| Empty day | `TODAY` shows `No Active Quests` and a calm "Nothing is scheduled for today." (no list) |
| Error | "Local data could not be loaded", a hint chosen from the `FailureReason`, and **Retry** (re-opens and re-initializes). No reset or delete action; nothing is deleted; no raw error text |

Completion failures and rejections are shown inline above the quest list (`role="alert"`); the success line is a persistent `role="status"` region.

## Phase 04 limitations (deliberate)

- **No live midnight rollover.** There is no timer, resume reconciliation or catch-up; Phase 06 owns them. If the app stays open past midnight, the old day's quests stay on screen; tapping one is refused by the domain (`day_ended`) with a message and a Refresh button, which simply re-runs the same load against the current date (as a reload would). Nothing is finalized or summarized.
- **No streak.** PHASE_PLAN and MASTER_SPEC §14.1 list a streak on Home; the persisted streak lifecycle is Phase 06, so Phase 04 shows none rather than a fake `0`.
- **No quest management.** No create / edit / archive UI, no user-created quests.
- **No final effects.** No particles, shaders, overlays, Level Up / Rank Up cinematics; visuals are restrained (Phase 09 / 10).
- **No Player Name or onboarding** (Phase 11); the label is the neutral `PLAYER`.
- **No total completed-quests count on Status.** Persistence has no count primitive; the only way to get one is to load every completion or ledger row, so it is omitted rather than expanding persistence.
- **Daily Message is not persisted** (DATA_MODEL §13 describes a persisted per-date assignment; MASTER_SPEC §13 allows "deterministic or persisted"). Not implemented unless historical stability is ever wanted.
- No service worker / PWA work, no Backup UI, no `localStorage` for core state.

## Tests

- `src/application/**` (node environment, `fake-indexeddb`): seeds (including the stale-lookup race), today loader (generic recurrences, snapshot authority, ordering, empty day), completion flow (idempotency, wrong day, level up, failure), Daily Message, initialization (restart, existing and restored databases), clock and error classification.
- `src/features/**`, `src/app/**`, `src/components/**` (jsdom): the real runtime provider, application services, persistence and domain over a fake IndexedDB with an injected clock; only the IndexedDB factory and clock are fake.
- `src/platform/clock.test.ts`: the system clock adapter.
