# SoloLevelingTaskList — Master Specification

**Document status:** Phase 00 deliverable. Authoritative product and architecture contract for Phases 01–15.
**Companion documents:** [DATA_MODEL.md](DATA_MODEL.md) · [PHASE_PLAN.md](PHASE_PLAN.md) · [OPEN_DECISIONS.md](OPEN_DECISIONS.md)

---

## 0. How to read this document

### 0.1 Authority

1. `CLAUDE.md` (permanent project instructions) is the highest authority.
2. This document is the product/architecture contract beneath it.
3. `DATA_MODEL.md` and `PHASE_PLAN.md` implement this document's rules and must not contradict it.
4. `OPEN_DECISIONS.md` lists what is deliberately **not** decided.

If two documents (or a document and a later request) conflict, implementation **stops** and the conflict is reported. Nobody guesses.

### 0.2 Status tags

Every rule is one of:

- **[APPROVED]** — decided; implement exactly.
- **[OPEN: OD-nn]** — deliberately undecided; see `OPEN_DECISIONS.md`. Do not invent an answer; isolate the decision point so it can be filled in later.
- **[INTERPRETATION]** — a reading of the approved requirements that fills a literal gap. Listed in Appendix A for confirmation. Treated as binding until the owner changes it.

### 0.3 Relationship to `CLAUDE.md` "Current status"

`CLAUDE.md` states that game-economy values (EXP rewards, level curve, rank thresholds, streak thresholds, Goal Crusher values, achievement thresholds) "are NOT final yet" and must not be encoded until "explicitly provided in a later phase." The Phase 00 brief **explicitly provides** the values in §5–§12 below, so they are recorded here as approved. After Phase 00 approval the owner authorized updating **only** the "Current status" section of `CLAUDE.md`; it now points to this document as authoritative for approved game/product rules and does not duplicate the values.

---

## 1. Product definition

**SoloLevelingTaskList** is a private, single-user, mobile-first productivity application styled as an RPG / "SYSTEM" progression interface. It converts real-world actions into quests and permanent progression.

```
REAL-LIFE ACTION → QUEST COMPLETION → EXP → LEVEL → RANK → LONG-TERM PROGRESSION
```

- **Primary device:** Android phone, portrait.
- **Distribution (initial):** installable PWA, private use, offline-capable, local-first.
- **Distribution (much later, optional):** Android APK via Capacitor (Phase 15).

### 1.1 Explicit non-goals

The app is NOT, and must not grow infrastructure for being: SaaS, multi-user, social, subscription-based, authentication-based, cloud-dependent, or an app-store product. No backend and no Supabase in V1.

---

## 2. Non-negotiable rules

These hold for every phase. Violating one is a defect even if tests pass.

| # | Rule |
|---|------|
| NR-1 | **Domain logic is pure and UI-independent.** React components never decide whether EXP is awarded, a streak survives, a level/rank changed, a quest is eligible, or a Weekly Goal Crusher succeeded. The UI renders domain results. |
| NR-2 | **EXP is never awarded from UI state.** Every EXP change is an auditable ledger transaction produced by the domain layer. |
| NR-3 | **EXP is idempotent.** A quest occurrence awards completion EXP at most once; a finalized week awards its bonus at most once; an achievement unlocks at most once. Double-taps, reloads, retries, multi-tab races and UI re-creation cannot duplicate awards. |
| NR-4 | **Total EXP never decreases in V1.** No EXP penalties, no level loss, no rank loss. |
| NR-5 | **History is immutable and trustworthy.** Editing/deleting a quest template never rewrites or erases past occurrences, completions, EXP transactions, Daily Summaries, or weekly boards. |
| NR-6 | **Midnight (device-local calendar) is the only day boundary.** Correctness never depends on a timer being alive at midnight; the next launch/resume reconciles any missed rollovers, including multi-day absence. |
| NR-7 | **Date logic is centralized** in one date module operating on stable `YYYY-MM-DD` date keys. No ad-hoc `new Date()` arithmetic in components or unrelated modules. |
| NR-8 | **Daily completion is count-based**, never EXP-weighted. |
| NR-9 | **Ineligible quests are invisible to a day.** A quest not eligible on a date is not shown as active, is not in that day's denominator, and cannot affect streak or Perfect Day. |
| NR-10 | **Achievements award 0 EXP.** |
| NR-11 | **Goal Crushers are not ordinary quests** and never affect the Daily Streak or the daily denominator. |
| NR-12 | **Economy values live in centralized configuration/domain code** (difficulty EXP, level curve, rank bands, daily thresholds, weekly bonus table). No magic numbers in components. |
| NR-13 | **IndexedDB is the durable source of truth.** localStorage is allowed only for small, non-critical, non-progression preferences. |
| NR-14 | **Heavy visual effects are earned-event only.** Ordinary screens stay calm; no continuous particle/shader loops on task screens; reduced-motion is honored. |
| NR-15 | **Completed phases are production architecture.** Later phases extend; they do not casually replace or refactor. |
| NR-16 | **Unresolved decisions are not invented.** Anything marked OPEN stays behind an isolated decision point until the owner decides. |

---

## 3. Technology and layering

### 3.1 Approved stack **[APPROVED]**

React · TypeScript (strict) · Vite · Tailwind CSS · shadcn-compatible structure · Framer Motion · Lucide React · PWA · IndexedDB · JSON backup export/import. Dependencies are installed in the phase that first needs them, with justification, per `CLAUDE.md` dependency discipline.

### 3.2 Five logical layers **[APPROVED]**

