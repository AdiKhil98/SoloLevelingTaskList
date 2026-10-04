# SoloLevelingTaskList — Weekly Goal Crusher (Phase 07)

Implementation record of Phase 07: the Monday→Sunday weighted-goal board, manual and linked progress, scoring, the weekly bonus, finalization inside the Phase 06 reconcile, real-life reward claims, and the Weekly screens. Approved rules stay in `MASTER_SPEC.md` (§12); this file records how they are implemented and how the two open decisions (OD-10, OD-19) were resolved.

## What exists

| Layer | Where |
|-------|-------|
| Domain (pure) | `src/domain/time/weekKey.ts`, `config/weekly.ts`, `weekly/{types,validation,scoring,board,finalize,events,keys}.ts` |
| Persistence | schema **v3**, `records/weeklyBoard.ts`, `repositories/weeklyBoards.ts`, `commands/{saveWeeklyBoard,setWeeklyGoalProgress,finalizeWeek,claimWeeklyReward}.ts`, dataset/backup validation |
| Application | `src/application/weekly/*`, `lifecycle/finalizeWeeks.ts` (reconcile hook), `HomeSnapshot.weekly` |
| UI | `src/features/weekly/*`, `src/features/home/WeeklyCard.tsx`, bottom nav, routes `/weekly`, `/weekly/edit`, `/weekly/history` |

Not in this phase (deliberately): achievements (incl. Perfect Weeks), any spectacle/animation, charts, a Backup/Restore UI, a "repeat last week" mechanism.

## Rules implemented

- **One board per local Monday→Sunday week.** `WeekKey` = the Monday's `DateKey`. All week math is whole-day calendar arithmetic on `DateKey`s (`weekKeyOf`, `weekEndOf`, `nextWeekKey`, `previousWeekKey`, `isDateInWeek`, `isWeekKey`, `asWeekKey`), so year ends, leap days and DST cannot change a week. "Current week" = the week of the clock reading's local date.
- **Weighted goals, exactly 10 points.** Each goal: stable `wg_<uuid>` id, title, integer `maxPoints ≥ 1`, integer `target ≥ 1`, optional `unit`, `tracking`, `manualProgress`, optional `notes`. `Σ maxPoints === 10` (`WEEKLY_BOARD_TOTAL_POINTS`). Below 10, above 10, an empty board, a non-integer / non-positive weight, a blank title, a duplicate id and a linked goal without a quest are all rejected by `validateWeeklyBoardDefinition`, which reports every problem together. This one function is used by the form parser, the domain board builders, the persistence commands **and** the stored-record reader, so the rule exists once.
- **Binary scoring (V1).** A goal is achieved when `progress ≥ target` and earns its full `maxPoints`; otherwise 0. Progress above the target earns nothing extra. `score = Σ earned points` (0–10). No fractions.
- **Bonus EXP is a lookup** (`WEEKLY_BONUS_EXP`): 0–5 → 0 · 6 → 100 · 7 → 150 · 8 → 225 · 9 → 325 · 10 → 500. Only the score's own row applies (9/10 is 325, never 100+150+225+325).
- **Real-life reward tiers** 6+/7+/8+/9+/10, user-editable text, only the highest reached tier applies, fixed at finalization (see *Rewards*).
- **Weekly Focus**: optional text, no scoring/EXP effect.
- **No board, no record.** A week without a board is never finalized and leaves no history row, no bonus and no penalty.

## OD-10 — resolved: Manual Numeric Progress and Linked Quest Completion Count only

`WeeklyGoalTracking = { mode: 'manual' } | { mode: 'linked_quest'; templateId }` (a discriminated union, so a later mode is additive).

- **Manual**: the player sets an absolute count (stepper or typed number; may go down to correct, or above the target). A yes/no goal is manual with target 1.
- **Linked**: ONE `QuestTemplate`. Progress is the number of `questCompletions` of that template whose `dateKey` is inside the week's Monday→Sunday range. It is **derived on every read** (`countCompletionsByTemplate`: one `dateKey`-index lookup per day, so no key-range global), is never stored while the board is active, never awards quest EXP again and cannot be duplicated by reloading. An archived quest's history still counts. There is no rules language and no analytics.

