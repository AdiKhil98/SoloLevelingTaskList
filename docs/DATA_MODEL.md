# SoloLevelingTaskList — Data Model

**Document status:** Phase 00 deliverable. Conceptual contract guiding **Phase 02 (domain)** and **Phase 03 (persistence)**. Reconciled after Phase 03: see *Storage status* below and [PERSISTENCE.md](PERSISTENCE.md) for what is actually implemented.
**Companions:** [MASTER_SPEC.md](MASTER_SPEC.md) · [PHASE_PLAN.md](PHASE_PLAN.md) · [OPEN_DECISIONS.md](OPEN_DECISIONS.md)

> **These TypeScript snippets are specification, not source files.** They illustrate shapes and constraints. No `.ts` file is created in Phase 00. Names may be refined in Phase 02/03, but once a phase ships, public shape renames require an explicit breaking-change report (`CLAUDE.md` architecture-stability rule).

Items tagged **[OPEN: OD-nn]** depend on an undecided product question (`OPEN_DECISIONS.md`); the shape shown is provisional only at that point.

> **Storage status (reconciled after Phase 03).** The entity and store lists in this document describe the *expected eventual* application data model. **IndexedDB schema v1 intentionally implements only the four entities that were mature enough at Phase 03:** `questTemplates`, `questOccurrences`, `questCompletions` and `xpTransactions`. `PlayerProfile`, `DailySummary`, `WeeklyGoalBoard` / `WeeklyRewardClaim`, `AchievementUnlock`, `DailyMessageAssignment`, `AppSettings` and any other later-feature store are introduced through explicit, versioned database migrations when their owning phases define them. Their absence from schema v1 is intentional and is not missing Phase 03 work. The future entities below are kept as the conceptual direction only; this document does not fix their stored schema until their phases do. What is implemented (stores, indexes, transactions, backup, errors) is recorded in [PERSISTENCE.md](PERSISTENCE.md).

---

## 1. Conventions

### 1.1 Scalar types

```ts
type EpochMs = number;                 // UTC ms, audit only
type DateKey = string;                 // 'YYYY-MM-DD' device-local calendar date (branded in code)
type WeekKey = string;                 // DateKey of that week's MONDAY, e.g. '2026-09-28'
type IsoWeekday = 1|2|3|4|5|6|7;       // 1 = Monday … 7 = Sunday

type Difficulty = 'E'|'D'|'C'|'B'|'A'|'S';
type Category   = 'discipline'|'fitness'|'business'|'knowledge'|'trading';
type RankId     = 'E'|'D'|'C'|'B'|'A'|'S'|'special_100_plus';   // Level 100+ tier; display name is OPEN (OD-01)
type DayQuality = 'incomplete'|'completed'|'strong'|'perfect'
                | 'no_active_quests';          // zero eligible quests: neutral for streaks (MASTER_SPEC §7.5)
type StreakEffect = 'increment'|'reset'|'neutral';
```

Rules:

- **Date keys are authoritative.** Any record attributed to a day stores its `DateKey` explicitly. It is never recomputed from a timestamp later, so historical attribution survives timezone changes and DST.
- **Timestamps** are stored in UTC ms. Where local attribution matters (completions), also store `utcOffsetMinutes` and the IANA `timeZone` string *at the time*, for audit.
- **Date arithmetic** (add days, day-of-week, days-between) uses calendar-field/day-serial math, never `+ 86 400 000 ms` (DST-safe; leap-day-safe).
- **Week math:** Monday = `isoWeekday 1`. `weekKeyOf(d)` = `d − (isoWeekday(d) − 1)` days; week end = `weekKey + 6` days.

### 1.2 Identifiers

- Stable string IDs, never reused. User-created entities (templates, weekly goals) use random UUIDs with a type prefix (e.g., `tpl_…`, `wg_…`).
- **Where idempotency matters, IDs/keys are deterministic natural keys** rather than random:

| Entity | Key |
|--------|-----|
| QuestOccurrence | `occ:{templateId}@{dateKey}` |
| QuestCompletion | primary key = its `occurrenceId` |
| XPTransaction (quest) | idempotency key `quest_completion:{occurrenceId}` |
| XPTransaction (weekly) | idempotency key `weekly_goal_crusher:{weekKey}` |
| DailySummary | `dateKey` |
| WeeklyGoalBoard | `weekKey` |
| WeeklyRewardClaim | `weekKey` |
| AchievementUnlock | `achievementId` |
| DailyMessageAssignment | `dateKey` |

A retried or racing write therefore collides on the key instead of creating a second record.

### 1.3 Configuration constants (centralized in code, not stored per record)

`DIFFICULTY_EXP`, `XP_TO_NEXT(level)`, `RANK_BANDS`, `DAILY_QUALITY_THRESHOLDS` (70/85/100), `WEEKLY_GOAL_TOTAL_POINTS = 10`, `WEEKLY_BONUS_EXP` table. Values are in MASTER_SPEC §5.3, §7.2, §8, §9, §12.5. Records **snapshot** the values that mattered at the time (e.g., an occurrence snapshots `expReward`), so future constant changes never rewrite history.

---

## 2. Source of truth vs. derived state

