# SoloLevelingTaskList — Current State

Short session handoff. Verified at the end of Phase 09 (feature commit `695ca08`). Authoritative rules stay in `docs/MASTER_SPEC.md`; this file only orients a fresh session.

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

**Phase 10 (Effects / Animations / Event Engine) is next and has not started**; it must not start until the owner says so. Phase 09 added **no** effects: no particles, animated borders, overlays, level-up/rank-up/quest-complete animation, sounds or haptics. `framer-motion` is installed but unused.

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

- `src/domain` — pure deterministic game rules. No React, storage, clock or randomness. Public API: `src/domain/index.ts`. Phase 08 added `stats/` (ledger, daily and weekly statistics; history normalization) and `achievements/` (catalog, engine). Phase 09 added `quests/order.ts` (the manual-order rule).
- `src/persistence` — native IndexedDB, repositories, atomic commands (Phase 09: `appendTemplate`, `reorderTemplates`), backup. Depends on domain only. `migrations/v4.ts` is **version-frozen** (do not edit; it reproduces the Phase 08 order).
- `src/application` — framework-free use cases over `ApplicationContext { database, clock, ids }`. Depends on domain + persistence only. Public API: `src/application/index.ts`. Quest use cases live in `quests/`; lifecycle (reconcile, synchronization gate, weekly finalization hook) in `lifecycle/`; Daily Report in `report/`; Weekly Goal Crusher use cases in `weekly/`; read-only profile, achievement and Daily History loads (`LoadResult<T>`) in `player/`.
- `src/platform` — the only readers of the environment: `clock.ts` (Date/Intl), `ids.ts` (Web Crypto). Imports no other layer.
- `src/app` — `AppRuntimeProvider` (owns the one DB handle), `useDaySync` (startup/resume/midnight sync), route table, router.
- `src/features` — React feature UI: `home/`, `status/`, `achievements/`, `quests/`, `weekly/`, `report/`, plus `displayLabels.ts` (presentation text only).
- `src/components` — reusable layout/UI (`AppShell`, `BottomNav`; `ui/`: `Panel`, `SectionLabel`, `RankBadge`, `MeterBar`, `ExpProgressBar`, shared class strings in `styles.ts`). Design tokens, the `@font-face` for **Oxanium** (bundled locally in `src/assets/fonts/`, OFL, latin variable woff2, display text only) and the `system-*` CSS classes live in `src/styles/globals.css`; components use tokens, never hard-coded colours. Static SYSTEM look only.
- `src/test` — shared test helpers (`renderApp`, `questUi`, `weeklyUi`, `historyUi`).
- `_reference/` — local, read-only, git-ignored visual reference pack. Never modify, never import.

UI talks to `@/application`, never to repositories. The provider is the only UI file that imports `@/persistence`.

## Current UI