| Layer | Responsibility | May depend on |
|-------|----------------|---------------|
| **A. Domain** | Quest eligibility, recurrence, completion, EXP, levels, ranks, daily completion, streaks, weekly scoring, achievements, date-key arithmetic, event generation. Pure TypeScript, no React, no IndexedDB, no `window`. | nothing (stdlib only) |
| **B. Persistence** | IndexedDB repositories, schema versions, migrations, atomic transactions, backup export/import, validation. No presentation logic. | Domain types |
| **C. UI** | React screens/components, view-models, forms. Displays domain results; invokes domain commands. | Domain (read/commands), Persistence (via application services) |
| **D. Animation/effects** | Framer Motion/canvas presentation of domain events. Consumes events; never produces progression facts. | Domain event types only |
| **E. Platform/PWA** | Manifest, service worker, install, safe areas, haptics/sound/visibility/resume hooks. | none of the game rules |

Dependency direction is one-way (C → A, B → A, D → A events). Domain must never import from B, C, D, or E. Phase 01 should enforce this with an import-boundary lint rule.

### 3.3 Command → result pattern **[APPROVED]**

Progression-changing operations follow one shape:

```
UI intent
 → application service loads current state (read)
 → pure domain function: (state, command, now) → { writes, events } | rejection
 → persistence commits `writes` in ONE IndexedDB transaction,
   re-checking uniqueness constraints inside the transaction
 → events are returned to the UI/animation layer
```

- The domain function is deterministic given `(state, command, now)`. `now` and the local timezone are injected via a clock abstraction, never read ambiently.
- If the transaction hits a uniqueness constraint (e.g., the occurrence was already completed by a concurrent tap or tab), the operation resolves as an **idempotent no-op** ("already completed"), not an error and not a second award.
- A single action may legitimately emit many events (§15). The domain layer represents that faithfully; the UI never infers events itself.

### 3.4 Proposed source layout (non-binding until Phase 01)

```
src/domain/        pure game rules (+ tests colocated)
src/persistence/   IndexedDB, repositories, migrations, backup
src/app/           application services wiring domain + persistence
src/features/      UI by feature (home, quests, weekly, status, settings…)
src/effects/       animation/effects (adapted reference components)
src/platform/      PWA, haptics, sound, visibility hooks
```

---

## 4. Calendar, time, and rollover

### 4.1 Date keys **[APPROVED]**

- **`DateKey`** = `YYYY-MM-DD`, the device-local calendar date. It is the only date representation used by domain rules and persistence keys.
- **Timestamps** (`EpochMs`, UTC milliseconds) are stored for audit only. Every record that is attributed to a day also stores the `DateKey` explicitly; the key is never re-derived from a timestamp later (this makes history immune to later timezone changes).
- **Date arithmetic** (adding days, day-of-week, "days between") is done on the calendar fields (e.g., via a UTC day-serial of the Y/M/D triple), **never** by adding `24 × 3600 × 1000` ms. This makes DST transitions (23/25-hour days), leap days (e.g., 2028-02-29), and year boundaries correct.
- **Weekdays** use ISO numbering: 1 = Monday … 7 = Sunday.

### 4.2 Week keys **[APPROVED]**

A week runs **Monday → Sunday** in local calendar dates. **`WeekKey`** = the `DateKey` of that week's Monday (e.g., `2026-09-28` for the week ending Sunday `2026-10-04`). Using the Monday date (not ISO week numbers) avoids year-boundary ambiguity (e.g., 2026-W53 vs 2027-W01).

### 4.3 The day boundary **[APPROVED]**

A day runs from local `00:00:00.000` through `23:59:59.999`. At local midnight:

1. the ending day becomes **final**;
2. its completion percentage and day quality are recorded in an immutable Daily Summary;
3. streak consequences are determined;
4. the new calendar day becomes active and its eligible quests are materialized.

Once final, a day can never be completed, edited, or re-scored. A quest occurrence can only be completed while the local date equals the occurrence's date.

### 4.4 Reconciliation (catch-up) **[APPROVED]**

Rollover is performed by an idempotent **reconcile** operation, not by a timer. It runs on: app launch, return from background (`visibilitychange`/`pageshow`/`focus`), and—as a convenience only—a foreground timer aimed at the next midnight. Correctness must never depend on the timer.

Reconcile, given `today`:

1. Determine the first not-yet-finalized date (the cursor). Dates before the player's `startedOn` are never materialized.
2. For each date from the cursor up to **yesterday**, in chronological order: materialize that date's occurrences (if not already), finalize it (Daily Summary), and, if the date is a Sunday, finalize that week's board *after* the day. Each date commits atomically so an interrupted catch-up resumes from the cursor.
3. Materialize **today's** occurrences. Occurrences are materialized only for dates ≤ today.
4. Run achievement evaluation and collect events.

Reopening after N days away therefore finalizes N days: each with all of its eligible quests uncompleted (an Incomplete Day if it had any eligible quests), and applies streak consequences accordingly.

*Materializing missed days from current templates is sound because templates can only change while the app is open, and every change is reflected in the open day's occurrences at once (a quest that becomes eligible today is materialized as soon as it is saved, and an occurrence that already exists is frozen — §5.7). Catch-up only covers dates after the last day the app was open, for which the templates have not changed.*

### 4.5 Edge cases **[APPROVED where stated]**

