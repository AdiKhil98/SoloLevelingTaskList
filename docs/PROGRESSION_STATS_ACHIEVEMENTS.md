# Progression, Stats and Achievements (Phase 08)

**Status:** implemented in Phase 08. **Schema:** unchanged (IndexedDB v3, backup schema 3). **Resolves:** OD-01 and OD-03. **Defers:** OD-18.
**Companions:** [MASTER_SPEC.md](MASTER_SPEC.md) §8–§11 · [DATA_MODEL.md](DATA_MODEL.md) §6, §7, §12 · [DAILY_LIFECYCLE.md](DAILY_LIFECYCLE.md) · [WEEKLY_GOAL_CRUSHER.md](WEEKLY_GOAL_CRUSHER.md)

Phase 08 turns the accumulated history into what the player sees: level and rank, lifetime EXP, quest and category totals, day and week statistics, streaks, and achievements. **Nothing in it is stored.** Every figure is recomputed from the immutable record each time a screen opens.

---

## 1. Derived, not persisted (a deliberate departure from the old data model)

> **Derived achievements intentionally replace the persisted `achievementUnlocks` design.**
> DATA_MODEL §12 (written in Phase 00) described an `AchievementUnlock` row per achievement in an `achievementUnlocks` store, written in the same transaction as the event that earned it, with one row per achievement guaranteed by the primary key (INV-4). **That design is not built and is superseded.** There is no `achievementUnlocks` store, no unlock row, no migration, and no unlock write inside `completeQuestAtomically`, `finalizeDayAtomically` or `finalizeWeekAtomically`.

An achievement is **unlocked exactly when the player's history says it qualified**. Its unlock moment is the **exact historical record that first satisfied the condition**: the ledger row of the 50th completion, the Daily Summary of the first Perfect Day, the finalized board of the first 8+/10 week, the ledger row whose lifetime EXP first reached a level.

Why this is the right size:

- **Every condition is monotone over immutable history.** Quest completions, finalized days, finalized boards and the XP ledger are append-only and immutable, so "has ever qualified" equals "qualifies now", and the moment of first qualification can never move. A stored copy would only duplicate what the records already prove.
- **At most one unlock per achievement (NR-3) holds by construction**: one definition id maps to one derived status. There is nothing to race, retry or double-write.
- **Zero blast radius.** The three atomic commands that guard the player's progression are untouched. No schema bump, no backup-format change, no upgrade/backfill step: an existing history, a restored backup or a second device's import unlocks the same trophies automatically.
- **Nothing to drift.** A stored unlock could disagree with history; a derived one cannot.

Consequences to remember:

- Achievements are only as permanent as the history they come from. That is safe while the ledger, Daily Summaries and finalized boards stay immutable (they are). A future feature that deletes or rewrites finalized history would have to revisit this.
- There is no durable "seen / unseen" flag. Phase 10 (celebrations) can learn what an action just unlocked by comparing the evaluation before and after it, and may add its own small acknowledgement store then if it needs one across sessions.
- Achievements award **0 EXP** (NR-10). The model has no reward field, evaluation writes nothing, and no `XPSource` of an achievement exists. A test asserts that loading profile data opens no read-write transaction and leaves the ledger identical.

DATA_MODEL §12 and the related lines carry a note pointing here. The conceptual **`AchievementDefinition`** (static data, declarative condition, generic engine) is kept as designed.

---

## 2. Architecture

| Layer | Files | Role |
|---|---|---|
| Domain (pure) | `src/domain/stats/` · `src/domain/achievements/` | Statistics and the achievement engine. No React, storage or clock. |
| Application | `src/application/player/` · `src/application/loadResult.ts` | Read the history, call the domain, return display-ready data. Read-only. |
| Runtime | `src/app/runtimeContext.ts` · `AppRuntimeProvider.tsx` | A `profile` accessor (`loadProfile`, `loadAchievements`, `loadDailyHistory`). |
| UI | `src/features/status/` · `src/features/achievements/` | Status, Achievements and Daily History screens. Presentation only. |

**Domain**