| Datum | Source of truth | Derived / cache | Notes |
|-------|-----------------|-----------------|-------|
| Total EXP | **XPTransaction ledger** | reconstructed from the ledger on read; **no stored cache in schema v1** | the ledger is authoritative; any cache introduced later never is |
| Player Level / expIntoLevel / expToNext | derived from total EXP via `XP_TO_NEXT` | never stored as mutable state | prevents level duplication |
| Rank | derived from Level via `RANK_BANDS` | never stored | |
| Category EXP totals | ledger rows with `category != null` | derived from the ledger; no stored cache in schema v1 | weekly bonus has `category: null` |
| Quest "is completed" | existence of a `QuestCompletion` for the occurrence | — | no separate boolean to drift |
| Today's completion %, live quality | occurrences + completions for `today` | derived view `DailyProgress` | recomputed, not stored |
| Final day result | **DailySummary** (immutable once written) | — | |
| Current/best streak, perfect-day totals | **DailySummary chain** | any further persisted copy is a verifiable cache of the chain; Phase 06 decision: no separate cache; the chain tip's `*After` values plus a `quality` index count are read directly | each summary stores streak-after values (§7) |
| Weekly score (live) | goals' completion state | derived | persisted only in the finalization snapshot |
| Weekly bonus | **XPTransaction** `weekly_goal_crusher:{weekKey}` | board finalization snapshot references it | |
| Achievements earned | **AchievementUnlock** rows | — | definitions are static code |
| Daily message of a day | **DailyMessageAssignment** | — | bank is static code |
| Level-up / rank-up history | derivable by replaying the ledger | not stored | events exist only at action time (see OD-21) |

**Principle:** every derived value can be recomputed from source-of-truth records. IndexedDB schema v1 stores **no derived progression cache**: total EXP, level and rank are reconstructed from the ledger, an integrity routine verifies the ledger chain and the cross-record rules, and a backup carries no derived values. A derived cache may be introduced later only if a performance need justifies it; it must then be rebuildable from, and verifiable against, source-of-truth records, and it must never become the authoritative source for XP, level or rank.

---

## 3. Player entities

```ts
interface PlayerProfile {            // singleton, id = 'player'; FUTURE store, not in schema v1
  id: 'player';
  createdAt: EpochMs;
  startedOn: DateKey;                // first local date the player existed; no occurrences exist before it
  awakenedAt: EpochMs | null;        // set when Player Awakening is accepted (Phase 11)
}

interface PlayerProgress {           // CONCEPTUAL derived cache; NOT in schema v1; never authoritative
  id: 'progress';
  totalExp: number;                  // Σ ledger amounts
  categoryExp: Record<Category, number>;
  ledgerSeq: number;                 // highest XPTransaction.seq applied
  currentStreak: number;             // persisted; changes ONLY when a day is finalized (§7)
  bestStreak: number;                // max of finalized streak values
  totalPerfectDays: number;          // finalized Perfect Days
  currentPerfectStreak: number;      // persisted; changes ONLY at finalization
  totalQuestCompletions: number;
  finalizedThrough: DateKey | null;  // reconcile cursor = max DailySummary.dateKey
  lastFinalizedWeek: WeekKey | null;
  updatedAt: EpochMs;
}
```

**Status of these two shapes.** Neither store exists in IndexedDB schema v1. `PlayerProfile` is introduced by a future migration in the phase that first needs it. **`PlayerProgress` is not required and does not exist in schema v1:** the XP ledger is authoritative, total EXP is reconstructed from it, level is derived from total EXP, and rank is derived from level. A derived cache of this kind may be introduced later only if a performance need justifies it; it must then be rebuildable from and verifiable against source-of-truth records, and must never become the authoritative source for XP, level or rank. The fields shown are illustrative: the ledger-derived ones (`totalExp`, `categoryExp`, `ledgerSeq`, `totalQuestCompletions`) are not stored as state in schema v1, and how persisted streak state is held is decided by Phase 06.

*Not stored:* `level`, `rank`. A `LevelState { level, expIntoLevel, expToNext, rank }` view is computed by a pure function from `totalExp`. `level` is an unbounded integer ≥ 1 (MASTER_SPEC §8.4: no maximum, no prestige, no reset); levels at or above 100 all map to rank `special_100_plus`.

---

## 4. Quest templates and recurrence

```ts
type QuestRecurrence =
  | { kind: 'daily' }
  | { kind: 'weekdays'; weekdays: IsoWeekday[] }                 // non-empty, unique
  | { kind: 'interval'; everyNDays: number; anchor: DateKey }    // N ≥ 2, anchor-based
  | { kind: 'one_time'; date: DateKey };

interface QuestTemplate {
  id: string;                        // tpl_<uuid>
  title: string;
  description?: string;
  difficulty: Difficulty;            // EXP is derived from this via DIFFICULTY_EXP
  category: Category;                // exactly one primary category
  recurrence: QuestRecurrence;
  role: 'standard' | 'sleep';        // 'sleep' marks the Sleep-before-00:00 quest (UI may give it a special action)
  seedKey: string | null;            // e.g. 'prayer.fajr', 'sleep' — prevents duplicate seeding
  activeFrom: DateKey;               // first date it may be eligible
  activeUntil: DateKey | null;       // last date (inclusive); null while active. Archiving writes it as compatibility bookkeeping only (template validation forbids activeUntil < activeFrom); `status` is authoritative
  status: 'active' | 'archived';     // 'archived' = deleted (soft) — the authoritative archive state; never hard-deleted
  revision: number;                  // incremented on each edit
  createdAt: EpochMs;
  updatedAt: EpochMs;
}
```