| Case | Rule |
|------|------|
| DST / timezone offset change | Handled by calendar-field date arithmetic (§4.1). A 23- or 25-hour day is still exactly one `DateKey`. |
| Leap day, year boundary | Must be covered by tests (Phase 02/13). |
| Device clock/timezone moves to an earlier date than the last recorded day | **[APPROVED — OD-22, Phase 06]** Finalized days are never reopened, re-finalized, deleted or rewritten, and streaks never regress. The app enters a safe paused state ("clock appears to have moved backwards"): nothing is finalized or materialized and completion/quest changes are refused until the device date reaches the recorded day again. See [DAILY_LIFECYCLE.md](DAILY_LIFECYCLE.md). |
| Day with zero eligible quests | **[APPROVED]** Classified **No Active Quests**; neutral for streaks (§7.5). |
| App open across midnight | The UI receives a rollover (reconcile result) and transitions to the new day; the Sleep action does *not* cause this. |

---

## 5. Quest system

### 5.1 Quest kinds **[APPROVED]**

| Kind | Meaning | Eligibility |
|------|---------|-------------|
| **Daily Quest** | Recurring, active every day. | every date within its active period |
| **Scheduled Quest** | Recurring only on specific days. | by **selected weekdays** *or* by **interval from an anchor date** |
| **One-Time Quest** | Belongs to exactly one calendar date. | only on that date |
| **Weekly Goal Crusher goal** | *Not a quest.* Belongs to the separate Weekly system (§12). | n/a |

**Interval recurrence:** eligible on date `d` iff `d ≥ anchor` and `daysBetween(anchor, d) mod N = 0`, with `N ≥ 2`. Example: "Gym every 2 days" anchored `2026-10-01` is eligible `10-01, 10-03, 10-05, …`. The schedule is anchor-based and does **not** shift when a session is missed.

**Weekday recurrence:** eligible on date `d` iff `isoWeekday(d)` is in the selected set (non-empty, no duplicates).

**One-time quests** do not carry over: a missed One-Time Quest is recorded as missed for its date and does **not** move to the following day. **[APPROVED V1 rule]**

Every quest also has an **active period** (`activeFrom` … optional `activeUntil`); a quest is only eligible within it (see DATA_MODEL).

### 5.2 Eligibility consequences **[APPROVED]**

If a quest is not eligible on a date it: does not appear as active; does not enter that day's denominator; cannot hurt the streak; cannot hurt Perfect Day status. (NR-9)

### 5.3 Difficulty and base EXP **[APPROVED]**

| Difficulty | EXP |
|-----------:|----:|
| E | 10 |
| D | 20 |
| C | 35 |
| B | 55 |
| A | 80 |
| S | 120 |

- Quest EXP is **derived from the selected difficulty**. There is **no free-form EXP input** in V1.
- **Normal-quest EXP is always determined by difficulty. [APPROVED]** Custom EXP overrides are not supported in V1, and there is no editable numeric EXP field anywhere in quest management.
- Values live in one centralized configuration module (NR-12).
- The EXP value is **snapshotted onto each occurrence** when it is materialized, so changing configuration/templates later never rewrites what past completions were worth.

### 5.4 Categories **[APPROVED]**

Every normal quest has exactly one **primary category**; the five permanent categories are: **Discipline, Fitness, Business, Knowledge, Trading.** The set is fixed in V1 (not user-extensible).

### 5.5 Seeded default quests **[APPROVED]**

The five prayers are **five separate Daily Quests**, not one 0/5 quest:

| Quest | Difficulty | EXP | Category |
|-------|-----------:|----:|----------|
| Fajr | E | 10 | Discipline |
| Dhuhr | E | 10 | Discipline |
| Asr | E | 10 | Discipline |
| Maghrib | E | 10 | Discipline |
| Isha | E | 10 | Discipline |

Each prayer has its own completion state, completion timestamp, and EXP award, and independently contributes one quest to the daily completion denominator. **No prayer-chain bonus EXP exists in V1.** Prayer history may later feed achievements/statistics.

**Sleep quest** (recurring Daily Quest):

| Title | Difficulty | EXP | Category |
|-------|-----------:|----:|----------|
| Sleep before 00:00 | D | 20 | Discipline |

- Completed **manually, before local midnight.** It is an honor-system action; the app does not verify sleep.
- The UI may later present a prominent Sleep action; completing it may open the Daily Report (§14.2).
- **The Sleep action does not control day rollover. Midnight does** (§4.3). Completing Sleep does not lock the day; other quests may still be completed until midnight.
- After midnight, the previous day's Sleep occurrence can no longer be completed.

*Other example quests named in conversation (hydration, gym) have no approved parameters and are therefore **not seeded** — see **[OPEN: OD-15]**.*

With all six seeded quests the baseline daily yield is 70 EXP (5 × 10 + 20).

### 5.6 Completion and EXP integrity **[APPROVED]**

Conceptual chain: `QuestOccurrence → QuestCompletion → XPTransaction`.

- A quest occurrence can be completed **at most once**; completion awards its EXP **at most once** (NR-3).
- Prevented by design: duplicate EXP from repeated taps, reload, double completion records, UI delete/recreate.
- The XPTransaction carries enough source information to explain why the EXP exists (source type + source identity).
- **Completion is final in V1. [APPROVED]** Once a QuestOccurrence is completed and its EXP transaction has been successfully awarded, ordinary UI interaction cannot undo or "uncomplete" it. Reasons: EXP never decreases (NR-4); completion and ledger history stay auditable; completion state can never disagree with EXP state; re-award exploits are impossible. Completion records and ledger rows are therefore append-only, with no delete/update path. A deliberate future correction/admin mechanism may be considered after V1 but is **out of scope for V1** and must not be built speculatively.

### 5.7 Editing and deleting quests **[APPROVED principles]**

