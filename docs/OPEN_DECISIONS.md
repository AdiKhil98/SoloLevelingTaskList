# SoloLevelingTaskList — Open Decisions

**Document status:** Phase 00 deliverable.
**Companions:** [MASTER_SPEC.md](MASTER_SPEC.md) · [DATA_MODEL.md](DATA_MODEL.md) · [PHASE_PLAN.md](PHASE_PLAN.md)

This file lists **only genuinely unresolved** product/design decisions. Approved rules live in `MASTER_SPEC.md`. Nothing here may be silently decided by an implementer: until the owner decides, code must keep the decision behind a single, isolated point (a config value, a pure function, a union member) so the answer can be dropped in without redesign.

For each item: **Question** · **Why it matters** · **Needed by** (the latest phase by which it must be decided; earlier is fine) · **Until then** (what implementers may and may not do).

**Foundational blockers:** none. Every item below can be deferred to its "needed by" phase without blocking Phase 01.

**Stable IDs:** decision IDs are never renumbered. **OD-02, OD-05, OD-10, OD-11, OD-12, OD-13, OD-14, OD-16, OD-17, OD-19, OD-21, and OD-22 are retired** — they were resolved after Phase 00 and now live as approved rules in `MASTER_SPEC.md` (levels after 100 §8.4, normal-quest EXP derived from difficulty only §5.3, zero-eligible days §7.5, completion finality §5.6, same-day quest create/edit/archive/restore semantics §5.7, streak finalization §7.4, no streak freezes §7.4, Perfect Week §11). OD-05 and OD-16 were resolved in Phase 05; the implementation is recorded in [QUEST_MANAGEMENT.md](QUEST_MANAGEMENT.md). OD-21 (multi-day catch-up shows one restrained "N days reconciled." notice, no replayed events) and OD-22 (backward device clock enters a safe paused state, history never rewritten) were resolved in Phase 06; see [DAILY_LIFECYCLE.md](DAILY_LIFECYCLE.md) and MASTER_SPEC §4.4–4.5. OD-10 (Goal Crusher progress modes: manual numeric progress and linked quest completion count only) and OD-19 (weekly board lifecycle: current week only, editable until finalization with derived score, linked goals count from Monday, a week without a board is simply absent, finalization snapshots the exact progress used, claims never expire) were resolved in Phase 07; the rules and their implementation are recorded in [WEEKLY_GOAL_CRUSHER.md](WEEKLY_GOAL_CRUSHER.md) and MASTER_SPEC §12. They are intentionally absent below.

## Index

| ID | Topic | Needed by |
|----|-------|-----------|
| **A. Items required by the Phase 00 brief** | | |
| OD-01 | Final display name of the Level 100+ special rank | Phase 08 |
| OD-03 | Final seeded achievement catalog | Phase 08 |
| OD-04 | Final Daily Message catalog content (mechanism resolved in Phase 04) | Phase 14 |
| OD-06 | Exact sound effects | Phase 10 |
| OD-07 | Exact haptic patterns | Phase 10 |
| OD-08 | Final animation timings / effect-intensity levels | Phase 10 (tuned in 14) |
| OD-09 | Final typography / font | Phase 09 |
| **B. Items discovered while writing the specification** | | |
| OD-15 | Seeded quest catalog beyond prayers and Sleep (the six approved seeds are implemented; editability was settled in Phase 05) | Before any further default is seeded |
| OD-18 | Reliable semantic identification for achievements (e.g., "Gym Sessions") | Phase 08 |
| OD-20 | Which moment is the "Goal Crusher completion" spectacle | Phase 10 |

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

### OD-04 — Final Daily Message catalog content
- **Resolved in Phase 04 (the mechanism):** the Daily Message comes from a **local catalog of original, unattributed lines** (no external quote API, no network, no quotations). The message for a day is chosen by a **pure, deterministic function of the `DateKey`** (`daysBetween(anchor, dateKey)` modulo the catalog size, so the catalog is walked one entry per day without a repeat until exhausted); no random source and **no persistence** are required. Same date, same message, on every reload. The starter catalog has 40 lines. See [CORE_UI.md](CORE_UI.md).
- **Still open (the content):** the final catalog — how many messages, the exact wording and polish, and whether any properly attributed / public-domain quotations are ever included. Whether a per-date assignment is ever persisted (DATA_MODEL §13) is also left open; it is not needed for correctness, and editing the catalog may change which message a past date maps to (a Daily Message has no historical role).
- **Needed by:** Phase 14 (final catalog and polish).
- **Until then:** Only original/system-style text in the local catalog. No external quote API. No unverified internet-attributed quotations.

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

---

## B. Items discovered while writing the specification

These are gaps or tensions found while turning the brief into a contract. None were guessed.

### OD-15 — Seeded quest catalog beyond prayers and Sleep
- **Phase 04 status:** Phase 04 seeds **only the already-approved six** — the five prayers and Sleep before 00:00 (MASTER_SPEC §5.5), idempotently, keyed by `seedKey`. See [CORE_UI.md](CORE_UI.md). This does **not** resolve the decision below; it only implements what was already approved.
- **Resolved in Phase 05 (editability):** the six seeded quests, including Sleep, are ordinary manageable templates. They may be edited, archived and restored through quest management; their template id, `seedKey` and `role` are preserved and not editable, and an archived seed is never re-seeded. See [QUEST_MANAGEMENT.md](QUEST_MANAGEMENT.md). (If every quest is archived, a "No Active Quests" day is reachable — already handled neutrally per MASTER_SPEC §7.5.)
- **Question (still open):** Are Hydration, Gym, or any others seeded by default? Only the five prayers and Sleep have approved parameters; hydration and gym appeared only as examples.
- **Why it matters:** First-run experience.
- **Needed by:** before any further default is seeded.
- **Until then:** Seed exactly the five prayers + Sleep. Other quests are user-created through quest management.

### OD-18 — Reliable semantic identification for achievements (e.g., "Gym Sessions")
- **Question:** "25 Gym Sessions" needs a reliable way to recognize a "Gym" quest. Candidates: a stable semantic quest tag / activity identifier, a specific template ID, or a seed key. **A Fitness-category quest is not assumed to be a Gym session.** This stays open unless the future achievement design introduces a stable semantic quest tag/activity identifier.
- **Why it matters:** Shapes whether Phase 05's quest model needs a tag/activity field, and which achievements are feasible.
- **Needed by:** Phase 08 (a tag/activity field, if wanted, must be decided before Phase 05 ships the quest form — otherwise added later as an additive extension).
- **Until then:** Achievements may use only quest-agnostic conditions (totals, streaks, ranks, Perfect Days, Perfect Weeks). Do not infer "Gym" from category.

### OD-20 — Spectacle / event presentation timing: which moment is the "Goal Crusher completion"?
- **Question:** `CLAUDE.md` and the spec list "Goal Crusher completion" as a heavy-effect event. Is it an individual weekly goal being satisfied, the board reaching 10/10, or the finalization/bonus moment?
- **Why it matters:** Determines which domain events carry heavy presentation and whether a live 10/10 moment is celebrated before the bonus is actually awarded at finalization.
- **Needed by:** Phase 10 (events exist from Phase 07).
- **Until then:** Domain emits `WeeklyGoalCompleted` (Phase 07: from a manual progress update only; a linked goal reaching its target through a quest completion is not wired to an event yet, Phase 10 decides) and `WeeklyBoardFinalized` (at finalization); presentation mapping is deferred.