**Quest kind mapping (for display/analytics):** `daily` → *Daily Quest*; `weekdays`/`interval` → *Scheduled Quest*; `one_time` → *One-Time Quest*.

**Eligibility function (pure):** `isEligible(template, dateKey)` is true iff `activeFrom ≤ dateKey ≤ (activeUntil ?? ∞)` **and** the recurrence matches:

- `daily` → always
- `weekdays` → `isoWeekday(dateKey) ∈ weekdays`
- `interval` → `dateKey ≥ anchor && daysBetween(anchor, dateKey) % everyNDays === 0`
- `one_time` → `dateKey === date`

**Validation:** `title` non-empty; `weekdays` non-empty/unique/1–7; `everyNDays ≥ 2` and integer; `activeUntil ≥ activeFrom` when set; `one_time.date` within `activeFrom…activeUntil`. EXP is **not** a stored field of the template.

**Seeding:** the six seeded templates (five prayers + Sleep) are created once, keyed by `seedKey` (idempotent). Their `activeFrom` is the player's `startedOn`. Additional seeded quests: **[OPEN: OD-15]**.

---

## 5. Occurrences and completions

An **occurrence** is "this quest on this date": the unit that is completed, counted in denominators, and snapshotted.

```ts
interface QuestOccurrence {
  id: string;                        // 'occ:{templateId}@{dateKey}'  (deterministic)
  templateId: string;
  dateKey: DateKey;
  templateRevision: number;
  snapshot: {                        // frozen at materialization; never rewritten
    title: string;
    difficulty: Difficulty;
    category: Category;
    expReward: number;               // DIFFICULTY_EXP[difficulty] at materialization time
    role: 'standard' | 'sleep';
    recurrenceKind: QuestRecurrence['kind'];
  };
  materializedAt: EpochMs;
}

interface QuestCompletion {          // primary key = occurrenceId  ⇒ ≤ 1 completion per occurrence
  occurrenceId: string;
  templateId: string;                // denormalized for queries
  dateKey: DateKey;                  // MUST equal the occurrence's dateKey
  category: Category;                // snapshot
  expAwarded: number;                // snapshot
  completedAt: EpochMs;
  utcOffsetMinutes: number;
  timeZone: string;                  // IANA, audit only
  xpTransactionId: string;
}
```

Constraints:

- **One completion per occurrence** (primary key).
- **One occurrence per `(templateId, dateKey)`** (deterministic id + unique index).
- **A completion's local date must equal its occurrence's `dateKey`** — enforced in the domain command: this single rule prevents completing future days *and* locks past days.
- Occurrences are materialized **only for dates ≤ today** (MASTER_SPEC I-4). "Upcoming" views are projections computed from templates.
- **Completion is final in V1 (MASTER_SPEC §5.6).** Once a completion exists and its XP transaction was awarded, ordinary UI/application code has no way to undo it: `questCompletions` and `xpTransactions` have no update/delete repository methods, and no domain command "uncompletes" an occurrence. The completion row and its XP transaction are written in one transaction, so a completion can never exist without its EXP (or vice versa). A future correction/admin mechanism is outside V1.

---

## 6. XP ledger

```ts
type XPSource =
  | { type: 'quest_completion'; occurrenceId: string; templateId: string }
  | { type: 'weekly_goal_crusher'; weekKey: WeekKey; score: number };   // score 6–10

interface XPTransaction {
  id: string;
  seq: number;                       // strictly increasing ledger order (allocated inside the IDB transaction)
  idempotencyKey: string;            // UNIQUE: 'quest_completion:{occurrenceId}' | 'weekly_goal_crusher:{weekKey}'
  source: XPSource;
  amount: number;                    // positive integer, ALWAYS > 0 in V1
  category: Category | null;         // null for weekly_goal_crusher
  createdAt: EpochMs;                // ACTUAL time the transaction was written — audit timestamp, never back-dated
  effectiveDate: DateKey;            // calendar date/period it belongs to for reporting (see below)
  sourceWeekKey: WeekKey | null;     // weekly_goal_crusher: the Monday key of the finalized board; otherwise null
  totalExpAfter: number;             // running total — enables ledger-chain verification
}
```

**Three distinct facts, never conflated** (MASTER_SPEC §12.5):

| Field | Meaning | Quest completion | Weekly Goal Crusher bonus |
|-------|---------|------------------|---------------------------|
| `createdAt` | when the transaction was physically created | completion time | the actual time reconcile wrote it (possibly days after the week ended) |
| `effectiveDate` | reporting date/period it belongs to | the occurrence's `dateKey` | the board's **Sunday** (`endDate`) |
| `sourceWeekKey` | which finalized board produced it | `null` | the board's Monday `weekKey` |

*Example:* a week ends Sunday `2026-10-04`; the app is next opened Wednesday `2026-10-07`. The bonus row has `createdAt` = the real Wednesday timestamp, `effectiveDate` = `2026-10-04`, `sourceWeekKey` = `2026-09-28`. It counts toward the completed week's reporting without falsifying the audit timestamp. Reporting queries ("EXP for week W", "EXP on date D") use `effectiveDate`/`sourceWeekKey`; audit views use `createdAt` and `seq`.

*Invariant:* for `quest_completion`, `effectiveDate` equals the completion's `dateKey`; for `weekly_goal_crusher`, `effectiveDate = weekKey + 6 days` and `sourceWeekKey = source.weekKey`. `createdAt` is never derived from `effectiveDate`.

