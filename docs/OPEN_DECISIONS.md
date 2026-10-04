# SoloLevelingTaskList — Open Decisions

**Document status:** Phase 00 deliverable.
**Companions:** [MASTER_SPEC.md](MASTER_SPEC.md) · [DATA_MODEL.md](DATA_MODEL.md) · [PHASE_PLAN.md](PHASE_PLAN.md)

This file lists **only genuinely unresolved** product/design decisions. Approved rules live in `MASTER_SPEC.md`. Nothing here may be silently decided by an implementer: until the owner decides, code must keep the decision behind a single, isolated point (a config value, a pure function, a union member) so the answer can be dropped in without redesign.

For each item: **Question** · **Why it matters** · **Needed by** (the latest phase by which it must be decided; earlier is fine) · **Until then** (what implementers may and may not do).

**Foundational blockers:** none. Every item below can be deferred to its "needed by" phase without blocking Phase 01.

**Stable IDs:** decision IDs are never renumbered. **OD-01, OD-02, OD-03, OD-05, OD-06, OD-07, OD-08, OD-09, OD-10, OD-11, OD-12, OD-13, OD-14, OD-16, OD-17, OD-19, OD-20, OD-21, and OD-22 are retired** — they were resolved after Phase 00 and now live as approved rules in `MASTER_SPEC.md` or as implemented decisions in the phase documents (levels after 100 §8.4, normal-quest EXP derived from difficulty only §5.3, zero-eligible days §7.5, completion finality §5.6, same-day quest create/edit/archive/restore semantics §5.7, streak finalization §7.4, no streak freezes §7.4, Perfect Week §11). OD-05 and OD-16 were resolved in Phase 05; the implementation is recorded in [QUEST_MANAGEMENT.md](QUEST_MANAGEMENT.md). OD-21 (multi-day catch-up shows one restrained "N days reconciled." notice, no replayed events) and OD-22 (backward device clock enters a safe paused state, history never rewritten) were resolved in Phase 06; see [DAILY_LIFECYCLE.md](DAILY_LIFECYCLE.md) and MASTER_SPEC §4.4–4.5. OD-10 (Goal Crusher progress modes: manual numeric progress and linked quest completion count only) and OD-19 (weekly board lifecycle: current week only, editable until finalization with derived score, linked goals count from Monday, a week without a board is simply absent, finalization snapshots the exact progress used, claims never expire) were resolved in Phase 07; the rules and their implementation are recorded in [WEEKLY_GOAL_CRUSHER.md](WEEKLY_GOAL_CRUSHER.md) and MASTER_SPEC §12. They are intentionally absent below. OD-01 (the Level 100+ rank displays `???`; Level keeps rising; internal id `special_100_plus`; the label lives in one place) and OD-03 (the 28-achievement V1 catalog, derived from history with no stored unlock state) were resolved in Phase 08; the rules and their implementation are recorded in [PROGRESSION_STATS_ACHIEVEMENTS.md](PROGRESSION_STATS_ACHIEVEMENTS.md) and MASTER_SPEC §9 and §11. OD-09 (typography) was resolved in Phase 09: SYSTEM/display typography uses the locally bundled Oxanium variable font; body text and user-entered content use the platform/system font stack; Oxanium is a same-origin, offline-safe asset and no remote font dependency exists; the implementation is recorded in [VISUAL_SYSTEM_AND_ORDERING.md](VISUAL_SYSTEM_AND_ORDERING.md). It is intentionally absent below. OD-06 (sound), OD-07 (haptics), OD-08 (animation intensity and timings) and OD-20 (which moment is the Goal Crusher spectacle) were resolved in Phase 10: sound is original, synthesized at runtime with Web Audio (no audio file is bundled, downloaded or licensed) and **off by default**; haptics are Vibration-API patterns, **on by default**, best effort; effects are **NORMAL or REDUCED** (a device reduced-motion setting always forces REDUCED) with the V1 timings as data to be polished in Phase 14; and the Goal Crusher spectacle is the **finalization** moment, tiered by score, with live goal and 10/10 moments kept deliberately small because they are still reversible. The rules and their implementation are recorded in [EFFECTS_EVENT_ENGINE.md](EFFECTS_EVENT_ENGINE.md). They are intentionally absent below. **OD-18 is deferred beyond V1 but is not retired** (see below).

## Index

| ID | Topic | Needed by |
|----|-------|-----------|
| **A. Items required by the Phase 00 brief** | | |
| OD-04 | Final Daily Message catalog content (mechanism resolved in Phase 04) | Phase 14 |
| **B. Items discovered while writing the specification** | | |
| OD-15 | Seeded quest catalog beyond prayers and Sleep (the six approved seeds are implemented; editability was settled in Phase 05) | Before any further default is seeded |
| OD-18 | Reliable semantic identification for achievements (e.g., "Gym Sessions"). Deferred beyond V1 in Phase 08 | Only if a quest-specific achievement is wanted |

---

## A. Items required by the Phase 00 brief

### OD-04 — Final Daily Message catalog content
- **Resolved in Phase 04 (the mechanism):** the Daily Message comes from a **local catalog of original, unattributed lines** (no external quote API, no network, no quotations). The message for a day is chosen by a **pure, deterministic function of the `DateKey`** (`daysBetween(anchor, dateKey)` modulo the catalog size, so the catalog is walked one entry per day without a repeat until exhausted); no random source and **no persistence** are required. Same date, same message, on every reload. The starter catalog has 40 lines. See [CORE_UI.md](CORE_UI.md).
- **Still open (the content):** the final catalog — how many messages, the exact wording and polish, and whether any properly attributed / public-domain quotations are ever included. Whether a per-date assignment is ever persisted (DATA_MODEL §13) is also left open; it is not needed for correctness, and editing the catalog may change which message a past date maps to (a Daily Message has no historical role).
- **Needed by:** Phase 14 (final catalog and polish).
- **Until then:** Only original/system-style text in the local catalog. No external quote API. No unverified internet-attributed quotations.

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
- **Phase 08 status: deferred beyond V1, still open.** V1 ships 28 achievements, all quest-agnostic (totals, days, streaks, weeks, levels and ranks); no Gym-specific achievement exists. A Fitness-category quest is **never** assumed to be a Gym session, and nothing matches on a title or id. See [PROGRESSION_STATS_ACHIEVEMENTS.md](PROGRESSION_STATS_ACHIEVEMENTS.md) §6.
- **Question (still open):** If a quest-specific achievement (for example "25 Gym Sessions") is ever wanted, how is such a quest recognized?
- **Design notes for whenever it is decided:** a tag on the (mutable) template is not enough, because retagging would silently rewrite history. The sound design is an optional semantic `activity` key on `QuestTemplate` that is **snapshotted** onto the occurrence and the completion (and recorded with the ledger source) when they are created, so history keeps the key it had. That needs a schema migration, a backup-schema bump with an upgrade, parser updates and a quest-form control; all additive. Achievements are derived from history, so a new achievement over the key would apply to history written after the key exists (earlier completions carry no key and are never guessed).
- **Needed by:** only if a quest-specific achievement is wanted.
- **Until then:** Achievements may use only quest-agnostic conditions. Do not infer "Gym" from category, title or id.
