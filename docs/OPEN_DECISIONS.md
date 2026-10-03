# SoloLevelingTaskList — Open Decisions

**Document status:** Phase 00 deliverable.
**Companions:** [MASTER_SPEC.md](MASTER_SPEC.md) · [DATA_MODEL.md](DATA_MODEL.md) · [PHASE_PLAN.md](PHASE_PLAN.md)

This file lists **only genuinely unresolved** product/design decisions. Approved rules live in `MASTER_SPEC.md`. Nothing here may be silently decided by an implementer: until the owner decides, code must keep the decision behind a single, isolated point (a config value, a pure function, a union member) so the answer can be dropped in without redesign.

For each item: **Question** · **Why it matters** · **Needed by** (the latest phase by which it must be decided; earlier is fine) · **Until then** (what implementers may and may not do).

**Foundational blockers:** none. Every item below can be deferred to its "needed by" phase without blocking Phase 01.

**Stable IDs:** decision IDs are never renumbered. **OD-02, OD-11, OD-12, OD-13, OD-14, and OD-17 are retired** — they were resolved after Phase 00 and now live as approved rules in `MASTER_SPEC.md` (levels after 100 §8.4, zero-eligible days §7.5, completion finality §5.6, streak finalization §7.4, no streak freezes §7.4, Perfect Week §11). They are intentionally absent below.

## Index

| ID | Topic | Needed by |
|----|-------|-----------|
| **A. Items required by the Phase 00 brief** | | |
| OD-01 | Final display name of the Level 100+ special rank | Phase 08 |
| OD-03 | Final seeded achievement catalog | Phase 08 |
| OD-04 | Final Daily Message catalog and selection algorithm | Phase 04 (starter) / Phase 14 (final) |
| OD-05 | Will quest EXP overrides ever exist? | Phase 05 |
| OD-06 | Exact sound effects | Phase 10 |
| OD-07 | Exact haptic patterns | Phase 10 |
| OD-08 | Final animation timings / effect-intensity levels | Phase 10 (tuned in 14) |
| OD-09 | Final typography / font | Phase 09 |
| OD-10 | Additional Goal Crusher progress-tracking modes | Phase 07 |
| **B. Items discovered while writing the specification** | | |
| OD-15 | Seeded quest catalog beyond prayers and Sleep | Phase 04 |
| OD-16 | Same-day template create/edit/delete semantics | Phase 05 |
| OD-18 | Reliable semantic identification for achievements (e.g., "Gym Sessions") | Phase 08 |
| OD-19 | Weekly board lifecycle and linked-progress rules | Phase 07 |
| OD-20 | Which moment is the "Goal Crusher completion" spectacle | Phase 10 |
| OD-21 | Surfacing events produced during multi-day catch-up | Phase 06 |
| OD-22 | Device clock / timezone moving backwards | Phase 06 |

---

## A. Items required by the Phase 00 brief

### OD-01 — Final display name of the Level 100+ special rank
- **Question:** What is the display name of the special rank tier that applies from Level 100 upward? (Spec uses the placeholder `???`.) Only the *name* is open: the tier itself (identifier `special_100_plus`, covering every level ≥ 100, no level cap) is approved in MASTER_SPEC §8.4 and §9.
- **Why it matters:** Rank presentation (Status screen, HolographicCard, RankUpOverlay) and the "Reach … Rank" achievement.
- **Needed by:** Phase 08.
- **Until then:** Use the neutral placeholder `???`; do **not** invent a name in code, copy, or assets. The rank identifier in code is the opaque value `special_100_plus`, whose display label comes from one place.

### OD-03 — Final seeded achievement catalog
- **Question:** Which achievements ship, with what exact conditions, titles, descriptions, and rarity tiers?
- **Why it matters:** Content/scope of Phase 08; the data-driven engine only needs a vocabulary, not the full list.
- **Needed by:** Phase 08.
- **Until then:** The MASTER_SPEC list is illustrative only. Build the engine for extensibility; do not generate dozens of achievements. All achievements award 0 EXP (approved).

### OD-04 — Final Daily Message catalog and selection algorithm
- **Question:** How many messages, which exact texts/attributions, and how is a day's message selected (hash of date? shuffled cycle without repeats until exhausted?)
- **Why it matters:** Home screen content; selection must be deterministic and stable across reloads (approved), but the algorithm and bank are content decisions.
- **Needed by:** A small starter bank by Phase 04 (Home screen); final catalog by Phase 14.
- **Until then:** Use only original/system-style placeholder text for development. No external quote API. No unverified internet-attributed quotations.

### OD-05 — Quest EXP overrides
- **Question:** Will users ever be allowed to override a quest's EXP away from its difficulty-derived value?
- **Why it matters:** Unrestricted EXP input would let trivial quests grant extreme rewards and undermine progression integrity.
- **Needed by:** Phase 05 (quest creation form).
- **Until then:** No override field. EXP derives only from difficulty.

### OD-06 — Exact sound effects
- **Question:** Which sounds (if any) accompany quest completion, level-up, rank-up, Perfect Day, Goal Crusher, awakening? Source/licensing of audio files?
- **Why it matters:** Asset sourcing, licensing, bundle size, offline caching.
- **Needed by:** Phase 10 (sound hooks).
- **Until then:** Settings contain a sound on/off toggle and hook points; no audio assets are chosen.

### OD-07 — Exact haptic patterns
- **Question:** Which vibration patterns map to which events, within the limits of the Android Vibration API?
- **Needed by:** Phase 10.
- **Until then:** Haptics are a boolean setting plus hook points; no patterns chosen.

