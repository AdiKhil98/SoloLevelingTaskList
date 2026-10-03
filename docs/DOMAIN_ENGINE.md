# SoloLevelingTaskList — Domain Engine (Phase 02)

Implementation facts about `src/domain/` that later phases need. Product rules live in [MASTER_SPEC.md](MASTER_SPEC.md) and the conceptual model in [DATA_MODEL.md](DATA_MODEL.md); this file does not repeat them.

Everything is imported from `src/domain/index.ts`. The domain has no runtime dependencies, no React, no storage, and never reads the wall clock or the host timezone. Lint enforces the layer boundary.

## Folder organization

```
src/domain/
  index.ts          public API (the only supported import surface)
  types/            Result, DomainError, scalar types (DateKey, EpochMs, IsoWeekday, WeekKey)
  config/           economy values: difficulty EXP, categories, XP curve, rank bands, daily thresholds
  time/             dateKey.ts (date-only math), clock.ts (instant → local date in an explicit zone)
  progression/      levels, ranks, EXP award (level/rank changes), ledger types
  quests/           types, recurrence, template validation, eligibility, occurrence, completion, keys
  daily/            daily completion count, quality, display percentage
  events/           domain event types and the quest-completion event builder
  test-utils/       test-only builders (not exported)
```

Names follow DATA_MODEL: `DateKey`, `Difficulty`, `Category`, `RankId`, `DayQuality`.

## Time

### `DateKey`

A branded string `YYYY-MM-DD` naming a **calendar date** (year 0001–9999, proleptic Gregorian). Only `parseDateKey`, `asDateKey`, `makeDateKey`, `dateKeyFromLocalDate` and date arithmetic produce one.

