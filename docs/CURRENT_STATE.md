# SoloLevelingTaskList — Current State

Short session handoff. Verified at the end of Phase 06 (commit `25f7014`). Authoritative rules stay in `docs/MASTER_SPEC.md`; this file only orients a fresh session.

## Completed phases

- **Phase 00** — product/architecture specification (`docs/MASTER_SPEC.md`, `DATA_MODEL.md`, `PHASE_PLAN.md`, `OPEN_DECISIONS.md`).
- **Phase 01** — React/Vite/TypeScript/Tailwind foundation, lint-enforced layer boundaries.
- **Phase 02** — pure domain/game engine (`docs/DOMAIN_ENGINE.md`).
- **Phase 03** — IndexedDB persistence + JSON backup/restore (`docs/PERSISTENCE.md`).
- **Phase 04** — functional Home/Status UI, default seeds, quest completion (`docs/CORE_UI.md`).
- **Phase 05** — Quest Management: create/edit/archive/restore (`docs/QUEST_MANAGEMENT.md`).
- **Phase 06** — Daily Lifecycle: day finalization, Daily Summaries, reconciliation, streaks, live Daily Report, backward-clock guard (`docs/DAILY_LIFECYCLE.md`).

**Phase 07 (Weekly Goal Crusher) is next and has not started**; it must not start until the owner says so.

## Architecture map

Imports go one way; ESLint enforces it (`eslint.config.js`).

- `src/domain` — pure deterministic game rules. No React, storage, clock or randomness. Public API: `src/domain/index.ts`.
- `src/persistence` — native IndexedDB, repositories, atomic commands, backup. Depends on domain only.
- `src/application` — framework-free use cases over `ApplicationContext { database, clock, ids }`. Depends on domain + persistence only. Public API: `src/application/index.ts`. Quest use cases live in `quests/`; lifecycle (reconcile, synchronization gate) in `lifecycle/`; Daily Report in `report/`.
- `src/platform` — the only readers of the environment: `clock.ts` (Date/Intl), `ids.ts` (Web Crypto). Imports no other layer.
- `src/app` — `AppRuntimeProvider` (owns the one DB handle), `useDaySync` (startup/resume/midnight sync), route table, router.
- `src/features` — React feature UI: `home/`, `status/`, `quests/`, `report/`, plus `displayLabels.ts` (presentation text only).
- `src/components` — reusable layout/UI (`AppShell`, `BottomNav`, `ExpProgressBar`).
- `src/test` — shared test helpers (`renderApp`, `questUi`).
- `_reference/` — local, read-only, git-ignored visual reference pack. Never modify, never import.

UI talks to `@/application`, never to repositories. The provider is the only UI file that imports `@/persistence`.

## Current UI

Bottom nav: **Home · Quests · Status**.

- `/` Home — player/level/rank, Daily Message, today's progress, Daily Streak (+ "STREAK SECURED" at ≥70 %), today's quests, 48 px "+" Add Quest, a one-line "N days reconciled." notice after a multi-day catch-up, and a clock-behind notice instead of the quests when paused.
- `/quests`, `/quests/new`, `/quests/:templateId/edit` — Quests: Active/Archived views, create/edit form, archive confirmation, restore.
- `/status` Status — level, rank, lifetime EXP, level bar, Daily/Best/Perfect-Day streaks, Total Perfect Days.
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
- **Ranks (from level):** E 1–9 · D 10–19 · C 20–34 · B 35–49 · A 50–74 · S 75–99 · `special_100_plus` ≥100 (displays `???`, OD-01).
- **Streaks change only when a day is finalized.** Finalized day ≥70 % → Daily Streak +1; <70 % → 0; No Active Quests → neutral. Perfect Day (100 %) → Perfect streak +1 and Total Perfect Days +1; any other active day resets the Perfect streak; Total never decreases. Finalization awards 0 EXP. No streak freezes in V1.
- **The Daily Summary chain is authoritative** for finalized days and streaks (one immutable summary per date, written atomically by `finalizeDayAtomically`; no streak cache). Missed dates are finalized chronologically, materializing eligible occurrences first. A finalized date refuses new completions/occurrences.
- **Every mutating action synchronizes the day first** (completion, create, edit, archive, restore): refused unless all past days are finalized and the device date is safe. Sync runs on startup, resume and a midnight timer (convenience only).
- **Backward device clock** (date earlier than the last recorded day): safe paused state; nothing finalized, rewritten or materialized; changes refused until the date catches up. Forward clock jumps are not capped or repaired.
- **Sleep is an ordinary quest** (+20 EXP); completing it opens the Daily Report but never finalizes or moves the day.
- **IndexedDB is the durable source of truth**; localStorage only for tiny cosmetic prefs.
- **Only six default seeds:** Fajr, Dhuhr, Asr, Maghrib, Isha (E/Discipline) and Sleep before 00:00 (D/Discipline, role `sleep`). Seeds are manageable but keep id, `seedKey`, `role`; an archived seed is never re-seeded.
- Goal Crushers are not quests and never touch the daily denominator or streak. Achievements award 0 EXP.