## OD-19 — resolved: board lifecycle

| Question | Rule implemented |
|----------|------------------|
| (a) A week with no board | Nothing to finalize, no 0/10 record, no history entry, no bonus, no penalty. |
| (b) Creating for another week | Only the **current** week. Not a finished week (`week_over`), not a future one (`week_not_started`). |
| (c) Editing after progress exists | Allowed any time until finalization (goals, weights, targets, links, focus, reward text), if the board still totals exactly 10. Score and completion are **derived**, so an edit changes them immediately; there is no stored active-board score to recompute. A saved edit writes a new `revision` and keeps `createdAt`, the week and (by goal id) each goal's manual progress. |
| (d) A linked goal added mid-week | Counts completions **from the Monday**, whenever the goal was created or edited. |
| (e) Repeat last week | No. Only the five **reward texts** are pre-filled (editable) from the most recent board; goals are never copied or invented. |
| (f) Claim expiry | Never expires; claimable any time after finalization. |
| Becomes immutable | Only at finalization. |
| Missed boundaries | Reconciliation finalizes every due board (see below). |
| Finalization snapshots progress | Yes: the exact manual value / linked count used for scoring is frozen per goal (`goalResults[].finalProgress`). |

A saved board cannot be deleted in V1 (it can only be edited); a board that was never meant to count simply has to stay valid.

## Data model

Stored in `weeklyBoards` (key `weekKey`) and `weeklyRewardClaims` (key `weekKey`). The domain types are in `domain/weekly/types.ts`; DATA_MODEL §10 is the design they extend.

```ts
WeeklyGoal       { id; title; maxPoints; target; unit|null; tracking; manualProgress; notes|null }
WeeklyGoalBoard  { weekKey; startDate; endDate; focus|null; goals[]; rewardTiers[5];
                   status: 'active'|'finalized'; createdAt; updatedAt; revision; finalization|null }
WeeklyFinalization { finalizedAt; score; bonusExp; xpTransactionId|null; goalResults[]; rewardTier|null }
WeeklyGoalResult { goalId; title; unit; maxPoints; target; trackingMode; templateId|null;
                   finalProgress; completed; earnedPoints }          // the frozen snapshot
WeeklyRewardClaim { weekKey; tierMinScore; rewardTextSnapshot; claimedAt }
```

### Deliberate differences from DATA_MODEL §10 (all approved at kickoff)

1. Linked tracking is `{ mode: 'linked_quest'; templateId }` (**one** quest, as the product rule says), not `linked_quests: templateIds[]`.
2. The five reward texts live **on the board** (`rewardTiers`), not in a settings store (none exists). The tier's text is also snapshotted into `finalization.rewardTier`.
3. `WeeklyGoal.completedAt` and `description` are omitted. Completion is derived while active and frozen in `goalResults` at finalization; `title`, `target`, `unit` and `notes` cover the description.
4. `goalResults` additionally freezes `unit`, `trackingMode`, `templateId` and `completed` so the history is self-contained.
5. The week's finalization commits in its **own** transaction after the Sunday's daily finalization (DATA_MODEL §14 hinted at one unit). Safe because an interrupted catch-up resumes: a due, still-active board is found again (see *Finalization*).

## Schema v3 and backups