- **Editing a template** affects only *appropriate future* occurrences; past occurrences are frozen snapshots.
- **Deleting a template** archives it (`status: 'archived'`, the authoritative archive state; the template is never hard-deleted). It stops generating future occurrences and never erases past completions, Daily Summaries, EXP transactions, or archived weekly progress.
- **Same-day semantics [APPROVED].** Once a QuestOccurrence exists for a calendar date it is **frozen** for that date:
  - **Create.** A new template that is eligible today gets today's occurrence immediately and enters today's denominator; one that is not eligible today gets none until it becomes eligible. Nothing is generated for earlier dates.
  - **Edit.** Changes apply to occurrences created afterwards. An existing occurrence keeps every snapshotted field (title, difficulty, EXP, category, recurrence kind, template revision), stays visible, and is never removed or rebuilt, even if the edit makes the quest ineligible today. If no occurrence exists yet, the edited template's normal eligibility decides whether one is created.
  - **Archive.** Stops all future occurrences. An existing occurrence for today is not removed: it stays visible, stays completable until the day ends, and stays in today's denominator, so an unfinished hard quest cannot be archived away to improve the day.
  - **Restore.** Reactivates an archived template; future eligibility resumes from its stored recurrence, history is untouched, an existing occurrence is reused, and nothing is generated retroactively.
  - No create, edit, archive or restore awards or changes EXP.

---

## 6. EXP ledger **[APPROVED]**

- All EXP changes are **XPTransactions** in an append-only, auditable ledger. Amounts are positive integers.
- Source types in V1: `quest_completion` and `weekly_goal_crusher`. (Achievements award 0 EXP, so they are never a source.)
- Each transaction distinguishes its true **`createdAt`** timestamp from its **`effectiveDate`** (the calendar date it belongs to for reporting) and, for weekly bonuses, its **`sourceWeekKey`** (§12.5).
- Each transaction carries a unique **idempotency key** (e.g., `quest_completion:<occurrenceId>`, `weekly_goal_crusher:<weekKey>`).
- **Total EXP** is the sum of the ledger and is permanent. Player Level and Rank are **derived** from total EXP and are not independently mutable state.
- **Category EXP** is derived from ledger transactions that carry a category (§10).

---

## 7. Daily completion, day quality, streaks

### 7.1 Formula **[APPROVED]**

```
completionPercent = completedEligibleQuests / totalEligibleQuests × 100
```

- Only quests eligible on that calendar day enter the denominator.
- Not weighted by EXP or difficulty.
- Goal Crushers, achievements, and Daily Messages never enter it.

### 7.2 Day quality **[APPROVED]**

| Completion | Quality |
|-----------:|---------|
| 0 – 69 % | **Incomplete Day** |
| 70 – 84 % | **Completed Day** |
| 85 – 99 % | **Strong Day** |
| 100 % | **Perfect Day** |

A day that has **zero eligible quests** has no ratio and is classified **No Active Quests** instead (§7.5).

#### Exact-ratio classification **[APPROVED]**

Classification uses the **exact mathematical ratio** `completedEligible / totalEligible`. It must **never** be based on a rounded display percentage. Implementations should prefer integer/rational comparison over floating-point, e.g.:

| Quality | Test (integers, `total > 0`) |
|---------|------------------------------|
| Completed or better | `completed × 100 ≥ 70 × total` |
| Strong or better | `completed × 100 ≥ 85 × total` |
| Perfect | `completed = total` |

Examples:

| Exact ratio | Quality |
|------------:|---------|
| 69.6 % | Incomplete |
| 70.0 % | Completed |
| 84.9 % | Completed |
| 85.0 % | Strong |
| 99.9 % | Strong |
| 100 % | Perfect |

Counted examples: 7/10 → 70 % Completed; 9/10 → 90 % Strong; 10/10 → Perfect; 17/20 → 85 % Strong; 14/20 → 70 % Completed; 13/20 → 65 % Incomplete.

#### Whole-number display percentage **[APPROVED]**

When the UI shows a whole-number percentage it **floors** the exact value (integer floor division, `⌊completed × 100 / total⌋`); it never rounds. 69.6 % displays **69 %**, not 70 %; 99.9 % displays **99 %**, and "100 %" is shown only when every eligible quest is complete. This guarantees the UI never shows "70 %" while the domain still classifies the day Incomplete. Display flooring is presentation only and must never feed back into classification.

### 7.3 Live status **[APPROVED]**

- There is **no manual "Mark Day Complete"** control.
- Status updates live as quests are completed. Reaching 70 % does not finalize the day; it may keep improving until midnight.
- The day is finalized only at midnight (§4.3).

### 7.4 Streaks — persisted only at finalization **[APPROVED]**

Tracked values:

- current **Daily Streak**
- **best** Daily Streak
- total **Perfect Days**
- current **Perfect Day Streak**

**Principle: persisted streak values change only when a calendar day is finalized (§4.3).** They are never modified by a live in-progress day.

When a day is **finalized** (and has at least one eligible quest):

| Finalized day | Daily Streak | Perfect Day Streak | Total Perfect Days |
|---------------|--------------|--------------------|--------------------|
| ≥ 70 % (Completed, Strong, or Perfect) | **+1** | — | — |
| < 70 % (Incomplete) | **reset to 0** | — | — |
| exactly 100 % (Perfect) | (+1 as ≥ 70 %) | **+1** | **+1** |
| < 100 % | — | **reset to 0** | — |

- **Best Daily Streak** updates only from finalized streak values: `best = max(best, newCurrentStreak)` at finalization.
- A day with **zero eligible quests** is neutral — see §7.5.
- Goal Crusher performance **never** affects any streak (NR-11).