- **Append-only.** No update or delete path exists in repositories for this store.
- **Chain invariant:** for consecutive `seq`, `totalExpAfter(n) = totalExpAfter(n−1) + amount(n)`; the last `totalExpAfter` is the player's total EXP (and would equal any derived cache, should one ever exist).
- **Source types in V1:** `quest_completion`, `weekly_goal_crusher`. `achievement` is deliberately **not** a source (0 EXP). Any future source (e.g., a manual adjustment) requires an explicit product decision and a documented schema migration.
- Level changes are computed by comparing `levelOf(totalExpBefore)` and `levelOf(totalExpAfter)`; a multi-level gain falls out naturally.

---

## 7. Daily summaries and streaks

A `DailySummary` is written **once, at finalization**, and is immutable. Live (not-yet-final) day status is a derived view, not a stored row.

```ts
interface DailySummary {              // primary key = dateKey  ⇒ one per calendar date
  dateKey: DateKey;
  eligibleCount: number;             // denominator at finalization
  completedCount: number;
  occurrenceIds: string[];           // which occurrences were eligible → day is reconstructable
  quality: DayQuality;               // 'no_active_quests' iff eligibleCount === 0
  isPerfect: boolean;                // true only for 'perfect' (never for 'no_active_quests')
  dailyStreakEffect: StreakEffect;   // 'increment' (≥70 %) | 'reset' (<70 %) | 'neutral' (no_active_quests)
  perfectStreakEffect: StreakEffect; // 'increment' (100 %) | 'reset' (<100 %) | 'neutral' (no_active_quests)
  questExp: number;                  // Σ quest-completion EXP earned on this date (weekly bonus is NOT included)
  currentStreakAfter: number;        // persisted Daily Streak after applying this day's effect
  bestStreakAfter: number;           // max(previous best, currentStreakAfter) — only finalized values count
  perfectStreakAfter: number;        // persisted Perfect Day Streak after this day's effect
  finalizedAt: EpochMs;
  finalizedLate: boolean;            // true when finalized by catch-up after the date had passed
}
```

- Completion percent is **not stored as a float**; derive from counts. Quality uses exact integer comparison (`completed × 100 ≥ 70 × eligible`, `completed × 100 ≥ 85 × eligible`, `completed === eligible`) — never a rounded percentage (MASTER_SPEC §7.2). The whole-number UI percentage is `floor(completed × 100 / eligible)` via integer floor division and is a *display-only* derivation that never feeds back into classification.
- **Streaks change only at finalization** (MASTER_SPEC §7.4). Persisted streak values (the §3 `PlayerProgress` streak fields, if Phase 06 caches them, and the `*After` fields) are updated *only* when a DailySummary is written; a live in-progress day never mutates them. Live "STREAK SECURED" and the projected next value are derived view data (`persisted + 1`), not stored.
- Streak transition for a finalized day (applied in order of dates):

  | Quality | `dailyStreakEffect` | `perfectStreakEffect` | `currentStreak` | `perfectStreak` | `totalPerfectDays` |
  |---------|--------------------|----------------------|-----------------|-----------------|-------------------|
  | `perfect` | increment | increment | +1 | +1 | +1 |
  | `strong` / `completed` | increment | reset | +1 | → 0 | — |
  | `incomplete` | reset | reset | → 0 | → 0 | — |
  | `no_active_quests` | neutral | neutral | unchanged | unchanged | unchanged |

  `bestStreak = max(bestStreak, currentStreak)` after each transition. (A `no_active_quests` day is neutral for both streak systems — MASTER_SPEC §7.5 / I-14.)
- Streaks are a pure fold over the ordered DailySummary chain; any persisted copy of the result (such as the §3 `PlayerProgress` fields, should Phase 06 cache them) is a cache and must be verifiable against the chain.
- A Daily Summary is written for `no_active_quests` days too (`eligibleCount 0`, empty `occurrenceIds`), so every finalized date is reconstructable and the contiguous-finalization invariant (INV-13) holds. No division by zero occurs anywhere because the ratio is never evaluated when `eligibleCount === 0`.
- `finalizedLate` distinguishes "closed at midnight with the app open" from "closed on next launch".
- Days before `PlayerProfile.startedOn` have no summary.

---

## 8. Settings and reward-tier configuration

```ts
interface WeeklyRewardTier {           // user-configurable text; the *threshold* is fixed
  minScore: 6 | 7 | 8 | 9 | 10;
  rewardText: string;                  // e.g. '45 minutes guilt-free gaming' — examples are NOT hardcoded
}

interface AppSettings {                // singleton, id = 'settings'; included in backups (MASTER_SPEC I-7)
  id: 'settings';
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  effectsIntensity: 'low' | 'medium' | 'high';      // provisional levels [see OD-08]
  reducedMotion: 'system' | 'on' | 'off';           // 'system' follows prefers-reduced-motion
  weeklyRewardTiers: WeeklyRewardTier[];            // up to 5, ascending minScore, unique
  updatedAt: EpochMs;
}
```

Purely cosmetic memory (last-open tab, collapsed panels) may live in `localStorage` and is **not** part of `AppSettings`/backup.

---

## 9. History strategy: editing, deleting, snapshots

### 9.1 Layers of truth over time

```
QuestTemplate  (mutable, versioned by `revision`)  ← what a quest IS now
      │ materialize (≤ today)
      ▼
QuestOccurrence (immutable snapshot)               ← what it WAS on that date
      │ complete
      ▼
QuestCompletion → XPTransaction (append-only)      ← what happened, and what it was worth
      │ finalize at midnight
      ▼
DailySummary (immutable)                           ← the day's final result
```