- `stats/history.ts`: `ProgressionHistory { ledger, dailySummaries, weeklyBoards }` and `normalizeHistory`. **The history is normalized internally**: the ledger is ordered by `seq`, days by `dateKey`, boards by `weekKey`, and active boards are dropped. Every statistic and the achievement engine read the normalized copy, so **the order of the arrays a caller passes (and the arrays themselves) can never affect or change a result**. Inputs are never mutated (tests pass frozen arrays).
- `stats/ledgerStats.ts` (`summarizeLedger`): lifetime EXP, quest EXP, weekly bonus EXP, completions, the five category totals, and per-template tallies.
- `stats/dailyStats.ts` (`summarizeDailyHistory`, `dayMeetsMilestone`): finalized-day counts and the completion rate, with the streaks read from the newest summary.
- `stats/weeklyStats.ts` (`summarizeWeeklyHistory`): finalized-board statistics from the frozen snapshots.
- `achievements/`: `types.ts` (definition, condition union, status, unlock, evidence), `catalog.ts` (the V1 catalog), `evaluate.ts` (`evaluateAchievements`, `summarizeAchievements`).

**Application**

- `loadPlayerProfile` composes everything the Status screen shows beyond today's snapshot. `loadAchievements` evaluates the whole catalog. `loadDailyHistory` lists finalized days, newest first.
- All three return `LoadResult<T>` (`ok` with a value, or `failed` with a player-safe `FailureReason`); none throws and none writes.
- The three reads (ledger, summaries, boards) are independent append-only histories; screens reload them whenever the runtime snapshot changes (after a completion or a day change).

---

## 3. Statistics

| Statistic | Source | Definition |
|---|---|---|
| Level, rank, lifetime EXP, EXP into level | XP ledger | Unchanged: the ledger tip's running total through the Phase 02 engine (`loadPlayerStatus`). The profile's own ledger sum must equal it (tested). |
| Total completions | XP ledger | Quest-completion rows. |
| Quest EXP | XP ledger | Σ quest rows (no weekly bonus). |
| Category EXP and completions | XP ledger | Per category, from quest rows only. **Weekly bonus rows have no category and never enter a category** (INV-9: Σ categories + weekly bonus = lifetime EXP). Always the five categories, in fixed order, zeros included. No category levels. |
| Top 3 quests | XP ledger (+ template for the label) | By completions; ties go to the quest completed first (earlier first ledger `seq`), then by id: deterministic. |
| Active quests | `questTemplates` | Templates with `status: 'active'`. |
| Finalized days | Daily Summaries | Days with a summary. The day in progress is not one. |
| Completed / Strong / Perfect days | Daily Summaries | **Cumulative**: Completed = ≥ 70 % or better (includes Strong and Perfect); Strong = ≥ 85 % or better (includes Perfect); Perfect = 100 %. |
| Incomplete days | Daily Summaries | Quality `incomplete`. |
| No Active Quests days | Daily Summaries | Neutral: counted as finalized days, shown separately, never in the rate, a streak or a milestone. |
| Completion rate | Daily Summaries | Σ completed ÷ Σ eligible over **active** finalized days (count-based, never XP-weighted); the displayed whole percent is **floored**; `—` before any active day. |
| Current / best / Perfect-Day streak, Total Perfect Days | Daily Summaries | The newest summary's `*After` values (the persisted chain); equal to `foldStreaks` over the whole chain (tested). Unchanged from Phase 06. |
| Weeks completed | Finalized boards | **Finalized boards** (a week without a board leaves no record and is not counted). |
| Perfect Weeks | Finalized boards | `finalization.score === 10`. |
| Best / average score | Finalized boards | From the frozen `finalization.score`; the average is exact and displayed to one decimal. A week that scored 0 counts. |
| Weekly bonus EXP | Finalized boards | Σ `finalization.bonusExp`; equal to the ledger's weekly rows (tested). |
| Rewards claimed | `weeklyRewardClaims` | Row count. Awards no EXP. |

**Historical quest statistics never depend on the template.** Counts come from immutable ledger rows (the template id and category as they were when the quest was completed), so editing a template into another category or difficulty, archiving it, or losing it cannot change a figure. Only the *label* of a top quest is live, and it never disappears:

1. the template's current title (marked "archived" when it is);
2. else the title stored in the snapshot of the quest's **latest completion** (`questOccurrences`), marked "removed";
3. else a fallback label (`Unknown quest`, `UNKNOWN_QUEST_LABEL` in `displayLabels.ts`), marked "removed", with the count intact.

---

## 4. Achievements

### 4.1 V1 catalog (OD-03, resolved): 28 achievements, 0 EXP each