**Live display during the active day (presentation only).** If the player's live ratio reaches ≥ 70 %, the UI may show **STREAK SECURED** and may show the *projected* next streak value (`persisted current + 1`). That projection is a derived view; the persisted streak is not incremented until the day is finalized. Likewise a live 100 % may show a projected Perfect Day Streak without persisting it. The live ratio can still fall (for example, if a quest created mid-day is eligible today — see §5.7); the banner and projection then simply disappear. Persisted values are unaffected either way until finalization.

**No streak freezes in V1. [APPROVED]** There are no streak-freeze tokens, vacation freezes, or rest-day freezes. A Scheduled Quest that is not eligible on a date simply does not enter that day's denominator (NR-9).

### 7.5 Days with zero eligible quests **[APPROVED]**

A finalized calendar day with **zero** eligible quests is classified **No Active Quests**. It is **neutral for BOTH streak systems**:

- it does **not** increment the Daily Streak;
- it does **not** reset the Daily Streak;
- it does **not** increment the Perfect Day Streak;
- it does **not** reset the Perfect Day Streak;
- it is **not** a Perfect Day (and does not count toward total Perfect Days);
- it is **not** an Incomplete Day;
- it remains classified `No Active Quests`.

A Daily Summary is still written for the date (eligible count 0, quality `no_active_quests`) so the day remains reconstructable; no division by zero ever occurs (an empty ratio is never evaluated as a percentage).

---

## 8. Player level system **[APPROVED]**

Level starts at **1**. EXP required to advance from level `L` to `L+1`:

```
XP_TO_NEXT(L) = round( 100 + 35 × (L − 1)^1.25 )      for L ≥ 1
```

Rounding: nearest integer, ties away from zero. Level 1→2 = 100 (the power term is 0). Level 2→3 = 135 (35 × 1). Later levels grow progressively.

### 8.1 Reference values (golden table)

Computed with IEEE-754 double arithmetic; implementations must reproduce these exactly and tests must pin them.

| Level L | XP_TO_NEXT(L) (L → L+1) | Total EXP needed to *reach* L |
|--------:|------------------------:|------------------------------:|
| 1 | 100 | 0 |
| 2 | 135 | 100 |
| 3 | 183 | 235 |
| 4 | 238 | 418 |
| 5 | 298 | 656 |
| 6 | 362 | 954 |
| 7 | 429 | 1 316 |
| 8 | 499 | 1 745 |
| 9 | 571 | 2 244 |
| 10 | 646 | 2 815 |
| 20 | 1 488 | 12 937 |
| 35 | 2 974 | 45 392 |
| 50 | 4 637 | 101 454 |
| 75 | 7 696 | 253 446 |
| 99 | 10 892 | 474 459 |
| 100 | — | 485 351 |