- `DATABASE_VERSION` **3** (`migrations/v3.ts`, v1/v2 untouched): `weeklyBoards` (index `status`) and `weeklyRewardClaims` (no index). Both start empty; every existing row of a v2 database survives unchanged (tested row-for-row), and the ledger chain continues (the first bonus gets `seq = tip + 1`).
- Backup `schemaVersion` **3** with `weeklyBoards` and `weeklyRewardClaims` collections. The registered `2 → 3` upgrade adds both as empty arrays, so schema-1 and schema-2 backups still import. Import is still a full replace.
- `validateDataset` (the single gate for import, export and `verifyDatabaseIntegrity`) validates each board on its own (week dates, the exactly-10 rule, status ↔ finalization pairing, and — for a finalized board — that its frozen `goalResults` agree with its goals, the score with the results, the bonus with the table, the tier with the score, and a manual goal's `finalProgress` with its frozen value) and across records: a finalized board that paid a bonus owns exactly one matching ledger row, every weekly ledger row belongs to a finalized board that points back at it, and every claim belongs to a finalized board that earned a tier and agrees with its frozen tier and text. Completions are deliberately **not** re-counted: a finalized board's snapshot is authoritative and later data can never change it.

## Finalization (`finalizeWeekAtomically`)

One read-write transaction over `weeklyBoards`, `xpTransactions`, `questCompletions` (read), `dailySummaries` (read) and `questOccurrences` (read):

1. The stored board is read; a finalized one is returned untouched (`already_finalized`); a week with no board is `board_not_found`.
2. Linked progress is counted from the week's completions and the ledger tip is read **from the transaction itself**.
3. The domain (`finalizeWeeklyBoard`, pure) refuses a week that is not over (`endDate ≥ today`), scores the board once, freezes the exact progress, looks up the bonus and the reward tier, and builds the single bonus row.
4. The daily chain must already be past the Sunday (`days_not_finalized` otherwise).
5. The frozen board and the bonus row are written **together**, or neither is (the row is re-validated by the XP record reader first).

The bonus row: id `xp:weekly_goal_crusher:{weekKey}`, idempotency key `weekly_goal_crusher:{weekKey}`, `source { type: 'weekly_goal_crusher', weekKey, score }`, `category: null`, `seq = tip + 1`, **`createdAt` = the real instant of finalization** (never back-dated), **`effectiveDate` = the Sunday**, **`sourceWeekKey` = the Monday**. A score below 6 finalizes the board but writes no row (`xpTransactionId: null`).

**Exactly once** rests on three independent things: the board's status (read in the same transaction that flips it), the ledger's unique idempotency key, and IndexedDB serializing overlapping read-write transactions. A racing tab or timer resolves to `already_finalized`. Tested: sequential repeats, ten concurrent calls on one connection, concurrent calls from two connections, a forced mid-transaction failure (the board stays active and nothing is paid), and repeated reconcile / startup / resume.

### Interaction with the Phase 06 lifecycle

`reconcileDays` finalizes every missing day up to yesterday exactly as before, then `finalizeDueWeeks` finalizes every **active** board whose Sunday has passed (`listDueWeeklyBoardKeys`: `status = active`, `endDate < today`), **oldest week first**, one transaction per board, so the ledger order is deterministic. Days are finalized before weeks (a week's last day is always closed first); because daily finalization writes no XP the order between them cannot change any amount. Timers remain a convenience: the midnight tick, resume and startup all call the same reconcile. A closed app simply finalizes everything on the next start; a due board that was missed because the app was killed between a Sunday and its week is found again by the next reconcile. If the device clock is behind the recorded history nothing is finalized (Phase 06 safe state). The result carries `finalizedWeeks` (week, score, bonus, tier and the domain events, **informational only**): nothing is replayed or presented, and a multi-week catch-up leaves **one** restrained Home notice, e.g. "5 days reconciled. 1 weekly board finalized (+150 EXP).", shown also for a single overnight week because that bonus is EXP the player did not just earn.

## Immutability of a finalized board — three independent layers

1. **Domain**: `editWeeklyBoard` and `withManualProgress` refuse a non-active board.
2. **Application**: `saveWeeklyBoard` and `setWeeklyGoalProgress` read the stored board and refuse a finalized one **before opening any write transaction** (tested by counting read-write transactions); the editor loader reports `finalized` instead of a form; a stale form for a finished week is addressed at the *current* week and refused as `stale`; the UI offers no edit control for a finished week.
3. **Persistence**: the commands re-read the stored board inside their own read-write transaction and refuse `finalized` (`board_finalized`) whatever revision the caller claims; boards are rebuilt by the domain from the **stored** board (a caller cannot supply a status or a finalization); revision checks reject stale writers; the repository exposes no write path (a public-API test forbids `update/delete/put/clear/reset…` names for weekly data); and the record reader rejects a board whose status and finalization disagree.

History views (`FinalizedWeekView`) are built **only** from `finalization` and the claim: they never read templates, completions or the ledger, so renaming/archiving a quest or later completions cannot change a finished week (tested at persistence and application level, including completions planted directly into storage).

## Rewards

The reward tier is fixed at finalization (highest tier ≤ score, text snapshotted). `claimWeeklyRewardAtomically` (one transaction over the board and the claim store) requires a finalized board, a non-null tier **and non-blank tier text** (nothing to claim otherwise: `reward_text_blank`), inserts one claim keyed by the week, and returns the stored claim on a repeat (`already_claimed`; concurrent tabs record exactly one). A claim writes no EXP, never touches the board or the ledger, and never expires.

## Application layer

`loadWeeklyScreen`, `loadWeeklyEditor`, `loadWeeklyHistory`, `loadWeeklyHomeSummary` are read-only. `saveWeeklyBoard`, `setWeeklyGoalProgress`, `claimWeeklyReward` call `requireSynchronizedDay` first (a stale screen cannot write into a new day; a backward clock pauses them) and return typed results (`status`, never raw storage errors). `setWeeklyGoalProgress` returns `WeeklyGoalCompleted` events (the quest-completion → linked-goal event is intentionally left to Phase 10); finalization returns `WeeklyBoardFinalized`, `XPAwarded`, `LevelUp`, `RankUp` (not persisted, not presented). `HomeSnapshot.weekly` (additive) feeds the Home card and is reloaded with every authoritative reload, so completing a linked quest updates it.

## Screens

Bottom nav: **Home · Quests · Weekly · Status** (each target 90×56 px at 360 px wide).

- `/weekly` — week range; with no board "SET THIS WEEK'S GOAL CRUSHERS" and a button; with a board: Weekly Focus, live `score / 10` (plain progress bar), each goal (manual stepper + typed count, or "Counts completions of {quest} this week" with no control), the reward tiers with the one that applies highlighted, "Edit goals"; below it the **LAST RESULT** card (frozen score, goals, bonus, reward, CLAIM REWARD). While the clock is behind, everything is shown read-only.
- `/weekly/edit` — one create/edit form: focus, goal cards (title, target, unit, points − / +, "I update it" / "Counted from a quest" + quest select, notes, remove), a live "n / 10 points" readout (convenience only; the domain decides on save), five reward fields, one combined error summary. No drag and drop.
- `/weekly/history` — finalized weeks newest first: range, focus, score, goals completed (expandable per-goal results), bonus EXP, reward tier and text, claim state/button.
- Home — one small card: "WEEKLY GOAL CRUSHER 6 / 10 · 3 / 5 goals complete", or a one-line invitation. No editor on Home.

No particles, shaders, BorderTrail, SystemAura or celebration: a plain progress bar is the whole visual. Achievements (incl. Perfect Week) are Phase 08.

## Limitations / notes

- A saved board cannot be deleted; there is no "skip this week" after saving.
- A linked goal's target can be higher than the quest can be completed in the week (e.g. a 3-day quest with target 5); nothing warns about it.
- The `WeeklyGoalCompleted` event is not emitted by the quest-completion command itself. Phase 10 (OD-20, resolved) derives it in the application layer, for presentation only, as the difference between the week's completion counts with and without the completion just made; it changes nothing stored. The weekly spectacle is the finalization moment (see [EFFECTS_EVENT_ENGINE.md](EFFECTS_EVENT_ENGINE.md)).
- Backup/Restore still has no UI (a previously known limitation).
- The weekly rules on completions in the dataset validator are deliberately snapshot-only (see *Schema v3 and backups*).

## Verification

Automated: domain, persistence (schema v3 migration with real v2 data, exactly-once finalization incl. concurrency and rollback, claims, backups 1→3 and 2→3, integrity), application (full lifecycle incl. multi-week closed-app catch-up with a skipped week), and UI tests (editor, Weekly screen, history, Home card, notice, navigation). Manual (built-in browser at 360×440 and 320×440 emulation, with `Date.now` overridden in the page for the rollover; the Windows clock was never changed): no horizontal overflow on any weekly screen, no touch target under 44 px, last control clear of the bottom nav, create → progress → linked completion on Home → rollover finalized 7/10 with +150 EXP → one Home notice → reward claimed once.
