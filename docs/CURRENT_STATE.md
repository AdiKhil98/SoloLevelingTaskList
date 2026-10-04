# SoloLevelingTaskList — Current State

Short session handoff. Verified at the end of Phase 08 (feature commit `11f854f`). Authoritative rules stay in `docs/MASTER_SPEC.md`; this file only orients a fresh session.

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

**Phase 09 (Visual SYSTEM redesign + manual quest ordering) is next and has not started**; it must not start until the owner says so.

## Locked Phase 09 requirement: manual quest ordering

Today the daily quest order is fixed (the six defaults first, then user quests by creation time: `compareQuestOrder`). Phase 09 must deliver:

- the user can reorder the daily quests manually;
- seeded prayers and custom quests are both movable;
- a new quest defaults to the bottom;
- editing a quest does not reset its position;
- the chosen order persists;
- a mobile drag handle is preferred, with an accessible Move Up / Move Down fallback.

How the order is stored (and any migration) is for Phase 09's kickoff to propose.

## Architecture map

Imports go one way; ESLint enforces it (`eslint.config.js`).

- `src/domain` — pure deterministic game rules. No React, storage, clock or randomness. Public API: `src/domain/index.ts`. Phase 08 added `stats/` (ledger, daily and weekly statistics; history normalization) and `achievements/` (catalog, engine).
- `src/persistence` — native IndexedDB, repositories, atomic commands, backup. Depends on domain only.
- `src/application` — framework-free use cases over `ApplicationContext { database, clock, ids }`. Depends on domain + persistence only. Public API: `src/application/index.ts`. Quest use cases live in `quests/`; lifecycle (reconcile, synchronization gate, weekly finalization hook) in `lifecycle/`; Daily Report in `report/`; Weekly Goal Crusher use cases in `weekly/`; read-only profile, achievement and Daily History loads (`LoadResult<T>`) in `player/`.
- `src/platform` — the only readers of the environment: `clock.ts` (Date/Intl), `ids.ts` (Web Crypto). Imports no other layer.
- `src/app` — `AppRuntimeProvider` (owns the one DB handle), `useDaySync` (startup/resume/midnight sync), route table, router.
- `src/features` — React feature UI: `home/`, `status/`, `achievements/`, `quests/`, `weekly/`, `report/`, plus `displayLabels.ts` (presentation text only).
- `src/components` — reusable layout/UI (`AppShell`, `BottomNav`, `ExpProgressBar`).
- `src/test` — shared test helpers (`renderApp`, `questUi`, `weeklyUi`, `historyUi`).
- `_reference/` — local, read-only, git-ignored visual reference pack. Never modify, never import.

UI talks to `@/application`, never to repositories. The provider is the only UI file that imports `@/persistence`.

## Current UI

Bottom nav: **Home · Quests · Weekly · Status**.

- `/` Home — player/level/rank, Daily Message, today's progress, Daily Streak (+ "STREAK SECURED" at ≥70 %), today's quests, 48 px "+" Add Quest, a small Weekly Goal Crusher card, one dismissible reconciliation notice after a catch-up ("N days reconciled." and/or "1 weekly board finalized (+EXP)."), and a clock-behind notice instead of the quests when paused.
- `/quests`, `/quests/new`, `/quests/:templateId/edit` — Quests: Active/Archived views, create/edit form, archive confirmation, restore.
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

Database `solo-leveling-task-list`, `DATABASE_VERSION` 3, backup `schemaVersion` 3. Seven stores:

1. `questTemplates` (mutable, soft-archived)
2. `questOccurrences` (insert-only)
3. `questCompletions` (insert-only)
4. `xpTransactions` (append-only ledger)
5. `dailySummaries` (insert-only, key `dateKey`, index `quality`; added in v2)
6. `weeklyBoards` (key `weekKey`, index `status`; mutable only while `active`, written only by the weekly commands; added in v3)
7. `weeklyRewardClaims` (key `weekKey`, insert-only; added in v3)

Phase 08 added **no store and no migration**: the database remains v3 and there is no achievement store.

New stores arrive only through versioned migrations in their owning phase (bump `DATABASE_VERSION`, add `migrations/vN.ts`, and bump `BACKUP_SCHEMA_VERSION` with an upgrade when the stored model changes).