(Level 3's raw value is 183.244…, rounding to 183.)

### 8.2 Derivation

Given permanent total EXP `T`: `cumulative(1) = 0`, `cumulative(L+1) = cumulative(L) + XP_TO_NEXT(L)`. `level = max L with cumulative(L) ≤ T`; `expIntoLevel = T − cumulative(level)`; `expToNext = XP_TO_NEXT(level)`.

### 8.3 Multi-level gains **[APPROVED]**

One EXP transaction may cross several level boundaries. The domain engine must report: **previous level, new level, every level crossed, and remaining EXP toward the next level.** The animation system never computes this.

*Example:* a fresh player (T = 0) receiving the 500 EXP weekly bonus lands at T = 500 → Level 4 (cumulative(4) = 418), 82 / 238 into the level, with levels 2, 3, 4 crossed.

### 8.4 Levels after 100 **[APPROVED]**

**Player Level has no maximum in V1.** Level 100 is a major progression milestone, not a level cap.

- Progression continues to Level 101, 102, 103, and onward.
- The same `XP_TO_NEXT(L)` formula (§8) applies at every level `L ≥ 1`, including above 100.
- Total EXP remains permanent (NR-4). EXP earned at or above Level 100 is an ordinary ledger transaction like any other.
- There is **no prestige mechanic**, no reset, no EXP reset, and no level reset.
- The level engine is total over all non-negative total-EXP inputs: there is no clamp, no cap branch, and no special-case path past Level 100.
- Rank behavior at and above Level 100 is defined in §9.

---

## 9. Rank system **[APPROVED]**

Rank derives **only from Player Level** in V1.

| Rank | Levels |
|------|--------|
| E-Rank | 1 – 9 |
| D-Rank | 10 – 19 |
| C-Rank | 20 – 34 |
| B-Rank | 35 – 49 |
| A-Rank | 50 – 74 |
| S-Rank | 75 – 99 |
| **Level 100 and above** | one special rank tier, semantic identifier **`special_100_plus`**; display name **`???`** **[APPROVED — OD-01, Phase 08]** |

Levels 1–99 use the bands above. Every level from 100 upward (100, 101, 102, …) belongs to the single `special_100_plus` tier; there are no further rank bands above it in V1, so reaching Level 100 is the last rank-up.

Rank-ups (at Levels 10, 20, 35, 50, 75, 100) are rarer and visually far more significant than level-ups. Rank calculation belongs to domain logic. The special tier's **display name is `???`** **[APPROVED — OD-01, resolved in Phase 08]**: Level keeps rising normally past 100 and the rank reads `???`. The identifier `special_100_plus` is opaque and carries no display meaning; the label lives in one place (`RANK_LABELS` in `displayLabels.ts`) and no canonical rank name is invented, so a name could be chosen later as a one-line label change.

---

## 10. Player categories / stats **[APPROVED]**

When a quest awards EXP, the same amount also contributes to that quest's category total.

*Example:* a 55 EXP Trading quest → +55 Player EXP and +55 Trading category EXP.

- Category EXP **does not** level the Player independently.
- It exists for statistics, effort distribution, the Status screen, and progression visualization.
- Category totals are **derived from ledger history**, not stored as separate duplicate state (a cache is allowed only if verifiable against the ledger).
- **Weekly Goal Crusher bonus EXP is SYSTEM/WEEKLY EXP** and is **not** assigned to any of the five categories.

---

## 11. Achievements **[APPROVED principles]**

- Achievements are milestone trophies and award **0 EXP** (NR-10). This is intentional, to avoid EXP → achievement → EXP snowballing.
- Conceptual record: id, title, description, condition/type, unlock timestamp, optional rarity/presentation tier.
- At most one unlock per achievement.
- The engine is **data-driven and extensible**; definitions are data, not branching code per achievement.
- **The V1 catalog is approved [APPROVED — OD-03, Phase 08]**: 28 quest-agnostic achievements (General 6, Daily 6, Streak 4, Weekly 6, Rank 6), listed in [PROGRESSION_STATS_ACHIEVEMENTS.md](PROGRESSION_STATS_ACHIEVEMENTS.md) §4.
- **Derived, not stored [APPROVED — Phase 08]:** an achievement is unlocked exactly when history says it qualified, and its unlock moment is the exact record that first satisfied the condition. There is no unlock row and no `achievementUnlocks` store (this supersedes the persisted design in DATA_MODEL §12). At most one unlock per achievement holds by construction.
- **Perfect Week [APPROVED]:** a *Perfect Week* is a **finalized** Weekly Goal Crusher board with a score of exactly **10 / 10**. "10 Perfect Weeks" therefore means 10 finalized boards scored 10/10.
- **"25 Gym Sessions" [DEFERRED beyond V1: OD-18]:** how an achievement recognizes a "Gym" quest is deliberately unresolved, and no quest-specific achievement ships in V1. Do **not** assume every Fitness-category quest is a Gym session, and never match on a title. The question stays open unless a future design introduces a stable semantic quest tag / activity identifier (a snapshotted key; see [OPEN_DECISIONS.md](OPEN_DECISIONS.md)).
- Achievements that depend on streak or Perfect Day counters evaluate against the **persisted (finalized)** values (§7.4), unless a specific achievement is later defined on live state.

---

## 12. Weekly Goal Crusher system

A deliberately separate, weekly, needle-moving objective system.

### 12.1 Board **[APPROVED]**

One Weekly Goal Crusher **board** per week (Monday → Sunday, local dates) holding: week identifier, start/end dates, optional **Weekly Focus** statement, weighted goals, total weekly score, finalization status, reward tier, claimed/not-claimed real-life reward, weekly bonus EXP, and a historical snapshot.

*Example Weekly Focus:* "Build clean backtesting reps, keep the rules consistent, and keep AAA moving around work."

### 12.2 Weighted goals **[APPROVED]**

- Each goal has a maximum point value; **points across the board must total exactly 10.**
- Valid weightings, e.g.: 3+3+2+1+1, 4+3+2+1, 5+3+2.
- Goal fields (conceptual): ID, title, measurable target/description, max points, progress, completion state, optional notes, optional link to ordinary quest activity.
- Points are integers ≥ 1 **[INTERPRETATION I-10]** (V1 scoring has no fractions).

### 12.3 Relationship to quests **[APPROVED]**

Weekly goals may relate to Daily/Scheduled quests but are not the same thing. Example: Daily/Scheduled quest "Gym" awards normal quest EXP on each completion; Weekly goal "Complete 2 gym sessions" shows 0/2 → 1/2 → 2/2 from eligible Gym completions, and when the target is met the goal's weighted points are earned. **The normal quest EXP is never awarded twice.**

Progress modes supported in V1: **manually tracked** or **derived from linked quest completions** (one linked quest template per goal; the count of its completions whose date lies in the week). **[APPROVED — OD-10 resolved in Phase 07]** No other mode exists in V1. Do not build arbitrary analytics.

### 12.4 Scoring **[APPROVED]**

`weeklyScore = Σ maxPoints of completed goals` (0–10). Each goal is **all-or-nothing** in V1: full points when its target is met, zero otherwise. A failed weekly goal never invalidates Daily Quests; Goal Crusher results never affect the Daily Streak.

### 12.5 Weekly bonus EXP **[APPROVED]**

| Score | Bonus EXP |
|------:|----------:|
| 0 – 5 | 0 |
| 6 | 100 |
| 7 | 150 |
| 8 | 225 |
| 9 | 325 |
| 10 | 500 |

**Exactly one** bonus applies — it is a lookup, not cumulative (9/10 = 325, *not* 100+150+225+325). It is awarded **exactly once**, at finalization, through the normal EXP transaction system with source `weekly_goal_crusher`, and is **not** assigned to a player category. The score is not paid out live; the bonus is awarded only at finalization.

**Bonus transaction dating [APPROVED].** The transaction records three distinct facts and never falsifies the audit timestamp: its actual **`createdAt`** (when the app really wrote it), the **`effectiveDate`** it belongs to for reporting (the board's Sunday), and the **`sourceWeekKey`** (the board's Monday). Example: the week ends Sunday 2026-10-04 and the app is next opened Wednesday 2026-10-07 → `createdAt` = the actual Wednesday timestamp, `effectiveDate` = 2026-10-04, `sourceWeekKey` = 2026-09-28. The bonus counts toward the completed week's reporting without back-dating the audit record.

### 12.6 Real-life rewards **[APPROVED]**

- Separate from EXP. Reward tiers correspond to scores **6+, 7+, 8+, 9+, 10**.
- Reward **text is user-configurable**. Illustrative examples only (not hardcoded product rules): 6+ 45 min guilt-free gaming/anime · 7+ favorite dessert · 8+ movie night · 9+ budgeted purchase · 10 full evening off / larger reward.
- At week end, **only the highest achieved tier** applies.
- The app provides **CLAIM REWARD**; claiming records that it was claimed and has **no EXP effect**.
- **A reward becomes claimable only after that week's Goal Crusher board has been finalized** (the tier is only fixed at finalization). **[APPROVED V1 rule]** A claim never expires and is possible at any time after finalization; a tier with no reward text has nothing to claim.

### 12.7 Finalization **[APPROVED]**

At the end of Sunday / beginning of Monday the board becomes historical. Weekly bonus EXP is never awarded twice. If the app was closed at rollover, the next reconcile finalizes it (after finalizing the week's final day, §4.4). Finalized boards never silently change when quest templates are later edited — the board stores a snapshot of what it needs (goals, progress, tier text).

**Board lifecycle [APPROVED — OD-19 resolved in Phase 07]:** a week without a board is not finalized and leaves no record, bonus or penalty; a board is created for the current week only; it may be edited any time before finalization (score and completion are derived, so edits take effect at once) as long as it totals exactly 10; a linked goal counts completions from the week's Monday whenever it was created; finalization freezes the exact progress used for scoring and the reward tier text, after which the board is immutable. Details: [WEEKLY_GOAL_CRUSHER.md](WEEKLY_GOAL_CRUSHER.md).

---

## 13. Daily Message **[APPROVED]**

The home experience shows a **DAILY MESSAGE** (replaces generic "Quote of the Day").

- Exactly **one message per local calendar day**; the same message all day; reopening/reloading never changes it; it changes at the next daily rollover.
- Works **fully offline**; **no external quote API**.
- **No EXP, streak, or gameplay effect.**
- Content: original motivational statements, SYSTEM-style directives, and properly attributed/public-domain quotations only. Avoid questionable internet attributions.
- Style examples: "Consistency compounds." · "Today's actions determine tomorrow's rank." · "Progress is earned in repetitions nobody sees." · "[SYSTEM DIRECTIVE] Complete what you started."
- The chosen message is **deterministic or persisted** so it cannot randomly change per reload; the design persists one assignment per `DateKey`.
- Ships as a curated **local** message bank. Exact content/count: **[OPEN: OD-04]**.

---

## 14. Home and end-of-day experience

### 14.1 Home screen content **[APPROVED]**

Conceptually, Home shows: `[SYSTEM]` time/day greeting · Player Level · Rank · current Daily Streak · Daily Message · today's completion progress · today's eligible quests · current EXP / EXP required for next level. It must remain **readable and calm**; no constant particle/shader animation on the regular task list.

### 14.2 Daily Report **[APPROVED]**

A Daily Report presentation will eventually exist. The Sleep action is a natural entry point, but the Daily Report is **not** responsible for rollover. It may show: eligible quests completed, completion percentage, day quality, EXP earned today (quest EXP), current streak, Perfect Day status — **all sourced from domain records.** A Daily Report viewed **before midnight is provisional/live**; the authoritative, final Daily Summary is created only through the calendar rollover (finalization) logic (§4.3–§4.4), never by opening the report. **[APPROVED V1 rule]**

---

## 15. Domain events **[APPROVED]**

The domain layer returns structured events; the UI/animation layer may present them but never decides whether they occurred.

`QuestCompleted` · `XPAwarded` · `LevelUp` · `RankUp` · `AchievementUnlocked` · `DayStatusChanged` · `PerfectDayReached` · `WeeklyGoalCompleted` · `WeeklyBoardFinalized`

One action can emit several (e.g., quest completion + EXP + two levels + a rank change + an achievement); the result must represent that correctly and in a defined order (see DATA_MODEL §11). Events are not replayed after a multi-day catch-up **[APPROVED — OD-21, Phase 06]**: finalization awards no EXP and emits no events; the UI shows at most one restrained "N days reconciled." notice (see [DAILY_LIFECYCLE.md](DAILY_LIFECYCLE.md)).

---

## 16. Persistence and backup requirements **[APPROVED]**

IndexedDB is the durable local source of truth. Persistence must support: **schema versions, migrations, validated records, transaction safety, and recovery from malformed data where practical.**

- **EXPORT BACKUP:** a complete, portable JSON representation of important user progression.
- **IMPORT BACKUP:** validates schema, checks version, handles invalid/corrupt input, prevents accidental duplicate merging, and restores safely. V1 import is a **full replace** of progression data after explicit confirmation — not a merge. **[INTERPRETATION I-5]**
- Derived caches are rebuilt/verified from the ledger on import rather than trusted.

Detailed design: DATA_MODEL §14–§15. Not implemented in Phase 00.

---

## 17. Visual, animation, and platform requirements

### 17.1 Visual language **[APPROVED]**

Dark futuristic fantasy SYSTEM UI: near-black, black-purple, deep violet, purple energy, subtle cyan highlights, luminous thin borders, transparent/dark panels, HUD detailing, restrained gradients, controlled particles. Avoid generic bright gaming UI and constant visual noise; spend spectacle on earned events. Final typography: **[OPEN: OD-09]**.

### 17.2 Reference pack **[APPROVED]**

Read-only reference material is at `_reference/solo-leveling-effects-pack/` (BorderTrail, ParticleCanvas, SystemAura, HolographicCard, HudFrame, XPProgress, AnimatedNumber, TextScramble, SystemPopup, DailyStreak, LevelUpOverlay, RankUpOverlay, `system-effects.css`, and the Player Awakening image). Rules: never modify `_reference/`; do not integrate or copy anything in Phase 00; effects are selectively adapted in dedicated visual/animation phases; preserve license/attribution notes (see `THIRD_PARTY_REFERENCES.md` in the pack).

Pack observations that later phases must account for (observed, not acted on):

- `_reference/` is **git-ignored** (`.gitignore`: "Local-only reference material"). Anything the app needs (including the Awakening image) must be deliberately **copied/adapted into app source** in its phase, or it won't be versioned.
- `DailyStreak` runs an infinite flame animation and `XPProgress` an infinitely repeating shimmer; both would violate NR-14 on the always-visible Home screen if adopted as-is, and `DailyStreak` has no reduced-motion handling. They must be adapted (gated by reduced-motion/visibility/intensity setting).
- `RankUpOverlay` uses `ParticleCanvas` with up to 320 particles — acceptable for a rare rank-up event only, mounted on demand.
- Reference components are styled with hard-coded Tailwind colors; Phase 09 should lift these into design tokens.

### 17.3 Animation intensity model **[APPROVED]**

| Event | Presentation |
|-------|--------------|
| Normal quest completion | short glow, checkbox/state animation, +EXP feedback, EXP bar motion, subtle haptic if available |
| Hard / important quest | slightly stronger effect |
| Goal Crusher completion | major reward presentation at the weekly board's **finalization** (tiered by score; live goal / 10-of-10 moments are small and reversible) **[RESOLVED — OD-20, Phase 10]**, see [EFFECTS_EVENT_ENGINE.md](EFFECTS_EVENT_ENGINE.md) |
| Level up | full-screen event: aura, particles, strong typography, level transition, haptic/sound where enabled |
| Rank up | rarer and significantly more dramatic than level up |
| First-launch Player Awakening | cinematic onboarding event |

Settings eventually support: sound on/off, haptics on/off, effects intensity, reduced-motion compatibility. Sound effects, haptic patterns, effect intensity and timings: **[RESOLVED — OD-06, OD-07, OD-08, Phase 10]** (original synthesized sound, off by default; Vibration-API patterns, on by default; effects NORMAL or REDUCED; V1 timings as tunable data), see [EFFECTS_EVENT_ENGINE.md](EFFECTS_EVENT_ENGINE.md).

### 17.4 Player Awakening **[APPROVED concept]**

The supplied reference image shows a SYSTEM notification: *"You have acquired the qualifications to be a Player. Will you accept?"* First launch eventually plays: SYSTEM notification → qualification message → **ACCEPT** → initialization → Level 1 → first Daily Quest experience. Implemented only in its dedicated phase (Phase 11).

### 17.5 Performance **[APPROVED]**

Primary device is mobile. Avoid: permanent high-density particle canvases, unnecessary WebGL, background animation loops while hidden, excessive re-renders, huge dependencies for trivial behavior. Expensive effects mount only when needed and clean up. Reduced motion is supported everywhere.

### 17.6 Accessibility and interaction **[APPROVED]**

Readable contrast, semantic buttons, keyboard support where practical, appropriate ARIA, reduced motion, adequate touch targets, visible interaction states. Theme never overrides usability.

---

## Appendix A — Interpretations

### A.1 Locked as approved V1 rules (owner-confirmed after Phase 00 review)

| ID | Rule | Where |
|----|------|-------|
| I-1 | Day quality uses the **exact ratio** (integer/rational comparison); whole-number UI percentages **floor**, never round. | §7.2 |
| I-2 | A missed One-Time Quest does **not** carry into the following day. | §5.1 |
| I-8 | A weekly bonus transaction keeps its true `createdAt`, plus a separate `effectiveDate` (the board's Sunday) and `sourceWeekKey`. It is never back-dated. | DATA_MODEL §6 |
| I-9 | Perfect Day Streak follows the finalization principle: finalized 100 % → +1; finalized < 100 % → reset to 0. | §7.4 |
| I-11 | A weekly reward is claimable only after that week's board is finalized. | §12.6 |
| I-12 | A Daily Report before midnight is provisional/live; the authoritative Daily Summary comes from rollover finalization. | §14.2 |
| I-13 | **Phase 02** owns pure calendar/date/domain functions; **Phase 06** owns runtime rollover, resume reconciliation, and lifecycle behavior. | PHASE_PLAN |
| I-14 | A finalized **No Active Quests** day (zero eligible quests) is neutral for **both** streak systems — it neither increments nor resets the Daily Streak or the Perfect Day Streak, is not a Perfect Day, and is not an Incomplete Day. | §7.5 |
| I-15 | A *Perfect Week* = a finalized Weekly Goal Crusher board scoring exactly 10/10. | §11 |

### A.2 Interpretations still awaiting explicit confirmation

These fill literal gaps and are binding until the owner objects.

| ID | Interpretation |
|----|----------------|
| I-3 | `WeekKey` = the Monday's `DateKey` (§4.2). |
| I-4 | Quest occurrences are materialized only for dates ≤ today; future views are projections, not stored (§4.4). |
| I-5 | V1 backup import is a **full replace** with confirmation, not a merge (§16). |
| I-6 | Level and rank are **derived** from total EXP and never stored as independent mutable state (§6). |
| I-7 | `AppSettings` lives in IndexedDB so it is included in backups; purely cosmetic UI memory (e.g., last tab) may use localStorage (DATA_MODEL §8). |
| I-10 | Weekly goal points are integers ≥ 1, so a board has between 1 and 10 goals (§12.2). |