Bottom nav: **Home · Quests · Weekly · Status** (56 px targets; height is the `--nav-height` token, which also drives the page's bottom padding). Every screen uses the static SYSTEM language (`[ LABEL ]` headings, panels, Oxanium for app-owned labels and numerals).

- `/` Home — player/level/rank, Daily Message, today's progress, Daily Streak (+ "STREAK SECURED" at ≥70 %), today's quests, 48 px "+" Add Quest, a small Weekly Goal Crusher card, one dismissible reconciliation notice after a catch-up ("N days reconciled." and/or "1 weekly board finalized (+EXP)."), and a clock-behind notice instead of the quests when paused.
- `/quests`, `/quests/new`, `/quests/:templateId/edit` — Quests: Active/Archived views, create/edit form, archive confirmation, restore; the Active list is the manual order (position numbers, drag handle, Move Up/Down).
- `/weekly`, `/weekly/edit`, `/weekly/history` — Weekly: this week's board (or the "set this week's Goal Crushers" invitation), the create/edit form, the last finished week with CLAIM REWARD, and the finalized-weeks history.
- `/status` Status — player (level, rank, lifetime EXP, level bar) and streaks from the runtime snapshot, then statistics derived from history: Days (finalized/70%+/85%+/Perfect/Incomplete, neutral No Active Quests days, completion rate), Quests (completed, quest EXP, active, the five categories, Top 3), Weekly Goal Crusher (weeks completed, Perfect Weeks, best/average score, bonus EXP, rewards claimed) and Achievements (unlocked/28, 3 most recent).
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
- **IndexedDB is the durable source of truth**; localStorage only for tiny cosmetic prefs.
- **Only six default seeds:** Fajr, Dhuhr, Asr, Maghrib, Isha (E/Discipline) and Sleep before 00:00 (D/Discipline, role `sleep`). Seeds are manageable but keep id, `seedKey`, `role`; an archived seed is never re-seeded.
- Goal Crushers are not quests and never touch the daily denominator or streak. Achievements award 0 EXP.
- **Statistics and achievements are derived on every read** from the XP ledger, Daily Summaries and finalized weekly boards (`docs/PROGRESSION_STATS_ACHIEVEMENTS.md`). Nothing is stored: **no achievement persistence, no unlock row, no migration** (this intentionally replaces the old `achievementUnlocks` design). An unlock is dated by the exact record that first qualified it; days and weeks count only once finalized; the history is normalized internally so caller order cannot matter. The V1 catalog is **28 achievements**, quest-agnostic, 0 EXP. Category stats are quest EXP only (the weekly bonus has no category); quest stats come from immutable ledger rows, so editing or archiving a template never changes them (a Top-3 label falls back to stored history, then to "Unknown quest").
- **Weekly Goal Crusher** (details in `docs/WEEKLY_GOAL_CRUSHER.md`): one board per local Monday→Sunday week, `WeekKey` = the Monday; created for the current week only, editable until finalization. Goal weights total **exactly 10**. Tracking is **Manual Numeric** or **Linked Quest Completion Count** (one quest; completions dated inside the week, counted from Monday, derived on read) — nothing else. Scoring is **binary per goal** (`progress ≥ target` earns its full points; no fractions). Bonus EXP is a single lookup: 0–5 → 0 · 6 → 100 · 7 → 150 · 8 → 225 · 9 → 325 · 10 → 500 (`WEEKLY_BONUS_EXP`, domain only).
- **Weekly finalization is exactly-once and immutable.** One transaction writes the frozen board and the single bonus ledger row (`weekly_goal_crusher:{weekKey}`, no category, `createdAt` = real instant, `effectiveDate` = Sunday, `sourceWeekKey` = Monday). The exact progress scored is frozen per goal in `finalization.goalResults`; history views read only that snapshot. A finalized board is refused by the domain, the application and the persistence commands. A week without a board leaves no record, bonus or penalty.
- **Weekly reconciliation runs after the daily reconciliation** (`finalizeDueWeeks`: every active board whose Sunday has passed, oldest first). Real-life reward claims (highest tier only; needs finalization and non-blank text) record a claim and award **no EXP**.

## Current database schema

Database `solo-leveling-task-list`, `DATABASE_VERSION` **4**, backup `schemaVersion` **4**. Seven stores:

1. `questTemplates` (mutable, soft-archived; every row has a required unique `sortOrder` since v4)
2. `questOccurrences` (insert-only)
3. `questCompletions` (insert-only)
4. `xpTransactions` (append-only ledger)
5. `dailySummaries` (insert-only, key `dateKey`, index `quality`; added in v2)
6. `weeklyBoards` (key `weekKey`, index `status`; mutable only while `active`, written only by the weekly commands; added in v3)
7. `weeklyRewardClaims` (key `weekKey`, insert-only; added in v3)

Phase 08 added no store and no migration (there is no achievement store). **Phase 09 added schema v4 / backup 4: no new store or index, only the `sortOrder` field**, backfilled once by the version-frozen `migrations/v4.ts` (all-or-nothing, preserves the Phase 08 visible order) and by the backup upgrade `3 → 4` (same function). Import and integrity reject a duplicate or invalid `sortOrder`.

New stores arrive only through versioned migrations in their owning phase (bump `DATABASE_VERSION`, add `migrations/vN.ts`, and bump `BACKUP_SCHEMA_VERSION` with an upgrade when the stored model changes).

## Current test baseline

**1,534 passing tests** in 81 files (Phase 02: 250 · Phase 03: 421 · Phase 04: 521 · Phase 05: 805 · Phase 06: 912 · Phase 07: 1,244 · Phase 08: 1,396 · Phase 09: 1,534). `npm run lint`, `typecheck`, `test:run` and `build` all pass.

## Important current limitations / next work

- Daily History and Weekly History are plain lists (no charts); there is no EXP ledger view. A stale "day ended" message can linger on Home until the next action or Refresh.
- Archiving or rescheduling Sleep means some days have no Sleep occurrence; none is invented.
- An active One-Time quest whose date passed stays listed ("Date passed") until archived; nothing auto-archives it.
- No effects/animation (Phase 10), Player Awakening/name, or PWA/service worker. No Backup/Restore UI. Reordering exists only on `/quests` (Home follows it); a completed quest keeps its place; the order is one global list shared by every day.
- Achievements appear only once a day or week is finalized (a first Perfect Day shows the next morning); a level crossed by a weekly bonus is dated to that week's Sunday. Each Status/Achievements load reads the whole ledger (fine for one player). No unlock notifications or events (Phase 10), and no durable "seen" flag.
- **Non-blocking QA notes (Phase 13 / later):** (1) real Android finger-based quest dragging has **not** been tested (Phase 09 drag was verified with synthetic pointer events on the real layout and in automated tests; edge auto-scroll only in a deterministic test); (2) desktop-width manual verification was unavailable in the Phase 09 browser pane (the centred `max-w-md` column is unchanged); (3) timing-related test flakiness under load remains for Phase 13: `HomeLifecycle.test.tsx` (Phase 08) and `WeeklyPage.test.tsx` (Phase 09) each timed out once in a loaded full run and passed in isolation and on a clean rerun.
- Weekly: a saved board can only be edited, not deleted; a quest completion does not emit `WeeklyGoalCompleted` (Phase 10 decides, OD-20); the production bundle is ~536 kB (above Vite's 500 kB advisory; code splitting is a later-phase concern). The Oxanium font is a separate ~14 kB hashed asset.
- **LAN HTTP lacks `crypto.subtle`** (secure-context only), so the backup checksum fails (`checksum_unavailable`) when the app is opened over plain HTTP on a LAN IP. Relevant to the backup UI and phone testing. `crypto.randomUUID` is also absent there; `systemIds` falls back to `getRandomValues`.

Done (see `docs/PHASE_PLAN.md`): 06 Daily Lifecycle · 07 Weekly Goal Crusher · 08 Progression/Stats/Achievements · 09 Visual SYSTEM Layer + manual quest ordering. **Next: 10 Effects / Animations / Event Engine** (still pending, nothing started), then 11 Player Awakening · 12 PWA · 13 QA/hardening · 14 Polish · 15 optional Android.

## Open decisions relevant later

Active ones only (details in `docs/OPEN_DECISIONS.md`):

- **OD-18** semantic quest identity for e.g. "Gym" — **open, deferred beyond V1** (Phase 08 shipped quest-agnostic achievements only; needed only if a quest-specific achievement is wanted).
- **OD-09** typography — **decided in Phase 09** (Oxanium display font, platform body font); `docs/OPEN_DECISIONS.md` has not been updated to say so.
- **OD-06** sounds; **OD-07** haptics; **OD-08** animation timings/intensity; **OD-20** which moment is the Goal Crusher spectacle — Phase 10.
- **OD-04** final Daily Message catalog — Phase 14.
- **OD-15 (remaining)** seeding any default beyond the six — before any further default is seeded.

Resolved and retired (rules live in `MASTER_SPEC` / `DAILY_LIFECYCLE` / `WEEKLY_GOAL_CRUSHER` / `PROGRESSION_STATS_ACHIEVEMENTS`): OD-01, 02, 03, 05, 10, 11, 12, 13, 14, 16, 17, 19, 21, 22.

## Commands and working conventions

- `npm run lint` · `npm run typecheck` · `npm run test:run` · `npm run build` · `npm run dev`.
- Each phase starts with a **kickoff proposal and waits for an explicit "go"** before any code; it ends with a report and stops for approval. Do not start the next phase on your own.
- Commit with the message the owner specifies; `git push origin main` (no upstream is configured); never force-push.
- Windows shell: no Python. Working-tree docs/sources may be CRLF while the index is LF; this is normal (autocrlf).
- Browser pane checks: interact at ≤455 px viewport height (e.g. 360×440); a taller emulated viewport is scaled and mis-maps clicks. Layout can be audited via DOM measurements at 360×800 and 320×568. An unfocused or hidden pane does not run `requestAnimationFrame` and can report a tiny viewport, so animation-frame behaviour (and desktop-width checks) cannot be observed there.

## How future sessions should resume

After /clear, read `CLAUDE.md` and `docs/CURRENT_STATE.md` first.
Do NOT automatically reread every historical specification.
Read detailed docs only when the current phase requires them or an ambiguity/conflict is found.