## Current test baseline

**1,396 passing tests** in 72 files (Phase 02: 250 · Phase 03: 421 · Phase 04: 521 · Phase 05: 805 · Phase 06: 912 · Phase 07: 1,244 · Phase 08: 1,396). `npm run lint`, `typecheck`, `test:run` and `build` all pass.

## Important current limitations / next work

- Daily History and Weekly History are plain lists (no charts); there is no EXP ledger view. A stale "day ended" message can linger on Home until the next action or Refresh.
- Archiving or rescheduling Sleep means some days have no Sleep occurrence; none is invented.
- An active One-Time quest whose date passed stays listed ("Date passed") until archived; nothing auto-archives it.
- No final visual effects/animation, Player Awakening/name, or PWA/service worker. No manual quest reordering (locked Phase 09 requirement above). No Backup/Restore UI.
- Achievements appear only once a day or week is finalized (a first Perfect Day shows the next morning); a level crossed by a weekly bonus is dated to that week's Sunday. Each Status/Achievements load reads the whole ledger (fine for one player). No unlock notifications or events (Phase 10), and no durable "seen" flag.
- **Non-blocking QA note:** the Home midnight-timer test (`HomeLifecycle.test.tsx`) showed intermittent timing-related flakiness under load during Phase 08; the final full suite and isolated / clean-`HEAD` reruns passed. Revisit during Phase 13 hardening.
- Weekly: a saved board can only be edited, not deleted; a quest completion does not emit `WeeklyGoalCompleted` (Phase 10 decides, OD-20); the production bundle is ~528 kB (above Vite's 500 kB advisory; code splitting is a later-phase concern).
- **LAN HTTP lacks `crypto.subtle`** (secure-context only), so the backup checksum fails (`checksum_unavailable`) when the app is opened over plain HTTP on a LAN IP. Relevant to the backup UI and phone testing. `crypto.randomUUID` is also absent there; `systemIds` falls back to `getRandomValues`.

Later phases (see `docs/PHASE_PLAN.md`): 06 Daily Lifecycle · 07 Weekly Goal Crusher · 08 Progression/Stats/Achievements · 09 Visual SYSTEM Layer · 10 Animation/Event Engine · 11 Player Awakening · 12 PWA · 13 QA · 14 Polish · 15 optional Android.

## Open decisions relevant later

Active ones only (details in `docs/OPEN_DECISIONS.md`):

- **OD-18** semantic quest identity for e.g. "Gym" — **open, deferred beyond V1** (Phase 08 shipped quest-agnostic achievements only; needed only if a quest-specific achievement is wanted).
- **OD-09** typography — Phase 09.
- **OD-06** sounds; **OD-07** haptics; **OD-08** animation timings/intensity; **OD-20** which moment is the Goal Crusher spectacle — Phase 10.
- **OD-04** final Daily Message catalog — Phase 14.
- **OD-15 (remaining)** seeding any default beyond the six — before any further default is seeded.

Resolved and retired (rules live in `MASTER_SPEC` / `DAILY_LIFECYCLE` / `WEEKLY_GOAL_CRUSHER` / `PROGRESSION_STATS_ACHIEVEMENTS`): OD-01, 02, 03, 05, 10, 11, 12, 13, 14, 16, 17, 19, 21, 22.

## Commands and working conventions

- `npm run lint` · `npm run typecheck` · `npm run test:run` · `npm run build` · `npm run dev`.
- Each phase starts with a **kickoff proposal and waits for an explicit "go"** before any code; it ends with a report and stops for approval. Do not start the next phase on your own.
- Commit with the message the owner specifies; `git push origin main` (no upstream is configured); never force-push.
- Windows shell: no Python. Working-tree docs/sources may be CRLF while the index is LF; this is normal (autocrlf).
- Browser pane checks: interact at ≤455 px viewport height (e.g. 360×440); a taller emulated viewport is scaled and mis-maps clicks. Layout can be audited via DOM measurements at 360×800 and 320×568.

## How future sessions should resume

After /clear, read `CLAUDE.md` and `docs/CURRENT_STATE.md` first.
Do NOT automatically reread every historical specification.
Read detailed docs only when the current phase requires them or an ambiguity/conflict is found.
