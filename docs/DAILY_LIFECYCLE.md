# SoloLevelingTaskList — Daily Lifecycle (Phase 06)

Implementation record of Phase 06: day finalization, midnight/resume reconciliation, Daily Summaries, streaks, the live Daily Report and the backward-clock safe state. Approved rules stay in `MASTER_SPEC.md` (§4, §7); this file records how they are implemented.

## Source of truth

- The **Daily Summary chain** (`dailySummaries` store) is authoritative for finalized days and for streaks. There is **no streak cache** and no `PlayerProgress` store.
- One summary per `dateKey`, insert-only, written only by `finalizeDayAtomically`. Fields exactly as DATA_MODEL §7. Counts only; a percentage is never stored.
- Current / best / Perfect-Day streak = the newest summary's `currentStreakAfter` / `bestStreakAfter` / `perfectStreakAfter`. Total Perfect Days = count of rows with `quality = 'perfect'` (the `quality` index).
- The **cursor** (first unfinalized date) is derived, never stored: the day after the newest summary; before any summary, the earliest date that has an occurrence; with no history at all, none. The player's start date is likewise derived (earliest occurrence).

## Finalization (`persistence/commands/finalizeDay.ts`)

One read-write transaction over templates (read), occurrences, completions and summaries:

1. A stored summary for the date → `already_finalized` (nothing written: no second summary, no streak change, no XP, snapshots untouched).
2. `dateKey` must be before the caller's `today` (`day_not_over`), and the chain must stay contiguous (`chain_gap`).
3. Existing occurrences of the date are kept as they are. Each **active** template that the domain says was eligible and has none gets one (a day the app never opened). Archived templates generate nothing. Missed quests earn no EXP.
4. The date's completions are joined; the Phase 02 engine counts and classifies (exact ratio); the summary is built with its streak effects applied to the previous summary and added.

Finalization awards **0 EXP** and writes no ledger row; there is no streak or Perfect Day EXP.

Completion and finalization are both transactions, so a completion lands either before finalization (and is counted) or after (and is refused with `day_already_finalized`). `ensureOccurrence` / `insertOccurrence` likewise refuse a finalized date.

## Streaks and Perfect Days (`domain/daily/dailySummary.ts`)

| Quality | Daily streak | Perfect streak | Total Perfect Days |
|---|---|---|---|
| perfect | +1 | +1 | +1 |
| strong / completed | +1 | → 0 | — |
| incomplete | → 0 | → 0 | — |
| no_active_quests | unchanged | unchanged | unchanged |

Best streak = max finalized daily streak. Persisted values change only at finalization. The live day shows `STREAK SECURED` (quality ≥ Completed) and a projected value (`projectedDailyStreak`) as view data only.

## Reconciliation (`application/lifecycle/synchronization.ts`)

`reconcileDays`: from the cursor to **yesterday**, in chronological order, one atomic `finalizeDayAtomically` per date, then today is materialized by the normal loader. An interrupted catch-up resumes from the cursor. Idempotent and race-safe (a second tab or timer finalizes nothing twice).

`finalizedLate` is **false only** when the in-app midnight timer finalizes the immediately previous date; startup, resume and any older date are catch-up (`true`).

## When it runs

- **Startup** (`startApplication`): seeds → reconcile (`startup`) → load.
- **Resume**: `visibilitychange` (visible), `pageshow`, `focus` → `syncDay('resume')`.
- **Midnight timer** (convenience only): armed from `msUntilNextLocalMidnight`; on firing it only calls `syncDay('midnight_tick')` (which re-reads the clock) and re-arms. Never relied on for correctness.
- **Before every change**: the provider calls `syncDay` first, and every mutating use case (completion, create, edit, archive, restore) passes `requireSynchronizedDay`: it refuses (`day_not_synchronized` / `clock_behind`) unless the device date equals the cursor. A stale screen therefore cannot write ahead of reconciliation. A completion refused with `day_ended` re-synchronizes and shows the new day.

`syncDay` (`app/useDaySync.ts`) is single-flight, and a same-day call (date equals the snapshot's, clock ok) does no storage work.

## Sleep quest and Daily Report

Sleep remains an ordinary quest (+20 EXP, counts in the day). Completing a `role: 'sleep'` quest navigates to `/report`; it never finalizes or moves the day. An unfinished Sleep is simply incomplete when the day closes; an archived or rescheduled Sleep has no occurrence and none is invented.

The Daily Report (`/report`, also linked from the Home progress card) is **LIVE / PROVISIONAL**: completed/eligible, floored percent, quality, EXP earned today, persisted streak, "if the day closed now", Perfect Day status. Derived on demand (`buildDailyReport`), never stored. A finalized day's authoritative data is its summary.

## Backward device clock — OD-22 (resolved)

`today < cursor` (device date before the last recorded day) → `ClockStatus.behind`. Then:

- nothing is finalized, deleted, rewritten or regenerated; no streak regresses; nothing is materialized;
- completion, create, edit, archive and restore are refused (`clock_behind`; persistence also refuses completions/occurrences on finalized dates);
- Home shows "Clock appears to have moved backwards" (recorded vs device date) instead of the quests; Status and Quests still load;
- the check is made from stored data on every load, so normal use returns by itself once the device date reaches the cursor again.

A time-zone change is handled identically: only `DateKey`s are compared, finalized summaries are never rewritten (a zone that moves the date later is an ordinary rollover; earlier is the backward state). Consequences accepted by the owner (not mitigated in Phase 06): a mistaken forward clock jump finalizes the skipped days permanently, and travelling west can pause changes for up to about a day.

## Multi-day catch-up events — OD-21 (resolved)

Reconciliation returns the finalized summaries (retained for future history/debug use) and emits **no domain events** and no EXP. No per-day celebration, failure animation or Level-Up queue is replayed. The UI shows at most one dismissible notice, "N days reconciled.", only when N ≥ 2 (a single overnight day is the normal case). Nothing is persisted for the notice. (Phase 06 finalization awards no EXP, so it can cause no level-up; a weekly bonus applied during catch-up in Phase 07 must still be applied atomically and its Level/Rank result not lost or duplicated.)

## Schema migration

- IndexedDB `DATABASE_VERSION` 2 (`migrations/v2.ts`): adds `dailySummaries` (key path `dateKey`, index `quality`). v1 stores and rows are untouched. The store starts empty; the first reconciliation finalizes days that already have occurrences.
- Backup `BACKUP_SCHEMA_VERSION` 2: `dailySummaries` is part of the dataset; a schema-1 backup upgrades by adding `[]`. `validateDataset` / `verifyDatabaseIntegrity` check the chain (contiguity, streak values, per-day occurrences/completions/EXP, no occurrence before the first finalized date).

## Not in Phase 06

Weekly Goal Crusher, achievements, final streak/flame effects, Player Name onboarding, PWA/offline, a History screen (summaries are queryable for Phase 08).