Everything to the right of the template is a historical record that no template edit can change.

### 9.2 Approved behavior (MASTER_SPEC §5.7)

| Action on a template | Effect |
|----------------------|--------|
| **Edit** (title, difficulty, category, recurrence) | Increments `revision`. Applies to occurrences **created afterwards**. An occurrence that already exists (today's included) is frozen and never changes or disappears; if none exists for today yet, the edited template's normal eligibility decides whether one is created. Completions, summaries, and ledger rows are untouched. |
| **Delete / archive** | Sets `status = 'archived'` (authoritative) and an `activeUntil` that satisfies template validation (the latest of the archive date, `activeFrom` and a one-time date); that value is bookkeeping only. Stops future occurrences; an occurrence that already exists for today stays visible, completable and in today's denominator. Never hard-deletes. |
| **Restore** | Sets `status = 'active'` and clears `activeUntil`. Future eligibility resumes; an existing occurrence is reused; nothing is generated retroactively. |
| **Create** | Eligible from `activeFrom`. If eligible today, today's occurrence is created immediately; otherwise it appears when it becomes eligible. Never retroactive. |
| **Edit weekly recurrence/anchor** | Only changes which *future* dates are eligible; past eligibility is frozen in occurrences. |

### 9.3 Materialization rule

Occurrences for a date are created (idempotently, by deterministic id) when that date is first processed: when today's quests are loaded (launch, and after every quest-management save), or by reconcile while catching up missed dates. **An existing occurrence is authoritative:** loading a date keeps every occurrence already stored for it, whatever became of its template, and only creates occurrences for active, eligible templates that have none. Materializing a missed date from the *current* template state is sound because templates only change while the app is open, and the open day's occurrences already reflect those changes.

---

## 10. Weekly Goal Crusher

```ts
type WeeklyGoalTracking =
  | { mode: 'manual' }
  | { mode: 'linked_quests'; templateIds: string[] };   // DESIGN SKETCH. Implemented as { mode: 'linked_quest'; templateId } (one quest) — see the note below §10.
                                                        // OD-10 resolved: manual + linked only. OD-19 resolved: completions count from the week's Monday.

interface WeeklyGoal {
  id: string;                         // wg_<uuid>
  title: string;
  description?: string;               // measurable target text
  maxPoints: number;                  // integer ≥ 1; Σ over the board === 10
  target: number;                     // integer ≥ 1 (binary goals use 1)
  unit?: string;
  tracking: WeeklyGoalTracking;
  manualProgress: number;             // used when mode = 'manual'; ignored for linked
  notes?: string;
  completedAt: EpochMs | null;        // when first satisfied (event/audit); completion itself is derived while active
}

interface WeeklyGoalBoard {           // primary key = weekKey  ⇒ ≤ 1 board per week
  weekKey: WeekKey;
  startDate: DateKey;                 // Monday
  endDate: DateKey;                   // Sunday
  focus: string | null;               // Weekly Focus statement
  goals: WeeklyGoal[];                // embedded: the board is the aggregate
  status: 'active' | 'finalized';
  createdAt: EpochMs;
  updatedAt: EpochMs;
  revision: number;
  finalization: null | {              // written once; board is immutable afterwards
    finalizedAt: EpochMs;
    score: number;                    // Σ maxPoints of completed goals, 0–10
    goalResults: { goalId: string; title: string; maxPoints: number;
                   target: number; finalProgress: number; earnedPoints: number }[];
    bonusExp: number;                 // from WEEKLY_BONUS_EXP[score]
    xpTransactionId: string | null;   // null when bonusExp = 0
    rewardTier: { minScore: 6|7|8|9|10; rewardText: string } | null;  // SNAPSHOT of highest achieved tier
  };
}

interface WeeklyRewardClaim {         // primary key = weekKey; separate so the finalized board stays immutable
  weekKey: WeekKey;
  tierMinScore: 6 | 7 | 8 | 9 | 10;
  rewardTextSnapshot: string;
  claimedAt: EpochMs;                 // claiming has NO EXP effect
}
```

Rules:

- **Board validity (activation/save):** `Σ goals.maxPoints === 10`; each `maxPoints` integer ≥ 1; each `target` integer ≥ 1.
- **Score** = Σ `maxPoints` of goals whose target is met (all-or-nothing, no fractions).
- **Bonus** = `WEEKLY_BONUS_EXP[score]` — a lookup (0 for ≤ 5); never cumulative.
- **Reward tier** = highest tier `minScore ≤ score`; `null` when score < 6. Tier *text* is snapshotted into `finalization.rewardTier` so editing settings later does not change history.
- **Finalization** happens during reconcile, *after* the week's Sunday is finalized: compute results → freeze board → append the single `weekly_goal_crusher:{weekKey}` XPTransaction (if bonus > 0) → all in one IDB transaction. The unique idempotency key makes a second attempt a no-op.
- **Linked progress** counts `QuestCompletion` rows (by `templateId`, `dateKey ∈ [startDate, endDate]`) — never awards quest EXP again. A goal created mid-week counts completions from the Monday (OD-19 resolved).
- A week with no board has nothing to finalize and leaves no record (OD-19 resolved).
- Claiming requires `status === 'finalized'` and a non-null `rewardTier`; one claim per week.
- **Perfect Week** is derived, not stored: a board with `status === 'finalized'` and `finalization.score === 10`. "N Perfect Weeks" = count of such boards.

> **Implemented in Phase 07 (schema v3)** — see [WEEKLY_GOAL_CRUSHER.md](WEEKLY_GOAL_CRUSHER.md). Differences from the sketch above: (1) linked tracking is `{ mode: 'linked_quest'; templateId }`, one quest; (2) the five reward texts are stored on the board as `rewardTiers` (no settings store exists) and snapshotted in `finalization.rewardTier`; (3) `WeeklyGoal.completedAt` and `description` are omitted (completion is derived while active and frozen in `goalResults`); (4) `goalResults` also freezes `unit`, `trackingMode`, `templateId` and `completed`; (5) week finalization is its own transaction after the Sunday's daily finalization (an interrupted catch-up finds the due board again). A claim requires non-blank tier text.

---

## 11. Domain events

Returned by domain functions alongside `writes`. The UI/animation layer consumes them; it never decides them. Undelivered events are not persisted: a multi-day catch-up replays none (OD-21 resolved in Phase 06, see DAILY_LIFECYCLE.md).

```ts
type DomainEvent =
  | { type: 'QuestCompleted';       occurrenceId: string; templateId: string; dateKey: DateKey; difficulty: Difficulty; category: Category }
  | { type: 'XPAwarded';            transactionId: string; amount: number; sourceType: XPSource['type']; category: Category | null;
                                    totalExpBefore: number; totalExpAfter: number }
  | { type: 'LevelUp';              previousLevel: number; newLevel: number; levelsCrossed: number[];
                                    expIntoLevel: number; expToNext: number }
  | { type: 'RankUp';               previousRank: RankId; newRank: RankId; atLevel: number }
  | { type: 'AchievementUnlocked';  achievementId: string }
  | { type: 'DayStatusChanged';     dateKey: DateKey; from: DayQuality | null; to: DayQuality | null; completedCount: number; eligibleCount: number }
  | { type: 'PerfectDayReached';    dateKey: DateKey }
  | { type: 'WeeklyGoalCompleted';  weekKey: WeekKey; goalId: string; earnedPoints: number; scoreNow: number }
  | { type: 'WeeklyBoardFinalized'; weekKey: WeekKey; score: number; bonusExp: number; rewardTierMinScore: number | null };
```

**Ordering for one completion** (so a presenter can queue deterministically):
`QuestCompleted → XPAwarded → DayStatusChanged → PerfectDayReached → LevelUp → RankUp → AchievementUnlocked`, with `WeeklyGoalCompleted` after `QuestCompleted` when a linked goal is satisfied.
One command may emit several (e.g., +EXP crossing two levels and a rank boundary and unlocking an achievement). `LevelUp` is **one event with `levelsCrossed`**, not N events.

---

## 12. Achievements

```ts
interface AchievementDefinition {     // STATIC data shipped in code; data-driven, extensible; not stored in IndexedDB
  id: string;                         // stable, e.g. 'first_perfect_day'
  title: string;
  description: string;
  condition: AchievementCondition;    // declarative discriminated union evaluated by a generic engine
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';   // presentation tier, optional
  readonly expReward: 0;              // type-level guarantee: achievements award 0 EXP
}

type AchievementCondition =           // illustrative vocabulary only; final set is OPEN (OD-03/17/18)
  | { type: 'total_quest_completions'; count: number }
  | { type: 'daily_streak'; days: number }
  | { type: 'perfect_days_total'; count: number }
  | { type: 'rank_reached'; rank: RankId }
  | { type: 'quest_completions_for'; selector: unknown; count: number }   // quest identity: OD-18
  | { type: 'perfect_weeks'; count: number };                              // Perfect Week = finalized board scored exactly 10/10 (MASTER_SPEC §11)

interface AchievementUnlock {         // primary key = achievementId  ⇒ ≤ 1 per achievement
  achievementId: string;
  unlockedAt: EpochMs;
  unlockedOn: DateKey;
  triggerEvent: string;               // e.g. 'QuestCompleted', 'RankUp' — audit
}
```

Achievement evaluation is idempotent: re-evaluating an unlocked achievement is a no-op. Unlocks are written in the same transaction as the progression change that triggered them.

---

## 13. Daily Message

```ts
interface DailyMessage {              // STATIC local bank shipped in code
  id: string;                         // stable
  text: string;
  kind: 'original' | 'system_directive' | 'quotation';
  attribution: string | null;         // required for 'quotation' (properly attributed / public domain only)
  bankVersion: number;
}

interface DailyMessageAssignment {    // primary key = dateKey  ⇒ ≤ 1 per local date
  dateKey: DateKey;
  messageId: string;
  textSnapshot: string;               // survives later bank edits/removals
  bankVersion: number;
  assignedAt: EpochMs;
}
```

- On first need for a date, the app selects a message deterministically from `dateKey` (selection algorithm: **[OPEN: OD-04]**), persists the assignment, and thereafter **always reads the persisted assignment**. Reloading cannot change it.
- No gameplay effect; excluded from EXP/streak/daily-denominator logic.

---

## 14. Persistence layout (eventual layout; schema v1 implements part of it)

> **Implemented in IndexedDB schema v1:** only the four stores marked ✔. The other rows are the eventual layout and are added by versioned migrations in their owning phases; that is intentional, not missing Phase 03 work. The index lists below are guidance. The indexes actually created are listed in [PERSISTENCE.md](PERSISTENCE.md); schema v1 deliberately omits a few speculative ones (`recurrence.kind` on templates, `category` on completions, `createdAt` on the ledger).

| IDB object store | Key | Notable indexes | Mutability | Schema |
|------------------|-----|-----------------|-----------|--------|
| `meta` | `key` | — | schema version, ledger sequence counter, install id | not created in v1: the ledger tip is read from the unique `seq` index and the database version is IndexedDB's own |
| `player` | `id` (`player`,`progress`,`settings`) | — | profile/settings mutable; `progress`, if ever introduced, is a verifiable, non-authoritative cache | future migration |
| `questTemplates` | `id` | `status`, `seedKey` (unique, sparse), `recurrence.kind` | mutable (versioned) | ✔ v1 |
| `questOccurrences` | `id` | `dateKey`; `templateId`; **unique** `[templateId, dateKey]` | insert-only | ✔ v1 |
| `questCompletions` | `occurrenceId` | `dateKey`; `templateId`; `category`; `completedAt` | insert-only | ✔ v1 |
| `xpTransactions` | `id` | **unique** `idempotencyKey`; **unique** `seq`; `effectiveDate`; `sourceWeekKey`; `createdAt`; `category`; `source.type` | insert-only | ✔ v1 |
| `dailySummaries` | `dateKey` | `quality` (counts Perfect Days; an `isPerfect` index is impossible because booleans are not valid IndexedDB keys) | insert-only | ✔ v2 |
| `weeklyBoards` | `weekKey` | `status` | mutable until finalized, then immutable | ✔ v3 |
| `weeklyRewardClaims` | `weekKey` | — | insert-only | ✔ v3 |
| `achievementUnlocks` | `achievementId` | `unlockedOn` | insert-only | future migration |
| `dailyMessageAssignments` | `dateKey` | — | insert-only | future migration |

- **Transaction boundaries:** one `readwrite` transaction spanning all stores touched by a command (e.g., in schema v1 a completion = `questOccurrences`(read) + `questCompletions` + `xpTransactions`; later phases add the stores they own to the same transaction, such as `achievementUnlocks`). Uniqueness is re-checked **inside** the transaction.
- **Concurrency:** two tabs, double-taps, and retries are serialized by IndexedDB transactions + unique keys; losing writers resolve to idempotent no-ops.
- **Reconcile unit:** each finalized date (and its week finalization when applicable) commits atomically so an interrupted catch-up resumes from `finalizedThrough`.
- **Insert-only stores expose no update/delete repository methods.**

---

## 15. Backup envelope and migrations

```ts
interface BackupEnvelope {
  format: 'solo-leveling-task-list-backup';
  formatVersion: number;               // envelope structure version
  schemaVersion: number;               // data-model version of the payload
  appVersion: string;
  exportedAt: EpochMs;
  exportedFromTimeZone: string;
  checksum: { algorithm: 'SHA-256'; value: string };   // over the canonical envelope EXCLUDING this field; Web Crypto, no dependency
  data: {
    player: PlayerProfile;
    settings: AppSettings;
    questTemplates: QuestTemplate[];
    questOccurrences: QuestOccurrence[];
    questCompletions: QuestCompletion[];
    xpTransactions: XPTransaction[];
    dailySummaries: DailySummary[];
    weeklyBoards: WeeklyGoalBoard[];
    weeklyRewardClaims: WeeklyRewardClaim[];
    achievementUnlocks: AchievementUnlock[];
    dailyMessageAssignments: DailyMessageAssignment[];
    // Derived values (total EXP, level, rank, and any future derived cache such as PlayerProgress)
    // are intentionally ABSENT: they are rebuilt from the ledger on import.
  };
}
```

**Schema v1 payload.** The `data` shown is the eventual envelope. Backup `schemaVersion` 1 (implemented in Phase 03) carries only `questTemplates`, `questOccurrences`, `questCompletions` and `xpTransactions`, matching the four stores of IndexedDB schema v1. Collections for later stores are added when their stores are, by raising `schemaVersion` and registering an upgrade so older backups still import.

**Checksum.** The SHA-256 digest covers the canonical serialized backup envelope (object keys in sorted order, no insignificant whitespace) **excluding the `checksum` field itself**, so it covers the rest of the envelope: the metadata (`format`, versions, `appVersion`, `exportedAt`, `exportedFromTimeZone`) as well as `data`. It exists to detect accidental corruption or truncation. It is **not** authentication, encryption or a signature, and it gives no protection against malicious modification: anyone able to edit a backup can recompute it.

**Export:** consistent snapshot read in one read transaction; deterministic key order for stable checksums.

**Import (V1 = full replace, not merge — MASTER_SPEC I-5):**
1. Parse JSON safely; reject non-objects/oversized/garbled input with a specific error.
2. Check `format`; reject unknown. Compare `schemaVersion`: **older → run migrations in order; newer than app → reject** with a clear message; never silently downgrade.
3. Verify the checksum over the envelope excluding the `checksum` field (mismatch → reject; the implemented import offers no override).
4. Validate every record against its schema and cross-check invariants (§16): unique keys, ledger chain, completion↔occurrence dates, weekly sums, etc.
5. Require explicit user confirmation that current data will be replaced; take an automatic safety snapshot of current data first. (These are application-layer responsibilities; persistence guarantees only that the replacement itself is atomic.)
6. Write all stores in one transaction and verify the result before committing: record counts and the ledger tip must match what was validated, and progression is derived from the restored ledger. Nothing derived is imported or cached in schema v1 (a future derived cache would be rebuilt at this point). Any failure aborts with the previous data intact.

**Migrations:** the backup `schemaVersion` and the IndexedDB database version are independent integers (both start at 1 and need not stay equal; a database migration does not by itself change the backup schema, and old backups stay identifiable); each migration is a pure, tested function `vN → vN+1`; migrations never delete progression data; fixtures for every historical version are kept for tests (Phase 13 exercises "import older schema").

---

## 16. Invariants

Violation of any invariant is a bug (and a reason for import rejection). Phase 02/03 implement them as tests; Phase 13 attacks them.

**Identity & uniqueness**
- INV-1 One `QuestOccurrence` per `(templateId, dateKey)`.
- INV-2 One `QuestCompletion` per occurrence.
- INV-3 One XPTransaction per `idempotencyKey` (so one per completion; one per finalized week).
- INV-4 One `DailySummary` per `dateKey`; one `WeeklyGoalBoard` per `weekKey`; one `AchievementUnlock` per achievement; one `DailyMessageAssignment` per `dateKey`; one `WeeklyRewardClaim` per `weekKey`.

**EXP & progression**
- INV-5 Every ledger `amount` is a positive integer; `totalExp` never decreases.
- INV-6 Ledger `seq` is gap-free and strictly increasing; `totalExpAfter` chain holds; the last `totalExpAfter` is the player's total EXP (and equals any derived cache, should one ever exist).
- INV-7 `QuestCompletion.expAwarded === occurrence.snapshot.expReward === its XPTransaction.amount`.
- INV-8 A quest-completion transaction's `category` equals the occurrence's category; weekly transactions have `category: null`.
- INV-9 Σ category EXP (derived from ledger rows that carry a category) equals Σ quest-completion ledger amounts; total EXP = that sum + Σ weekly bonuses.
- INV-10 Achievements never create ledger rows.

**Time**
- INV-11 `QuestCompletion.dateKey === QuestOccurrence.dateKey` and equals the local date at `completedAt` (in the recorded time zone).
- INV-12 No occurrence exists for a date after the date of its materialization; none before `PlayerProfile.startedOn`.
- INV-13 Finalized dates form a contiguous run from `startedOn` through `finalizedThrough`; a `DailySummary` is never rewritten.
- INV-14 A summary's `eligibleCount === occurrenceIds.length` and `completedCount ≤ eligibleCount`; those counts match the stored occurrences/completions.

**Eligibility**
- INV-15 Every occurrence's date satisfies `isEligible(template-at-materialization, dateKey)`; ineligible dates have no occurrence (so scheduled quests cannot touch non-scheduled days).

**Weekly**
- INV-16 `Σ goals.maxPoints === 10` for every board at activation and in its finalized snapshot.
- INV-17 `finalization.score = Σ earnedPoints`; `bonusExp = WEEKLY_BONUS_EXP[score]`; a nonzero bonus has exactly one transaction keyed to the week.
- INV-18 A finalized board is immutable; a week finalizes only after its Sunday is finalized.
- INV-19 A `WeeklyRewardClaim` exists only for a finalized board with a non-null reward tier.

**History**
- INV-20 Deleting/archiving a template never removes occurrences, completions, summaries, or ledger rows referencing it.

**Streaks, completion finality, ledger dating** *(added after Phase 00 review)*
- INV-21 Persisted streak values (`currentStreak`, `bestStreak`, `currentPerfectStreak`, `totalPerfectDays`) change only in the same transaction that writes a `DailySummary`; they equal a pure fold over the ordered summary chain per the §7 transition table.
- INV-22 A `no_active_quests` summary has `eligibleCount = 0`, `dailyStreakEffect = perfectStreakEffect = 'neutral'`, `isPerfect = false`, and changes no streak or Perfect Day counter.
- INV-23 `quality` is a pure function of `(completedCount, eligibleCount)` via exact integer comparison; the displayed floor percentage is never an input.
- INV-24 A `QuestCompletion` and its `XPTransaction` exist together or not at all, and neither is ever updated or deleted by V1 application code.
- INV-25 For every XPTransaction, `createdAt` is the true write time (never back-dated); `weekly_goal_crusher` rows have `effectiveDate = sourceWeekKey + 6 days` and `sourceWeekKey = source.weekKey`; `quest_completion` rows have `sourceWeekKey = null` and `effectiveDate` = the completion's `dateKey`.

---

## 17. Quick reference — unique constraints (idempotency map)

| Guarantee | Enforced by |
|-----------|-------------|
| One completion per quest occurrence | `questCompletions` PK `occurrenceId` |
| One occurrence per quest per date | `questOccurrences` unique `[templateId, dateKey]` |
| One XP award per completion source | `xpTransactions` unique `idempotencyKey` |
| One Goal Crusher bonus per finalized week | `xpTransactions` unique `idempotencyKey = weekly_goal_crusher:{weekKey}` + `weeklyBoards` PK `weekKey` |
| One AchievementUnlock per achievement | `achievementUnlocks` PK `achievementId` |
| One DailySummary per date | `dailySummaries` PK `dateKey` |
| One DailyMessageAssignment per date | `dailyMessageAssignments` PK `dateKey` |
| One reward claim per week | `weeklyRewardClaims` PK `weekKey` |