All are quest-agnostic. **Days and weeks count only once they are finalized** (MASTER_SPEC §11): a Perfect Day achievement unlocks from a finalized `DailySummary`, never from live completions, so a first Perfect Day unlocks when the day ends, not the moment it reaches 100 %. (The live moment remains available to Phase 10 through the existing `PerfectDayReached` event.)

| Group | id | Title | Condition |
|---|---|---|---|
| General | `first_quest` | First Quest | 1 quest completion |
| General | `quests_10` · `_50` · `_100` · `_250` · `_500` | 10 / 50 / 100 / 250 / 500 Quests | that many quest completions |
| Daily | `first_completed_day` | First Completed Day | a finalized day at ≥ 70 % |
| Daily | `first_strong_day` | First Strong Day | a finalized day at ≥ 85 % |
| Daily | `first_perfect_day` | First Perfect Day | a finalized day at 100 % |
| Daily | `perfect_days_5` · `_10` · `_25` | 5 / 10 / 25 Perfect Days | that many Perfect days |
| Streak | `streak_3` · `_7` · `_14` · `_30` | 3 / 7 / 14 / 30 Day Streak | a Daily Streak of that many days (the finalized chain) |
| Weekly | `first_goal_crusher_week` | First Goal Crusher Week | any finalized board, whatever its score |
| Weekly | `first_week_6_plus` · `first_week_8_plus` | First 6+/10 · 8+/10 Week | a finalized board scoring at least 6 / 8 |
| Weekly | `first_perfect_week` · `perfect_weeks_3` · `_5` | First / 3 / 5 Perfect Weeks | that many boards scoring exactly 10 |
| Rank | `rank_d` · `_c` · `_b` · `_a` · `_s` | Reach D / C / B / A / S Rank | the level where that rank begins (10 / 20 / 35 / 50 / 75), read from `RANK_BANDS` |
| Rank | `level_100` | Level 100 | Level 100 |

Total EXP needed: D 2,815 · C 12,937 · B 45,392 · A 101,454 · S 253,446 · Level 100 485,351. There is no achievement named after the Level 100+ rank (OD-01).

Definitions are data (`catalog.ts`); the condition vocabulary is small and declarative:
`quest_completions` · `finalized_days {milestone, count}` · `daily_streak` · `finalized_weeks {minScore, count}` · `rank_reached` · `level_reached`. Adding an achievement is adding data, not branching code.

### 4.2 Unlock evidence and dating

`evaluateAchievements` returns, per definition, an `AchievementStatus { definition, unlock, progress }`. A non-null `unlock` carries:

- `evidence`: the exact record: `{ type: 'xp_transaction', transactionId, seq }`, `{ type: 'daily_summary', dateKey }` or `{ type: 'weekly_board', weekKey }`;
- `unlockedAt`: the real write instant of that record (the ledger row's `createdAt`, the summary's `finalizedAt`, the board's `finalization.finalizedAt`);
- `unlockedOn`: that record's **history date**: the completion's date for quest EXP, the finalized day, or the **Sunday of the finalized week** (a level crossed by a weekly bonus is therefore dated to that week's Sunday, while `unlockedAt` keeps the real finalization instant).

The Nth matching record is both the proof and the moment. A streak unlocks on the first day whose `currentStreakAfter` reached the target (its progress follows the **best** streak, so it never goes backwards). A level or rank unlocks on the first ledger row (in `seq` order) whose cumulative EXP reached `totalExpToReachLevel(level)`; one large award can cross several ranks at once, and each unlocks on that same record.

**Progress** is `{ current, target }`, `current` capped at `target`: completions, qualifying days, best streak, qualifying weeks, or the player's level toward the target level. The Achievements screen shows a bar only for locked achievements with a target above 1.

### 4.3 Determinism and idempotency

Pure and total: the same history always gives the same result, whatever order the arrays arrive in, however many times it runs, and however much history is added later. Adding history never moves or revokes an earlier unlock (tested). There is no "upgrade/startup unlock" step, because nothing is stored: a player with existing history simply has the trophies it earned.

---

## 5. OD-01 resolved: Level 100+ display

- Level keeps rising normally past 100 (`LV. 137`); there is no cap.
- The rank at Level 100 and above displays **`???`**.
- Internally the opaque id **`special_100_plus`** is kept, and Level 100 remains the final rank transition (100 → 101 crosses nothing).
- The label lives in exactly one place, `RANK_LABELS` in `src/features/displayLabels.ts`; the UI never prints the id. No canonical rank name is invented. If a name is ever chosen it is a one-line label change with no data, domain or migration impact.
- The "Level 100" achievement is a plain level milestone and never names the rank.
- Verified in unit/component tests (levels 99, 100, 101, 137, 250) and in a browser at 320 px (Level 111 → `???`, the EXP bar still draws).

## 6. OD-18: Gym identification is **deferred beyond V1**

**Not retired.** A Fitness-category quest is never assumed to be a Gym session, and nothing matches on a title. V1 achievements are quest-agnostic, so no Gym-specific achievement ships.

If it is wanted later, a template tag alone is not enough (templates are mutable, so retagging would silently rewrite history). The sound design is an optional semantic `activity` key on `QuestTemplate`, **snapshotted** onto the occurrence and the completion (and the ledger source) when they are created, so history keeps the key it had, plus: a schema migration, a backup-schema bump with an upgrade, parser updates and a quest-form control, all additive. Until then OD-18 stays open in [OPEN_DECISIONS.md](OPEN_DECISIONS.md).

---

## 7. Screens

Navigation stays at four items (Home · Quests · Weekly · Status); the new screens are reached from Status, and the Status tab stays highlighted on `/achievements`.

- **`/status` Status** — the existing player, level-bar and streak sections come straight from the runtime snapshot and appear at once. New sections load from stored history when the screen opens and whenever the snapshot changes (a reload keeps the previous values on screen): **DAYS** (counts and rate, with a link to Daily History), **QUESTS** (completed quests, quest EXP, active quests, the five categories, the top 3), **WEEKLY GOAL CRUSHER** (weeks completed, Perfect Weeks, best and average score, bonus EXP, rewards claimed; link to Weekly History), **ACHIEVEMENTS** (unlocked / total, the 3 most recent, link to all). A failed load shows an alert with Retry and leaves the snapshot sections in place.
- **`/achievements`** — all 28, grouped General · Daily · Streak · Weekly · Rank, in catalog order. Locked items say "Locked" with progress where meaningful; unlocked ones show "Unlocked <date>" (the evidence's `unlockedOn`). Long text wraps (`break-words`, `min-w-0`). No particles, glows or unlock overlays (Phase 10).
- **`/status/history`** — Daily History: every finalized day, newest first (date, quality, completed/eligible and percent, quest EXP, streak after); No Active Quests days are shown plainly as neutral. 30 days at a time with "Show more". A plain list, no charts. The day in progress is not listed.

An EXP ledger view is **not** built (PHASE_PLAN listed it as an optional Phase 08 output; the brief deferred it).

---

## 8. Tests and verification

New suites: domain statistics and history normalization (`stats/stats.test.ts`), the catalog and engine (`achievements/achievements.test.ts`: every threshold at N−1 and N, evidence and dating, finalized-only, streak behavior, weekly boundaries, rank crossings, order independence, no mutation, permanence under added history, custom definitions, `summarizeAchievements`), the application integration test against a real database (`player/profile.test.ts`: a played week through the use cases, category reconciliation with the ledger, archived/edited/missing templates, read-only loading, idempotency across reconnect, a restored backup unlocking the same trophies, neutral days, failure handling), and the UI (`StatusProfile`, `AchievementsPage`, `DailyHistoryPage`, including the `???` display and wrapping). The obsolete Phase 04 assertion that Status shows no achievements or completed-quest totals was removed.

Manual check at 360×800 and 320×568 (dev server, 62 seeded days, 8 finalized weeks): no horizontal overflow on Status, Achievements or Daily History; the last card clears the bottom navigation by 23 px; all links and buttons are at least 44 px high; an unbroken 100-character achievement title and a 110-character quest name wrap without overflow; `???` shows at Level 111; the console is clean.

## 9. Limitations

- Each screen load reads the whole ledger, the summaries and the boards (parse-validated). For a single player this is thousands of small rows and fine; Home's refresh path does not run it. If a history ever grows large enough to matter, the right fix is a rebuildable cache, not an authoritative counter.
- Achievements and statistics are not delivered as events or notifications; Phase 10 decides presentation.
- A first Perfect Day (and every day or week achievement) appears after the day or week is finalized.
- A level crossed by a weekly bonus is dated to that week's Sunday (`unlockedOn`), with the real instant in `unlockedAt`.
- No ledger view, charts or per-quest drill-down; Top 3 ties are broken by first completion, which for the six daily defaults is their seed order.
- OD-18 (Gym and any other semantic quest identity) is deferred.
