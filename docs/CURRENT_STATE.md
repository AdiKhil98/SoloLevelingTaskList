# SoloLevelingTaskList — Current State

Short session handoff. Verified at the end of Phase 11 (HEAD `aee0493`; feature commit `f1d1320`, RTL follow-up `aee0493`). Authoritative rules stay in `docs/MASTER_SPEC.md`; this file only orients a fresh session.

## Completed phases

- **Phase 00** — product/architecture specification (`docs/MASTER_SPEC.md`, `DATA_MODEL.md`, `PHASE_PLAN.md`, `OPEN_DECISIONS.md`).
- **Phase 01** — React/Vite/TypeScript/Tailwind foundation, lint-enforced layer boundaries.
- **Phase 02** — pure domain/game engine (`docs/DOMAIN_ENGINE.md`).
- **Phase 03** — IndexedDB persistence + JSON backup/restore (`docs/PERSISTENCE.md`).
- **Phase 04** — functional Home/Status UI, default seeds, quest completion (`docs/CORE_UI.md`).
- **Phase 05** — Quest Management: create/edit/archive/restore (`docs/QUEST_MANAGEMENT.md`).
- **Phase 06** — Daily Lifecycle: day finalization, Daily Summaries, reconciliation, streaks, live Daily Report, backward-clock guard (`docs/DAILY_LIFECYCLE.md`).
- **Phase 07** — Weekly Goal Crusher: weekly boards, weighted goals, manual/linked progress, binary scoring, one-time weekly bonus, immutable finalized snapshots, reward claiming (`docs/WEEKLY_GOAL_CRUSHER.md`).

- **Phase 08** — Progression / Stats / Achievements: statistics and achievements derived from immutable history; Status dashboard, `/achievements`, Daily History (`docs/PROGRESSION_STATS_ACHIEVEMENTS.md`).

- **Phase 09** — Visual SYSTEM redesign + manual quest ordering: static SYSTEM look across the app, bundled Oxanium font, persistent `QuestTemplate.sortOrder`, drag + Move Up/Down on `/quests` (`docs/VISUAL_SYSTEM_AND_ORDERING.md`).

- **Phase 10** — Effects / Animations / Event Engine: one centralized in-memory presentation queue, quest `+EXP` feedback, the HUD progression hold, Level/Rank overlays, evidence-based achievement celebrations, live Perfect Day, the Weekly Goal Crusher finalization spectacle, text/particle/aura/border effects, NORMAL/REDUCED effects, local presentation settings and a DEV-only effects lab (`docs/EFFECTS_EVENT_ENGINE.md`). Feature commit `dd4ae01`.

- **Phase 11** — Player Awakening / first launch / Player Name: a `playerProfile` identity row (IndexedDB schema v5, backup 5), the first-launch Awakening screen, name entry and rename from Status (`docs/PLAYER_AWAKENING.md`). Feature commit `f1d1320`; RTL follow-up `aee0493` (current HEAD).

**Phase 12 (PWA / Android / offline) is next and has NOT started**; it must not start until the owner says so. `framer-motion` is still installed but unused (Phases 10 and 11 used CSS and small hooks).

## Player identity / Awakening (Phase 11, implemented)

Full detail in `docs/PLAYER_AWAKENING.md`. Essentials:

- **Identity and presentation only.** No XP, level, rank, achievement, quest seed, weekly or streak rule reads or changes the name or the Awakening state.
- **Store and gate.** IndexedDB **schema v5**, backup **5**. The `playerProfile` store holds at most one row `{ id: 'player', name: string | null, awakenedAt: EpochMs | null }`. **Row existence is the only "Awakening complete" gate.** `name: null` means no name chosen (the screens show `PLAYER`, text that lives only in `displayLabels.ts`). **`awakenedAt: null` on a migrated row is legacy metadata (a pre-Phase-11 player with no real Awakening timestamp) and NEVER means onboarding is required.**
- **Migration, exactly.** The v5 migration is told `originalFrom`: the version the database had BEFORE the whole upgrade (not the previous step; `runMigrations` passes it, and a new database runs migrations 1–5 in one upgrade). **Fresh database (`originalFrom === 0`, 0→5): the store is created EMPTY, so Awakening is required. Existing database (`originalFrom >= 1`: 4→5, or 1/2/3→5): the store is created with the legacy-completed row `{ id: 'player', name: null, awakenedAt: null }`, so Awakening never plays.** The rule is the version, not the data (an empty v4 database is still an existing installation); the upgrade is all-or-nothing. `migrations/v5.ts` is version-frozen. Backups older than schema 5 get the same legacy row from the backup upgrade (pure, no timestamp); a schema-5 backup carries its own profile (0 or 1 rows; a restore is a full replace, so a backup made before Awakening finished restores as "not awakened").
- **Startup order.** `loadAwakeningState` (read-only) runs **before** `startApplication`. Required → the provider shows the Awakening screen and **nothing is created** (no default quests, no occurrences, no reconciliation) until the identity is saved; complete → the normal startup. A missing row on a database that already has quests, or a damaged row, is treated as awakened with `PLAYER` (never a first launch; a rename repairs it); `renamePlayer` on a not-awakened database writes nothing (`not_awakened`). `completeAwakening` is one atomic add-if-absent (a repeat or a second tab never replaces the stored name); `startApplication` begins as soon as it is saved, while the reveal plays. A failed save keeps the player on the name stage; a startup failure after the save shows the usual error screen and **Retry never replays Awakening**. A refresh or close before the save restarts from the top (no draft is kept); after the save the next launch is a normal one.
- **Sequence.** Pure state machine (`features/awakening/machine.ts`), lazy-loaded screen: **boot → notice → identify → registering → complete**, then an exit fade into the app. **ACCEPT is explicit:** the tap, Enter, Space or Escape that finishes the notice text animation can never accept (a held key finishes nothing), and ACCEPT ignores taps for a short guard after it appears. Timings are data (`PresentationTimings.awakening`, NORMAL and REDUCED sets). About 7 s unskipped, once ever.
- **Name.** Persistent profile data in IndexedDB and backups, **not `localStorage`**. Rules in `domain/profile/playerName.ts`: Unicode NFC; whitespace runs collapsed and trimmed; control, private-use, lone-surrogate and invisible format characters rejected (ZWJ and ZWNJ allowed); at least one visible character; at most **20 graphemes** (plus a 96-code-unit guard); blank means no name. In Awakening a blank field never confirms (SKIP stores `null`). The name is only ever rendered as text.
- **Rename.** Status has an IDENTITY panel (inline editor). One atomic write, immediate UI update, never reruns Awakening, never touches progression, does not synchronize the day (so it works while the clock is behind), repairs a missing or damaged row.
- **RTL.** The name is bidirectionally isolated wherever it appears: its own `<bdi>` on Home and the Status Player row, `dir="auto"` on its own element in the IDENTITY panel and the input. The COMPLETE welcome keeps the static `WELCOME,` apart from the name, which sits alone in `<bdi dir="auto">` (a single `dir="auto"` paragraph took the Latin W's direction); the label is typed first, then the name (the split is the pure `welcomeTyping.ts`), and screen readers get the complete natural message once.
- **Effects and reduced motion.** NORMAL reuses the Phase 10 finite primitives (scramble, typing, particle bursts, aura, border light) and one haptic cue (`awakening`; sound is OFF by default). REDUCED shows every message at once with 150 ms fades and no particles, scramble, typing or sweep; the OS reduced-motion setting forces it. Timers count visible time only.
- **Reference image not shipped.** `Level Up_ Play this game.png` has unclear provenance/licensing and a near-verbatim series line; it was composition inspiration only. The screen is built from the app's own tokens and CSS (this supersedes the `PHASE_PLAN` line about copying it).
- **DEV preview.** `/dev/effects` has an Awakening section with a stubbed `save`; it imports no application or persistence code, so it cannot read or write the real name or Awakening state, and it is excluded from production builds with the lab.
- **Test harness.** `renderApp` pre-awakens its database by default (`awakened: false` plays the real first launch); helpers `identity.ts`, `AwakenedGate.tsx`, `flakyWrites.ts`. Tests that count database connections seed the real factory first.

## Presentation / effects (Phase 10, implemented)

Full detail in `docs/EFFECTS_EVENT_ENGINE.md`. Essentials:

- **Cosmetic only.** Presentation consumes domain results and never decides EXP, levels, streaks, scores or unlocks. **No new store and no migration: IndexedDB stays schema v4, the backup stays schema 4.**
- **Flow:** `AppRuntimeProvider` is the only caller of the game use cases, so it feeds the one queue. `application/presentation/presentationEvents.ts` returns the events worth presenting for one completion or one reconciliation; `effects/plan.ts` (pure) turns them into entries; `effects/queue.ts` (pure reducer) orders them; `PresentationHost` (in `AppShell`, above every route) renders them. The queue is **in memory only**: a reload drops anything pending and nothing replays.
- **Classes:** minor (inline feedback) · medium (one SYSTEM popup) · major (modal overlay) · critical (heaviest overlay). Medium and above show one at a time, first in first out, with id deduplication and a soft bound of 8 waiting entries (only lighter popups are ever dropped; major/critical never are). Within a batch, progression always comes before achievements.
- **Achievements:** celebrated only when the record that unlocked them (the new ledger row, or a day/week just finalized) was written by this action. **No seen/unseen state is stored**; old unlocks cannot replay, and achievements still award 0 EXP.
- **HUD progression hold:** while a Level Up waits, Home keeps the old level and rank with a full bar until its overlay is open (capped at 1.5 s); `ExpProgressBar` snaps instead of draining when its value drops.
- **Level / Rank:** one overlay per award (`LV. 9 → LV. 12`, then the rank phase if a boundary was crossed); Level 100 → `S-RANK → ???`; levels above 100 are ordinary Level Ups.
- **Perfect Day / Weekly:** a live 100 % day says "ALL DAILY QUESTS COMPLETE" and never claims finalization. The Weekly Goal Crusher spectacle is the **finalization** moment, tiered by score (0–5 restrained popup, 6–7, 8–9, 10 = Perfect Week); a live goal or live 10/10 is only a small notice because it is still reversible. Only a **strict overnight** reconciliation (≤ 1 finalized day and ≤ 1 finalized board) is presented; longer catch-up stays silent (OD-21 preserved).
- **Effects:** typewriter and scramble text (full final text kept for screen readers), finite particle bursts, aura and border light, all mounted only inside an overlay and ended by themselves; the overlays are a lazy chunk with a plain fallback if it cannot load.
- **Reduced motion and settings:** NORMAL or REDUCED; the OS reduced-motion setting always forces REDUCED. Haptics default **ON**, sound (original, synthesized with Web Audio, no asset files) default **OFF**. The three preferences live in `localStorage` (`sltl.effects-settings.v1`), are per device, are **outside backups**, and are edited in the SYSTEM SETTINGS panel at the end of `/status`.
- **DEV-only `/dev/effects` lab:** injects synthetic events into the same queue, writes nothing, and is removed from production builds (guarded by `import.meta.env.DEV`).

## Manual quest ordering (Phase 09, implemented)

Full detail in `docs/VISUAL_SYSTEM_AND_ORDERING.md`. Essentials:

- `QuestTemplate.sortOrder` is a required, **unique non-negative safe integer**, one sequence over all templates (active and archived). It is presentation only: it never changes `revision`/`updatedAt` and is never stored on an occurrence. The rule is `domain/quests/order.ts` (`compareQuestOrder`: sortOrder, then createdAt, then id as damaged-data tie-breakers); Home, the Quests list and the Weekly quest picker share it.
- **New quests (and seeds) go to the bottom** (`appendTemplate`: max + 1 in one transaction; renumbers first if the max is `Number.MAX_SAFE_INTEGER`). Seeded prayers and custom quests are equally movable; there is no prayer-first rule.
- **Edits preserve order:** `updateTemplate` writes back the stored `sortOrder` read in the same transaction, so a stale form cannot overwrite a newer order. **Archive/restore preserve the slot:** neither touches `sortOrder`, and reordering only permutes the active slots, so a restored quest returns to its previous slot.
- **Reorder** is one atomic command (`reorderTemplates({ expectedOrder, newOrder })`) behind the normal day-sync gate. **Stale-tab protection:** it refuses (`stale_order`) unless `expectedOrder` equals the stored active order, and rejects a non-permutation; refusals, "unchanged" and failures write nothing, and the Quests page reloads the list and says so.
- **Today's occurrences:** Home sorts by the template's `sortOrder`; snapshots, completions, the ledger and the denominator are untouched. An occurrence with no template sorts last.
- **UI (`/quests` only; Home just follows):** pointer drag on a handle (no library; stores once on release; cancel/Escape/hidden/leave write nothing; edge auto-scroll) plus accessible Move Up / Move Down buttons with focus kept and a live announcement.

## Architecture map

Imports go one way; ESLint enforces it (`eslint.config.js`).

- `src/domain` — pure deterministic game rules. No React, storage, clock or randomness. Public API: `src/domain/index.ts`. Phase 08 added `stats/` (ledger, daily and weekly statistics; history normalization) and `achievements/` (catalog, engine). Phase 09 added `quests/order.ts` (the manual-order rule). Phase 10 added two event types (`PerfectDayReached`, `AchievementUnlocked`) and their pure builders. Phase 11 added `profile/playerName.ts` (the player-name rules: `parsePlayerName`, `isStoredPlayerName`, the 20-grapheme limit).
- `src/persistence` — native IndexedDB, repositories, atomic commands (Phase 09: `appendTemplate`, `reorderTemplates`), backup. Depends on domain only. `migrations/v4.ts` is **version-frozen** (do not edit; it reproduces the Phase 08 order). Phase 11: `migrations/v5.ts` (version-frozen; migrations now receive `{ originalFrom }`), `records/playerProfile.ts`, `repositories/playerProfile.ts`, `commands/completeAwakening.ts` and `commands/renamePlayer.ts`; the profile is part of the dataset, backup and integrity checks.
- `src/application` — framework-free use cases over `ApplicationContext { database, clock, ids }`. Depends on domain + persistence only. Public API: `src/application/index.ts`. Quest use cases live in `quests/`; lifecycle (reconcile, synchronization gate, weekly finalization hook) in `lifecycle/`; Daily Report in `report/`; Weekly Goal Crusher use cases in `weekly/`; read-only profile, achievement and Daily History loads (`LoadResult<T>`) in `player/`; `presentation/` (Phase 10) returns the domain events one completion or one reconciliation may present. Phase 11: `profile/awakening.ts` (`loadAwakeningState`, `completeAwakening`, `renamePlayer`; the view type is `PlayerIdentity`, because `PlayerProfile` already means the derived statistics).
- `src/effects` — Phase 10. Imports `domain` only (ESLint-enforced). The pure planner and queue (`plan.ts`, `queue.ts`, `controller.ts`), timings, settings model and store, haptic patterns, synthesized sound cues, and the domain-agnostic effect primitives (`ParticleBurst`, `TextScramble`, `Typewriter`, `useCountUp`). Phase 11: `PresentationTimings.awakening` (the Awakening timings) and the `awakening` cue (a haptic pattern plus a short synthesized score).
- `src/platform` — the only readers of the environment: `clock.ts` (Date/Intl), `ids.ts` (Web Crypto) and, since Phase 10, `preferences.ts` (localStorage, `matchMedia`), `haptics.ts` (Vibration API), `audio.ts` (Web Audio) and `page.ts` (visibility). Every call is guarded and never throws. Imports no other layer.
- `src/app` — `AppRuntimeProvider` (owns the one DB handle and the presentation runtime), `useDaySync` (startup/resume/midnight sync), route table (`buildAppRoutes`), router. Phase 11: the provider decides Awakening before `startApplication` (runtime state `awakening`, lazy-loaded screen) and exposes `identity` (`name`, `rename`).
- `src/features` — React feature UI: `home/`, `status/`, `achievements/`, `quests/`, `weekly/`, `report/`, `presentation/` (the host, popups, lazy overlays, Settings panel, dev lab), plus `displayLabels.ts` (presentation text only). Phase 11: `awakening/` (`machine.ts`, `AwakeningFlow.tsx`, `copy.ts`, `types.ts`, `welcomeTyping.ts`), `identity/` (shared name field and draft hook), `status/IdentityPanel.tsx`, `presentation/dev/AwakeningPreview.tsx`.
- `src/components` — reusable layout/UI (`AppShell`, `BottomNav`; `ui/`: `Panel`, `SectionLabel`, `RankBadge`, `MeterBar`, `ExpProgressBar`, shared class strings in `styles.ts`). Design tokens, the `@font-face` for **Oxanium** (bundled locally in `src/assets/fonts/`, OFL, latin variable woff2, display text only) and the `system-*` CSS classes live in `src/styles/globals.css`; components use tokens, never hard-coded colours. The base surfaces are static; the earned-event effect classes (`system-fx-*`) are a separate, clearly marked block at the end of the stylesheet and animate only inside elements marked `data-fx="normal"`.
- `src/test` — shared test helpers (`renderApp`, `questUi`, `weeklyUi`, `historyUi`, and since Phase 10 `events`, `presentationUi`, `presentationTimings`). `renderApp` defaults to zero presentation delays and no count-up so existing tests stay deterministic. Phase 11: `renderApp` pre-awakens its database by default (`awakened: false` plays the real first launch); `identity.ts`, `AwakenedGate.tsx`, `flakyWrites.ts`.
- `_reference/` — local, read-only, git-ignored visual reference pack. Never modify, never import.

UI talks to `@/application`, never to repositories. The provider is the only UI file that imports `@/persistence`.

## Current UI

Bottom nav: **Home · Quests · Weekly · Status** (56 px targets; height is the `--nav-height` token, which also drives the page's bottom padding). Every screen uses the SYSTEM language (`[ LABEL ]` headings, panels, Oxanium for app-owned labels and numerals); ordinary reading stays calm, and motion appears only for earned events (Phase 10).

- `/` Home — player/level/rank, Daily Message, today's progress, Daily Streak (+ "STREAK SECURED" at ≥70 %), today's quests, 48 px "+" Add Quest, a small Weekly Goal Crusher card, one dismissible reconciliation notice after a catch-up ("N days reconciled." and/or "1 weekly board finalized (+EXP)."), and a clock-behind notice instead of the quests when paused.
- `/quests`, `/quests/new`, `/quests/:templateId/edit` — Quests: Active/Archived views, create/edit form, archive confirmation, restore; the Active list is the manual order (position numbers, drag handle, Move Up/Down).
- `/weekly`, `/weekly/edit`, `/weekly/history` — Weekly: this week's board (or the "set this week's Goal Crushers" invitation), the create/edit form, the last finished week with CLAIM REWARD, and the finalized-weeks history.
- `/status` Status — player (level, rank, lifetime EXP, level bar) and streaks from the runtime snapshot, then statistics derived from history: Days (finalized/70%+/85%+/Perfect/Incomplete, neutral No Active Quests days, completion rate), Quests (completed, quest EXP, active, the five categories, Top 3), Weekly Goal Crusher (weeks completed, Perfect Weeks, best/average score, bonus EXP, rewards claimed) and Achievements (unlocked/28, 3 most recent); a SYSTEM SETTINGS panel at the end (Effects NORMAL/REDUCED, Haptics, Sound). Phase 11 added an IDENTITY panel after the level windows (the player name with an inline editor); the Home PLAYER heading and the Status Player row show the chosen name (`PLAYER` when none).
- `/dev/effects` — the development-only effects lab; it does not exist in production builds and is not in the navigation. It also has an Awakening preview section (stubbed save; it never writes real state).
- First launch (no route): for a brand-new player the Awakening screen replaces the whole app (no Home, no bottom navigation) until the identity is saved; see "Player identity / Awakening".
- `/achievements` — all 28 achievements, grouped, locked/unlocked with progress and unlock date (reached from Status; the Status tab stays highlighted). `/status/history` — Daily History: every finalized day, newest first, 30 at a time.
- `/report` Daily Report — LIVE / PROVISIONAL view of the day in progress (opened by completing Sleep or from Home); not in the bottom nav.

## Core rules future phases must preserve

- **Completion is final.** No uncheck, no undo. Completion + its XP row are written in one transaction; a completion cannot exist without its EXP.
- **EXP never decreases.** The XP ledger is authoritative; total EXP, level and rank are derived from it.
- **Difficulty EXP:** E 10 · D 20 · C 35 · B 55 · A 80 · S 120 (`DIFFICULTY_EXP` in the domain only). There is **no custom XP override**; no editable EXP field anywhere.
- **Occurrence snapshots are immutable.** One occurrence per (template, date) (`occ:{templateId}@{dateKey}`), insert-only, EXP frozen at creation.
- **Edit** never changes an existing occurrence; new values apply only to occurrences created afterwards (if none exists for today yet, the edited template decides whether today's is created).
- **Create** — if eligible today, today's occurrence is created at once; never retroactive.
- **Archive** — `status: 'archived'` is authoritative (`activeUntil` is only validation bookkeeping). It stops future generation; today's existing occurrence stays visible, completable and in today's denominator; history is untouched. Templates are never hard-deleted.
- **Restore** reactivates; an existing occurrence is reused; nothing generated retroactively.
- **Management actions award 0 EXP** and write no occurrence/completion/ledger rows.
- **Daily completion is count-based** (`completed / eligible`), never XP-weighted. Quality by exact ratio: <70% Incomplete, ≥70 Completed, ≥85 Strong, 100 Perfect. Zero eligible = No Active Quests (neutral for streaks). Displayed % floors.
- **Midnight (device-local) is the only day boundary.** Dates are `DateKey` `YYYY-MM-DD`; all date math lives in the domain; no ad-hoc `new Date()` in components.
- **Levels:** `XP_TO_NEXT(L) = round(100 + 35·(L−1)^1.25)`; no level cap, progression continues past 100.
- **Ranks (from level):** E 1–9 · D 10–19 · C 20–34 · B 35–49 · A 50–74 · S 75–99 · `special_100_plus` ≥100 (displays `???`; OD-01 resolved in Phase 08, the label lives only in `displayLabels.ts`).
- **Streaks change only when a day is finalized.** Finalized day ≥70 % → Daily Streak +1; <70 % → 0; No Active Quests → neutral. Perfect Day (100 %) → Perfect streak +1 and Total Perfect Days +1; any other active day resets the Perfect streak; Total never decreases. Finalization awards 0 EXP. No streak freezes in V1.
- **The Daily Summary chain is authoritative** for finalized days and streaks (one immutable summary per date, written atomically by `finalizeDayAtomically`; no streak cache). Missed dates are finalized chronologically, materializing eligible occurrences first. A finalized date refuses new completions/occurrences.
- **Every mutating action synchronizes the day first** (completion, create, edit, archive, restore, and the weekly save / progress / claim): refused unless all past days are finalized and the device date is safe. Sync runs on startup, resume and a midnight timer (convenience only).
- **Backward device clock** (date earlier than the last recorded day): safe paused state; nothing finalized, rewritten or materialized; changes refused until the date catches up. Forward clock jumps are not capped or repaired.
- **Sleep is an ordinary quest** (+20 EXP); completing it opens the Daily Report but never finalizes or moves the day.
- **IndexedDB is the durable source of truth**; localStorage only for tiny cosmetic prefs (the Phase 10 presentation settings are the only ones, and they are outside backups).
- **Player identity.** The `playerProfile` row's existence is the only Awakening-complete gate; `awakenedAt: null` is legacy metadata and never means onboarding is required. The name is identity only (no game rule reads it) and lives in IndexedDB and backups, not `localStorage`.
- **Presentation never decides gameplay.** Effects, sounds and haptics only show what the domain already produced; no animation, popup or setting may change EXP, levels, streaks, scores, unlocks or whether a completion is valid.
- **Only six default seeds:** Fajr, Dhuhr, Asr, Maghrib, Isha (E/Discipline) and Sleep before 00:00 (D/Discipline, role `sleep`). Seeds are manageable but keep id, `seedKey`, `role`; an archived seed is never re-seeded.
- Goal Crushers are not quests and never touch the daily denominator or streak. Achievements award 0 EXP.
- **Statistics and achievements are derived on every read** from the XP ledger, Daily Summaries and finalized weekly boards (`docs/PROGRESSION_STATS_ACHIEVEMENTS.md`). Nothing is stored: **no achievement persistence, no unlock row, no migration** (this intentionally replaces the old `achievementUnlocks` design). An unlock is dated by the exact record that first qualified it; days and weeks count only once finalized; the history is normalized internally so caller order cannot matter. The V1 catalog is **28 achievements**, quest-agnostic, 0 EXP. Category stats are quest EXP only (the weekly bonus has no category); quest stats come from immutable ledger rows, so editing or archiving a template never changes them (a Top-3 label falls back to stored history, then to "Unknown quest").
- **Weekly Goal Crusher** (details in `docs/WEEKLY_GOAL_CRUSHER.md`): one board per local Monday→Sunday week, `WeekKey` = the Monday; created for the current week only, editable until finalization. Goal weights total **exactly 10**. Tracking is **Manual Numeric** or **Linked Quest Completion Count** (one quest; completions dated inside the week, counted from Monday, derived on read) — nothing else. Scoring is **binary per goal** (`progress ≥ target` earns its full points; no fractions). Bonus EXP is a single lookup: 0–5 → 0 · 6 → 100 · 7 → 150 · 8 → 225 · 9 → 325 · 10 → 500 (`WEEKLY_BONUS_EXP`, domain only).
- **Weekly finalization is exactly-once and immutable.** One transaction writes the frozen board and the single bonus ledger row (`weekly_goal_crusher:{weekKey}`, no category, `createdAt` = real instant, `effectiveDate` = Sunday, `sourceWeekKey` = Monday). The exact progress scored is frozen per goal in `finalization.goalResults`; history views read only that snapshot. A finalized board is refused by the domain, the application and the persistence commands. A week without a board leaves no record, bonus or penalty.
- **Weekly reconciliation runs after the daily reconciliation** (`finalizeDueWeeks`: every active board whose Sunday has passed, oldest first). Real-life reward claims (highest tier only; needs finalization and non-blank text) record a claim and award **no EXP**.

## Current database schema

Database `solo-leveling-task-list`, `DATABASE_VERSION` **5**, backup `schemaVersion` **5**. Eight stores:

1. `questTemplates` (mutable, soft-archived; every row has a required unique `sortOrder` since v4)
2. `questOccurrences` (insert-only)
3. `questCompletions` (insert-only)
4. `xpTransactions` (append-only ledger)
5. `dailySummaries` (insert-only, key `dateKey`, index `quality`; added in v2)
6. `weeklyBoards` (key `weekKey`, index `status`; mutable only while `active`, written only by the weekly commands; added in v3)
7. `weeklyRewardClaims` (key `weekKey`, insert-only; added in v3)
8. `playerProfile` (key `id`, at most one row `'player'`; added in v5)

Phase 08 added no store and no migration (there is no achievement store). **Phase 09 added schema v4 / backup 4: no new store or index, only the `sortOrder` field**, backfilled once by the version-frozen `migrations/v4.ts` (all-or-nothing, preserves the Phase 08 visible order) and by the backup upgrade `3 → 4` (same function). Import and integrity reject a duplicate or invalid `sortOrder`. **Phase 10 added no store, no field and no migration: the database is still schema v4 and the backup still schema 4.** **Phase 11 added schema v5 / backup 5: the `playerProfile` store** (fresh 0→5: empty, so Awakening is required; existing databases: the legacy-completed row), by the version-frozen `migrations/v5.ts` and the backup upgrade `4 → 5`; see "Player identity / Awakening".

New stores arrive only through versioned migrations in their owning phase (bump `DATABASE_VERSION`, add `migrations/vN.ts`, and bump `BACKUP_SCHEMA_VERSION` with an upgrade when the stored model changes).

## Current test baseline

**1,982 passing tests** in 106 files in the final green Phase 11 run (Phase 02: 250 · Phase 03: 421 · Phase 04: 521 · Phase 05: 805 · Phase 06: 912 · Phase 07: 1,244 · Phase 08: 1,396 · Phase 09: 1,534 · Phase 10: 1,766 · Phase 11: 1,982). `npm run lint`, `typecheck`, `test:run` and `build` all pass.

**Test-harness note (Phase 10).** The Weekly page tests used to fail intermittently in nearly every full run. The cause was test scheduling, not product behavior: vitest ran one worker per core, which oversubscribed the CPU so single UI steps took seconds. `vite.config.ts` now sets `maxWorkers: '50%'`, and the clock-behind test waits for the app's resume listener before changing the clock (a precondition, not a retry). No test was skipped, retried or weakened and no timeout changed. If a UI test times out under load again, check CPU contention before touching timeouts.

**Known test-harness follow-up (recorded at the end of Phase 11).** Timing-sensitive UI tests can still fail intermittently in FULL-suite runs under load, while passing in isolation. This was reproduced on the untouched Phase 10 baseline (`a62ff4f`: 1 of 3 full runs failed), and Phase 11's larger, slower suite (about 105–115 s versus 77–94 s) appears to expose it more often (`f1d1320`: 2 of 3 failed in the same measurement; a small sample). Known examples: `PresentationFlow` (live Perfect Day), `SystemSettingsPanel` (haptics switch), `WeeklyEditor` (clock behind) and `HomeLifecycle` (clock catches up). Known causes of this class: a test that sends a window or document event right after a heading appears, before the effect that registers the listener has run; and jsdom's animation-frame timestamp and `performance.now()` having different origins under load. **Do not weaken assertions or add retries.** Stabilize them (wait for or flush the listener, deterministic setup that does not depend on real animation progress) during Phase 13, unless Phase 12 directly depends on one of them. The Phase 11 tests that raced the page were already fixed (effects are flushed before document key events; the accept-guard test uses a wide margin).

## Important current limitations / next work

- Daily History and Weekly History are plain lists (no charts); there is no EXP ledger view. A stale "day ended" message can linger on Home until the next action or Refresh.
- Archiving or rescheduling Sleep means some days have no Sleep occurrence; none is invented.
- An active One-Time quest whose date passed stays listed ("Date passed") until archived; nothing auto-archives it.
- No PWA/service worker (Phase 12). No Backup/Restore UI. Reordering exists only on `/quests` (Home follows it); a completed quest keeps its place; the order is one global list shared by every day.
- Achievements appear only once a day or week is finalized (a first Perfect Day shows the next morning); a level crossed by a weekly bonus is dated to that week's Sunday. Each Status/Achievements load reads the whole ledger (fine for one player). Unlock celebrations exist (Phase 10) but are deliberately not persisted: a crash between saving and showing loses that one celebration, never the achievement (it stays on `/achievements`).
- **Non-blocking QA notes (Phase 12 / 13 / later):** (1) real Android finger-based quest dragging has **not** been tested (Phase 09 drag was verified with synthetic pointer events on the real layout and in automated tests; edge auto-scroll only in a deterministic test); (2) desktop-width manual verification was unavailable in the Phase 09 browser pane (the centred `max-w-md` column is unchanged); (3) timing-sensitive UI tests: see the known test-harness follow-up above (Phase 13 unless Phase 12 depends on one); (4) **Phase 10 device QA:** real Android haptics are not verified, the synthesized sounds have not been listened to on a device, continuous particle/scramble animation could not be fully observed in the browser pane (it often reports the page hidden, which pauses animation; it was confirmed from drawn frames, computed styles and tests), and real Android effects performance remains for Phase 12/13. Gameplay data is unaffected because presentation is cosmetic and writes nothing to the database; (5) **Phase 11 device QA:** the name field with a real Android soft keyboard (layout while it is open), the `awakening` haptic cue and the continuous Awakening animation on a real phone are not verified (the first-launch layout was checked with DOM measurements at 360×800 and 320×568, and a real v4 → v5 upgrade was verified on Phase 10 data in the pane). A typed name draft is not kept across a refresh, by design.
- Weekly: a saved board can only be edited, not deleted. The production bundle: main JS 516.47 kB (gzip 153.14) plus a 60.60 kB shared chunk that is React itself (gzip 20.28; split out because two lazy chunks now share it), so the startup path is about 578 kB (gzip about 174; the main file is still above Vite's 500 kB advisory; route code splitting is a later-phase concern). Lazy chunks: Awakening 11.00 kB (gzip 3.69, first launch only), overlays 5.51 kB and a 4.91 kB shared `Typewriter` chunk; CSS is about 43.8 kB. The Oxanium font is a separate ~14 kB hashed asset. A weekly result is presented only for a strict overnight reconciliation; after a longer absence it is on Weekly with its CLAIM REWARD. The weekly-goal toast and quest feedback are visual only (the status line and the Weekly screen carry the same facts as text).
- **LAN HTTP lacks `crypto.subtle`** (secure-context only), so the backup checksum fails (`checksum_unavailable`) when the app is opened over plain HTTP on a LAN IP. Relevant to the backup UI and phone testing. `crypto.randomUUID` is also absent there; `systemIds` falls back to `getRandomValues`.

Done (see `docs/PHASE_PLAN.md`): 06 Daily Lifecycle · 07 Weekly Goal Crusher · 08 Progression/Stats/Achievements · 09 Visual SYSTEM Layer + manual quest ordering · 10 Effects / Animations / Event Engine · 11 Player Awakening / first launch / Player Name. **Next: 12 PWA / Android / offline** (not started), then 13 QA/hardening · 14 Polish · 15 optional Android.

## Open decisions relevant later

Active ones only (details in `docs/OPEN_DECISIONS.md`):

- **OD-18** semantic quest identity for e.g. "Gym" — **open, deferred beyond V1** (Phase 08 shipped quest-agnostic achievements only; needed only if a quest-specific achievement is wanted).
- **OD-04** final Daily Message catalog — Phase 14.
- **OD-15 (remaining)** seeding any default beyond the six — before any further default is seeded.

Resolved and retired (rules live in `MASTER_SPEC` / `DAILY_LIFECYCLE` / `WEEKLY_GOAL_CRUSHER` / `PROGRESSION_STATS_ACHIEVEMENTS` / `VISUAL_SYSTEM_AND_ORDERING` / `EFFECTS_EVENT_ENGINE`): OD-01, 02, 03, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 16, 17, 19, 20, 21, 22. (OD-06/07/08/20 were resolved in Phase 10; the V1 sound tones and effect timings are polish for Phase 14, not open decisions.)

## Commands and working conventions

- `npm run lint` · `npm run typecheck` · `npm run test:run` · `npm run build` · `npm run dev`.
- Each phase starts with a **kickoff proposal and waits for an explicit "go"** before any code; it ends with a report and stops for approval. Do not start the next phase on your own.
- Commit with the message the owner specifies; `git push origin main` (no upstream is configured); never force-push.
- Windows shell: no Python. Working-tree docs/sources may be CRLF while the index is LF; this is normal (autocrlf).
- Browser pane checks: interact at ≤455 px viewport height (e.g. 360×440); a taller emulated viewport is scaled and mis-maps clicks. Layout can be audited via DOM measurements at 360×800 and 320×568. An unfocused or hidden pane does not run `requestAnimationFrame` and can report a tiny viewport, so animation-frame behaviour (and desktop-width checks) cannot be observed there. Presentation deliberately waits while the page is hidden; in the pane, overriding `document.visibilityState` to `visible` and dispatching `visibilitychange` releases queued entries, and the dev lab at `/dev/effects` triggers every effect without changing data. To check a new-install flow without touching the pane's existing data, open another origin such as `http://fresh.localhost:5173` (a separate IndexedDB), and bring that tab to the front first: a hidden tab pauses the visible-time timers.

## How future sessions should resume

After /clear, read `CLAUDE.md` and `docs/CURRENT_STATE.md` first.
Do NOT automatically reread every historical specification.
Read detailed docs only when the current phase requires them or an ambiguity/conflict is found.