## Current database schema

Database `solo-leveling-task-list`, `DATABASE_VERSION` 2, backup `schemaVersion` 2. Five stores:

1. `questTemplates` (mutable, soft-archived)
2. `questOccurrences` (insert-only)
3. `questCompletions` (insert-only)
4. `xpTransactions` (append-only ledger)
5. `dailySummaries` (insert-only, key `dateKey`, index `quality`; added in v2)

New stores arrive only through versioned migrations in their owning phase (bump `DATABASE_VERSION`, add `migrations/vN.ts`, and bump `BACKUP_SCHEMA_VERSION` with an upgrade when the stored model changes).

## Current test baseline

**912 passing tests** in 52 files (Phase 02: 250 · Phase 03: 421 · Phase 04: 521 · Phase 05: 805 · Phase 06: 912). `npm run lint`, `typecheck`, `test:run` and `build` all pass.

## Important current limitations / next work

- No History screen yet (summaries are queryable for Phase 08). A stale "day ended" message can linger on Home until the next action or Refresh.
- Archiving or rescheduling Sleep means some days have no Sleep occurrence; none is invented.
- An active One-Time quest whose date passed stays listed ("Date passed") until archived; nothing auto-archives it.
- No Weekly Goal Crusher (Phase 07), achievements, final visual effects/animation, Player Awakening/name, or PWA/service worker. No manual quest reordering. No Backup/Restore UI.
- **LAN HTTP lacks `crypto.subtle`** (secure-context only), so the backup checksum fails (`checksum_unavailable`) when the app is opened over plain HTTP on a LAN IP. Relevant to the backup UI and phone testing. `crypto.randomUUID` is also absent there; `systemIds` falls back to `getRandomValues`.

Later phases (see `docs/PHASE_PLAN.md`): 06 Daily Lifecycle · 07 Weekly Goal Crusher · 08 Progression/Stats/Achievements · 09 Visual SYSTEM Layer · 10 Animation/Event Engine · 11 Player Awakening · 12 PWA · 13 QA · 14 Polish · 15 optional Android.

## Open decisions relevant later

Active ones only (details in `docs/OPEN_DECISIONS.md`):

- **OD-10** extra Goal Crusher tracking modes; **OD-19** weekly board lifecycle/linked progress — Phase 07.
- **OD-01** Level-100+ rank name; **OD-03** achievement catalog; **OD-18** semantic quest identity for e.g. "Gym" — Phase 08.
- **OD-09** typography — Phase 09.
- **OD-06** sounds; **OD-07** haptics; **OD-08** animation timings/intensity; **OD-20** which moment is the Goal Crusher spectacle — Phase 10.
- **OD-04** final Daily Message catalog — Phase 14.
- **OD-15 (remaining)** seeding any default beyond the six — before any further default is seeded.

Resolved and retired (rules live in `MASTER_SPEC` / `DAILY_LIFECYCLE`): OD-02, 05, 11, 12, 13, 14, 16, 17, 21, 22.

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