- `parseDateKey(s)` → `Result` with `malformed | year_out_of_range | impossible_date`. Nothing is normalized: `2026-02-30`, `2026-13-01`, `2027-02-29`, `2026-1-1` are rejected.
- `isDateKey(x)` is a runtime guard for untrusted data.
- `asDateKey` / `makeDateKey` throw `DomainError` instead.
- Arithmetic (`addDays`, `nextDate`, `previousDate`, `daysBetween`, `isoWeekday`) uses an integer day-serial (Hinnant's civil-date algorithm). No `Date` object and no `+ 86_400_000` anywhere, so DST days, leap days and year boundaries cannot matter. Results leaving years 1–9999 throw `date_out_of_range`.
- `isoWeekday`: Monday = 1 … Sunday = 7. `compareDateKeys` orders chronologically.

### Instants and timezones

The **IANA timezone is always an explicit input.** `clockReadingAt(epochMs, timeZone)` returns `Result<ClockReading, ClockError>` where `ClockReading = { epochMs, dateKey, utcOffsetMinutes, timeZone }`. It uses `Intl.DateTimeFormat` with the supplied zone only as the runtime's tz database; it never consults the host zone, so results are identical on every machine. Errors: `invalid_epoch` (not a safe integer ≥ 0, or outside year 1–9999) and `invalid_time_zone` (empty or unknown zone).

`dateKeyFromLocalDate(date)` reads a `Date`'s *local* fields (host zone). No domain rule uses it; it exists for the platform layer, which must pass the zone it chose into the domain explicitly.

Phase 06 owns runtime rollover, resume reconciliation and the clock-moves-backwards case (OD-22).

## Quests

### Recurrence representation

```ts
type QuestRecurrence =
  | { kind: 'daily' }
  | { kind: 'weekdays'; weekdays: readonly IsoWeekday[] }          // non-empty, unique, 1–7
  | { kind: 'interval'; everyNDays: number; anchor: DateKey }      // integer N ≥ 2; anchor is eligible
  | { kind: 'one_time'; date: DateKey }                            // never carries over
```

`validateRecurrence(unknown)` returns the (copied) recurrence or a typed `RecurrenceError` (`interval_too_small` covers 0, negative and 1; `interval_not_integer`; `weekdays_empty`; `weekday_out_of_range`; `weekday_duplicate`; `invalid_anchor`; `invalid_one_time_date`; `unknown_kind`; …). `N = 1` is rejected because it is `daily` (MASTER_SPEC §5.1).

### Eligibility

`checkQuestEligibility(template, date)` → `{ eligible: true } | { eligible: false, reason }` with reason `before_active_from | after_active_until | recurrence_mismatch`; `isQuestEligibleOnDate` is the boolean form. Eligibility depends only on the template and the date (active period + recurrence). It throws `DomainError('invalid_recurrence')` on a malformed recurrence rather than guessing; use `validateQuestTemplate(template)` (typed `TemplateValidationError`) for untrusted data. Template `status` is not an input.

### Deterministic keys

| Thing | Key |
|-------|-----|
| Occurrence id | `occ:{templateId}@{dateKey}` |
| Completion primary key | the `occurrenceId` |
| Quest XP idempotency key | `quest_completion:{occurrenceId}` |
| Quest XP transaction id | `xp:quest_completion:{occurrenceId}` |

No randomness, no clock, no attempt counter: the same occurrence always yields the same keys, so Phase 03 can put unique constraints on them.

### Occurrence snapshot

`createOccurrence(template, dateKey, materializedAt)` → `Result<QuestOccurrence, OccurrenceError>` (`invalid_date | invalid_materialized_at | invalid_template | not_eligible`). It copies title, difficulty, category, `expReward` (from `DIFFICULTY_EXP`), role, recurrence kind and `templateRevision`; later template edits cannot change it.

### Completion

```ts
completeQuest({ occurrence, existingCompletion, ledger: { totalExp, lastSeq }, completedAt, timeZone })
  → { status: 'completed', completion, xpTransaction, progression, events }
  | { status: 'already_completed', completion }
  | { status: 'rejected', reason }
```

- **Final:** there is no undo and no negative EXP.
- **Idempotent:** pass the stored completion for that occurrence (looked up by `occurrenceId`) as `existingCompletion`. A match returns `already_completed` with no records, EXP, progression or events — even if the day has since ended. A completion for a different occurrence is `existing_completion_mismatch`.
- **Day rule (INV-11):** the local date of `completedAt` in `timeZone` must equal the occurrence's `dateKey`; otherwise `occurrence_not_yet_active` or `occurrence_day_ended`.
- **Other rejections:** `invalid_occurrence` (id/date/category/exp_reward), `invalid_ledger_state`, `invalid_clock`, `exp_overflow`.
- **Amount:** the occurrence snapshot's `expReward`. One positive `XPTransaction` with `createdAt = completedAt` (never back-dated), `effectiveDate` = occurrence date, `sourceWeekKey = null`, `category` = quest category, `seq = ledger.lastSeq + 1`, `totalExpAfter`. The completion also records `utcOffsetMinutes` and `timeZone`.
- `seq` and `totalExpAfter` derive from the caller's ledger tip; **Phase 03 must re-verify/re-allocate them inside its IndexedDB transaction** (DATA_MODEL §6).
- `XPSource` already includes the `weekly_goal_crusher` variant as a type; nothing in Phase 02 produces it.

## Progression

- `xpToNext(level) = round(100 + 35 × (level − 1)^1.25)`; `totalExpToReachLevel(level)`; `levelStateOf(totalExp)` → `{ level, expIntoLevel, expToNext, rank }`; `levelOf`. Total EXP is authoritative; level is derived. Reference values (including 485,351 total EXP to reach Level 100) are pinned in tests.
- **No level cap.** Level 100 is an ordinary level; every level from 100 up uses the same formula.
- **Numeric safety:** sums are exact integers. Input outside `Number.MAX_SAFE_INTEGER` (a technical limit, level ≈ 3.6 million) throws `DomainError('numeric_boundary')`; invalid inputs throw `invalid_level | invalid_total_exp | invalid_exp_amount`. Loops are bounded by that limit, so extreme input terminates (worst case ≈ millions of cheap iterations).
- `rankOfLevel(level)`; `rankTransitionsBetween(from, to)` returns **every** rank boundary crossed, ascending, as `{ previousRank, newRank, atLevel }`. `special_100_plus` is an opaque id (displays `???`; OD-01 resolved in Phase 08); 100 → 101 is not a rank-up.
- `applyExpAward(totalExpBefore, amount)` → `ProgressionChange { totalExpBefore, totalExpAfter, before, after, levelsCrossed[], rankTransitions[] }`. One award may cross many levels and ranks; all are reported.

## Daily progress

- `classifyDayQuality(completed, eligible)` → `incomplete | completed | strong | perfect | no_active_quests`, by integer cross-multiplication on the exact ratio (`completed × 100 ≥ 70 × eligible`, `≥ 85 ×`, `completed === eligible`). Zero eligible is `no_active_quests` (never 0 %, never Perfect).
- `displayPercentOf(completed, eligible)` = `⌊completed × 100 / eligible⌋` by integer arithmetic; `null` when nothing is eligible. Display only: 174/250 is `incomplete` and shows 69.
- `computeDailyProgress({ dateKey, occurrences, completedOccurrenceIds })` counts each occurrence as one quest (difficulty and EXP never weight it) and returns `Result<DailyProgress, DailyProgressError>`; `summarizeDay(dateKey, completed, eligible)` builds the same result from counts. Impossible counts throw `invalid_count`.
- Streak effects are **not** computed here. Phase 06 consumes `quality`.

## Events

Subset of MASTER_SPEC §15: `QuestCompleted`, `XPAwarded`, `LevelUp`, `RankUp`. Events describe results; they change nothing.

Order for one completion (deterministic):

1. `QuestCompleted`
2. `XPAwarded` (with `totalExpBefore` / `totalExpAfter`)
3. `LevelUp` — only if a level was gained; **one** event with `levelsCrossed` ascending
4. `RankUp` — one per rank boundary, ascending by `atLevel` (which names the level that caused it)

When later phases add `DayStatusChanged` / `PerfectDayReached`, they slot between 2 and 3 (DATA_MODEL §11). A duplicate attempt emits no events.

## Validation and errors

- **Expected outcomes are returned:** `Result` (`parseDateKey`, `clockReadingAt`, `validateRecurrence`, `validateQuestTemplate`, `createOccurrence`, `computeDailyProgress`) or a tagged status (`completeQuest`). A duplicate tap is not an exception.
- **Contract violations throw `DomainError`** with a `code` (invalid level, total EXP, amount, count, date parts; `numeric_boundary`). The engine never logs.
- Nothing is silently corrected.

## Phase 02 boundaries (not implemented)

No persistence, repositories or migrations; no UI; no rollover, reconcile, timers or lifecycle; no persistent streak or Daily Summary logic; no Weekly Goal Crusher (scoring, board, bonus); no achievements; no Daily Message; no effects, sound, haptics or PWA. Open decisions were untouched in Phase 02: OD-01 (rank display name), OD-05 (EXP overrides), OD-16 (same-day template edits), OD-22 (clock moving backwards). OD-05 and OD-16 were later resolved in Phase 05 (MASTER_SPEC §5.3 and §5.7) without changing the domain engine.