### OD-08 — Final animation timings and effect-intensity levels
- **Question:** Exact durations/easings per event, and the final names/behavior of the effect-intensity setting (spec provisionally uses `low | medium | high`).
- **Why it matters:** Feel, battery, and the earned-event principle.
- **Needed by:** Phase 10 (initial), tuned in Phase 14.
- **Until then:** Reference-pack timings are starting points only; do not treat them as approved.

### OD-09 — Final typography / font
- **Question:** Which typeface(s) for the SYSTEM look (display vs. body vs. numerals), and is a webfont bundled for offline use?
- **Why it matters:** Visual identity, readability, offline asset size.
- **Needed by:** Phase 09.
- **Until then:** Use system fonts / a neutral stack; no font dependency installed.

### OD-10 — Additional Goal Crusher tracking modes
- **Question:** Beyond **manual** and **linked quest completions**, are other modes needed (e.g., a numeric sum like "40 backtests", time totals, streak-within-week)?
- **Why it matters:** Shape of `WeeklyGoal.tracking` and scope of Phase 07; risk of over-engineering analytics.
- **Needed by:** Phase 07.
- **Until then:** Support only `manual` and `linked_quests`; keep `tracking` a discriminated union so a mode can be added later without a breaking change.

---

## B. Items discovered while writing the specification

These are gaps or tensions found while turning the brief into a contract. None were guessed.

### OD-15 — Seeded quest catalog beyond prayers and Sleep
- **Question:** Are Hydration, Gym, or any others seeded by default? Only the five prayers and Sleep have approved parameters; hydration and gym appeared only as examples. Also: may seeded quests (including Sleep) be edited, deactivated, or deleted by the user?
- **Why it matters:** First-run experience and the Sleep role. (If seeded quests can all be deactivated, a "No Active Quests" day becomes reachable — already handled neutrally per MASTER_SPEC §7.5.)
- **Needed by:** Phase 04 (seed data used by the first functional task list).
- **Until then:** Seed exactly the five prayers + Sleep. Others are user-created in Phase 05.

### OD-16 — Same-day template create / edit / delete semantics
- **Question:** When a template is created, edited, or deleted *today*, what happens to today's occurrence and today's denominator? The proposed default (DATA_MODEL §9) is: edits/deletions take effect from the next local date; a new quest enters today only per a rule to be chosen.
- **Why it matters:** Integrity of "Perfect Day" (deleting an unfinished quest mid-day could inflate completion %) versus convenience (fixing a mistaken quest).
- **Needed by:** Phase 05.
- **Until then:** Past records are immutable (approved). Do not choose same-day behavior implicitly; Phase 05 proposes options first.

### OD-18 — Reliable semantic identification for achievements (e.g., "Gym Sessions")
- **Question:** "25 Gym Sessions" needs a reliable way to recognize a "Gym" quest. Candidates: a stable semantic quest tag / activity identifier, a specific template ID, or a seed key. **A Fitness-category quest is not assumed to be a Gym session.** This stays open unless the future achievement design introduces a stable semantic quest tag/activity identifier.
- **Why it matters:** Shapes whether Phase 05's quest model needs a tag/activity field, and which achievements are feasible.
- **Needed by:** Phase 08 (a tag/activity field, if wanted, must be decided before Phase 05 ships the quest form — otherwise added later as an additive extension).
- **Until then:** Achievements may use only quest-agnostic conditions (totals, streaks, ranks, Perfect Days, Perfect Weeks). Do not infer "Gym" from category.

### OD-19 — Weekly board lifecycle and linked-progress rules
- **Question:** (a) What if a week has no board — nothing to finalize, or finalize an empty/0 board? (b) Can a board be created for a future week (planning ahead) or only the current one? (c) Can weights/targets be edited after progress exists mid-week? (d) For linked goals created mid-week, do completions earlier in that week count? (e) Is there a template/"repeat last week" mechanism? (f) Does a finalized week's reward claim ever expire?
- **Already resolved (not open):** a reward is claimable only *after* the board is finalized (MASTER_SPEC §12.6); a Perfect Week is a finalized 10/10 board (§11).
- **Why it matters:** Exactly-once bonus logic, historical honesty, and Phase 07 scope.
- **Needed by:** Phase 07.
- **Until then:** Only approved rules apply: boards total exactly 10 points; finalization once; bonus once; reward claimed only after finalization.

### OD-20 — Spectacle / event presentation timing: which moment is the "Goal Crusher completion"?
- **Question:** `CLAUDE.md` and the spec list "Goal Crusher completion" as a heavy-effect event. Is it an individual weekly goal being satisfied, the board reaching 10/10, or the finalization/bonus moment?
- **Why it matters:** Determines which domain events carry heavy presentation and whether a live 10/10 moment is celebrated before the bonus is actually awarded at finalization.
- **Needed by:** Phase 10 (events exist from Phase 07).
- **Until then:** Domain emits `WeeklyGoalCompleted` and `WeeklyBoardFinalized`; presentation mapping is deferred.

### OD-21 — Surfacing events produced during multi-day catch-up
- **Question:** If reopening after days away finalizes several days/a week and awards a weekly bonus (possibly causing a level-up or rank-up), how are those celebrations shown? Persist unacknowledged events, summarize them in one "While you were away" report, or show nothing?
- **Why it matters:** A bonus-driven Level/Rank-Up must not be lost or duplicated, and event delivery must never affect progression correctness.
- **Needed by:** Phase 06.
- **Until then:** Progression is applied atomically regardless; events are returned from reconcile but their persistence/presentation policy is undecided.

### OD-22 — Device clock / timezone moving backwards
- **Question:** If the device date becomes earlier than the last finalized date (travel west across the date line, manual clock change), what should the app do? Finalized days are never reopened (approved).
- **Needed by:** Phase 06.
- **Until then:** Reconcile must never un-finalize or re-finalize a date; it must not crash. Specific user-visible behavior is undecided.
