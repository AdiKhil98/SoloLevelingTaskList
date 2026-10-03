# SoloLevelingTaskList — Persistence (Phase 03)

Implementation facts about `src/persistence/` that later phases need. Product rules live in [MASTER_SPEC.md](MASTER_SPEC.md), the conceptual model in [DATA_MODEL.md](DATA_MODEL.md), and the domain API in [DOMAIN_ENGINE.md](DOMAIN_ENGINE.md); this file does not repeat them.

Everything is imported from `src/persistence/index.ts`. The layer uses **native IndexedDB only** (no wrapper library, no runtime dependency added). It depends on `src/domain` and nothing else: no React, no routes, no UI, no effects, no platform code. The domain knows nothing about it. Lint enforces both directions. Persistence never reads the wall clock: every timestamp and time zone is passed in by the caller.

## Database

| | |
|---|---|
| Name | `solo-leveling-task-list` (`DATABASE_NAME`) |
| Version | `3` (`DATABASE_VERSION`): v1 = the four stores below; v2 = `dailySummaries` (Phase 06); v3 = `weeklyBoards` and `weeklyRewardClaims` (Phase 07) |
| Backup format | `solo-leveling-task-list-backup`, `formatVersion 1`, `schemaVersion 3` |

`DATABASE_VERSION` and the backup `schemaVersion` are independent numbers that both started at 1. They are not required to stay equal (today both are 3).

## Schema map

> **Later schema versions.** v2 (Phase 06) added `dailySummaries` (insert-only, key `dateKey`, index `quality`); see [DAILY_LIFECYCLE.md](DAILY_LIFECYCLE.md). v3 (Phase 07) added `weeklyBoards` (key `weekKey`, index `status`; mutable only while the board is `active`, written only by the commands in `commands/`, each of which refuses a finalized board) and `weeklyRewardClaims` (key `weekKey`, insert-only); see [WEEKLY_GOAL_CRUSHER.md](WEEKLY_GOAL_CRUSHER.md). Backup `schemaVersion` 3 carries both new collections; the registered upgrades `1 → 2` and `2 → 3` add them empty, so older backups still import. The table below is the original four-store map.

Four stores. Every other entity in DATA_MODEL §14 (player profile, progress cache, daily summaries, weekly boards and claims, achievements, daily messages, settings) is **not** created yet; the phase that first writes it adds it through a migration (see *What Phase 03 does not implement*).

| Store | Primary key | Owning entity | Mutability | Why it exists |
|-------|-------------|---------------|------------|---------------|
| `questTemplates` | `id` | `QuestTemplate` | mutable (versioned by `revision`), soft-archived only | what a quest *is* now |
| `questOccurrences` | `id` = `occ:{templateId}@{dateKey}` | `QuestOccurrence` | insert-only | frozen "this quest on this date" snapshot |
| `questCompletions` | `occurrenceId` | `QuestCompletion` | insert-only, written only with its XP row | at most one completion per occurrence |
| `xpTransactions` | `id` = `xp:quest_completion:{occurrenceId}` (quest rows) | `XPTransaction` | append-only | the authoritative EXP ledger |

### Indexes

| Store | Index | Key path | Unique | Query it serves |
|-------|-------|----------|:------:|-----------------|
| `questTemplates` | `status` | `status` | | list active / archived templates |
| | `seedKey` | `seedKey` | ✔ (sparse: `null` is not indexed) | idempotent seeding by `seedKey` |
| `questOccurrences` | `dateKey` | `dateKey` | | "today's occurrences", daily progress |
| | `templateId` | `templateId` | | history of one quest (ordered by date) |
| | `templateDate` | `[templateId, dateKey]` | ✔ | store-level guard: one occurrence per quest per date |
| `questCompletions` | `dateKey` | `dateKey` | | completions of a day |
| | `templateId` | `templateId` | | completions of one quest (stats, linked weekly goals) |
| | `completedAt` | `completedAt` | | audit / recent-activity views |
| `xpTransactions` | `seq` | `seq` | ✔ | ledger order, ledger tip, no duplicate sequence |
| | `idempotencyKey` | `idempotencyKey` | ✔ | store-level guard: one EXP award per source |
| | `effectiveDate` | `effectiveDate` | | "EXP on date D" reporting |
| | `sourceWeekKey` | `sourceWeekKey` | | "EXP for week W" (`null` rows are not indexed) |
| | `category` | `category` | | category totals (`null` weekly rows are not indexed) |
| | `sourceType` | `source.type` | | split quest EXP from weekly bonuses |

`createdAt` on the ledger is deliberately **not** indexed (audit order is `seq`).

## Stored vs. derived

The XP ledger is the source of truth for EXP. **Nothing else about progression is stored in Phase 03**: no `totalExp` cache, no level, no rank. They are derived on read:

- `readProgression(db)` — fast: total EXP is the ledger tip's `totalExpAfter` (one cursor step on the `seq` index, cross-checked against the row count).
- `reconstructProgression(db)` — full: reads every ledger row, runs `validateLedger`, derives total EXP.
- Both return `{ totalExp, lastSeq, levelState }` where `levelState` (`level`, `expIntoLevel`, `expToNext`, `rank`) comes from the Phase 02 `levelStateOf`.

No `PlayerProgress` cache exists in schema v1 and none is required (DATA_MODEL §3). One may be introduced later only if a performance need justifies it; it must then be rebuildable from and verifiable against the ledger, and it never becomes the authoritative source for XP, level or rank.

## Transaction strategy

- Every operation runs through one helper, `runTransaction(db, stores, mode, work)`. `work` awaits only IndexedDB requests (anything else would let the transaction auto-commit). If `work` throws, the transaction is **aborted**, so nothing it wrote survives.
- Raw `IDBRequest` objects never leave the layer; repositories return domain records or typed results.
- Insert-only stores (`questOccurrences`, `questCompletions`, `xpTransactions`) have **no update or delete function**. The only writers are `insertOccurrence`/`ensureOccurrence`, `completeQuestAtomically`, and the backup restore.
- Templates are never hard-deleted (history refers to them): `archiveTemplate` sets `status = 'archived'` and an explicit `activeUntil`; `updateTemplate` replaces a template but refuses a `revision` that moves backwards. Same-day semantics of edits and deletes are decided above this layer (OD-16, resolved in MASTER_SPEC §5.7 and implemented in the application layer: [QUEST_MANAGEMENT.md](QUEST_MANAGEMENT.md)). The caller passes `activeUntil`, which is compatibility bookkeeping required by template validation; `status` is the authoritative archive state.

### Atomic quest completion

`completeQuestAtomically(db, { occurrenceId, completedAt, timeZone })`

One `readwrite` transaction over `questOccurrences`, `questCompletions`, `xpTransactions`:

1. read the occurrence (→ `rejected: occurrence_not_found` if absent) and validate it;
2. read any existing completion for it and validate it; if one exists, require its XP row to exist and agree (otherwise `ledger_integrity_failed`);
3. read the **ledger tip from this transaction** (never from the caller): `{ totalExp, lastSeq }`;
4. call the Phase 02 `completeQuest` with that state;
5. on `completed`, `add` the completion and `add` the XP row; any failure aborts both.

Result: `completed` (completion, XP transaction, progression, domain events), `already_completed` (stored completion; nothing else), or `rejected` (a domain `CompletionRejection` or `occurrence_not_found`). Rejections write nothing.

### Ledger sequence allocation

`seq` is allocated inside the transaction that commits the row: the tip is read in step 3 and the domain computes `seq = lastSeq + 1` and `totalExpAfter = totalExp + amount` from it. Overlapping `readwrite` transactions on the same stores are serialized by IndexedDB, so two tabs cannot both read the same tip, and the unique `seq` index would reject a collision anyway. The tip read also checks `tip.seq === row count`, which catches a missing or extra row before anything is appended.

### Idempotency at two levels

- **Domain:** the stored completion is passed as `existingCompletion`, so a duplicate returns `already_completed` with no records, EXP or events.
- **Storage:** the completion's primary key (`occurrenceId`), the unique `idempotencyKey`, and the unique `seq` make a duplicate write physically impossible.

A `ConstraintError` is converted to `already_completed` **only after a fresh read proves it**: a valid completion for that occurrence is stored **and** its matching XP row (source, amount) is stored. If no completion is stored, or a completion has no matching XP row, the operation fails with `ledger_integrity_failed` (the original error is kept as `cause`). A constraint conflict is never reinterpreted as success on its own.

## Validation strategy

Persisted and imported data is never trusted. Every record crossing a boundary is parsed from `unknown` into a typed record by hand-written readers (`records/`), with no type assertions on raw data and no schema library:

1. **Structure** — exact field set (unexpected fields are rejected), types, safe integers, enums.
2. **Domain rules** — reuses `isDateKey`, `validateRecurrence`, `validateQuestTemplate`, `isCategory`, `isDifficulty` and the deterministic key builders from Phase 02.
3. **Row consistency** — e.g. an XP row's `idempotencyKey`/`id` must match its source; a weekly row must have `effectiveDate = weekKey + 6`, `sourceWeekKey = weekKey`, no category (INV-25).

Reads (`getTemplate`, `listOccurrencesByDate`, …) validate what they return and throw `record_validation_failed` (with `issues`) on corrupt data. Writes validate before storing.

Deliberate choices:

- `snapshot.expReward` is only required to be a positive integer. It is **not** compared with the current `DIFFICULTY_EXP`, because a snapshot records what the quest was worth at the time.
- `completedAt` + `timeZone` are **not** re-resolved to a local date during validation. That depends on the runtime's time-zone database, and a legitimate backup must never be rejected because a browser's tz data differs. The domain command enforces INV-11 at write time; the dataset validator enforces `completion.dateKey === occurrence.dateKey`.

### One validator for the ledger and one for the dataset

- `validateLedger(rows)` is the single implementation of the chain rules: `seq` starts at 1 and is gap-free and strictly increasing (the row at index `i` has `seq = i + 1`), `totalExpAfter(n) = totalExpAfter(n-1) + amount(n)`, every amount is a positive safe integer, ids and idempotency keys are unique.
- `validateDataset(raw)` parses all four collections, then checks the cross-record rules: unique keys (including `seedKey` and `(templateId, dateKey)`), every completion has its occurrence and an agreeing XP row (template, date, category, EXP), every quest XP row has its completion, then `validateLedger`.

Backup import, backup export and `verifyDatabaseIntegrity(db)` all use `validateDataset`; the rules exist once.

### `templateId` is an informational reference, not a foreign key

`QuestOccurrence.templateId`, `QuestCompletion.templateId` and `XPSource.templateId` are historical references. A missing template is **valid** (deleting or archiving a template must never invalidate history), so neither `validateDataset` nor import requires the template to exist. Templates are only soft-archived by the repository, so in normal data the template always exists; the leniency matters only for foreign or hand-edited data. Strict references are enforced where history must agree with itself: completion → occurrence → XP row.

## Connection and `versionchange`

`openDatabase({ name?, factory? })` returns a `PersistenceDatabase` handle that owns **one** connection. The application opens one handle at startup and passes it to every function; there is no module-level singleton and no global mutable state.

- `versionchange` (another tab upgrading): the handle closes its connection immediately so the upgrade is never blocked; later calls fail with `database_closed`, and the application reopens or reloads.
- `close` (abnormal termination) also marks the handle closed.
- `blocked` (an old connection will not close): the open rejects with `database_blocked`; the abandoned open request is neutralised — its late upgrade is aborted and a late connection is closed — so it can neither change the schema nor leak a connection.
- Opening a database that is newer than this build rejects with `database_version_unsupported`.
- No IndexedDB at all rejects with `database_unavailable`.

`factory` defaults to the browser's `indexedDB`; tests inject a fresh `fake-indexeddb` `IDBFactory` per test for perfect isolation.

## Migrations

`migrations/index.ts` holds `MIGRATIONS`, a map `version → migration`; `runMigrations` applies every step in `(oldVersion, newVersion]` inside the version-change transaction. v1 lives in `migrations/v1.ts` and only creates the four stores. To change the schema: add `vN.ts`, register it, raise `DATABASE_VERSION`. Migrations never delete progression data; the database is never dropped or recreated. A migration that throws aborts the upgrade (`database_open_failed`) and leaves the previous schema in place. There is no v2.

## Backup

### Envelope

```jsonc
{
  "format": "solo-leveling-task-list-backup",
  "formatVersion": 1,          // envelope structure
  "schemaVersion": 1,          // data model in `data`
  "appVersion": "0.1.0",       // supplied by the caller
  "exportedAt": 1760000000000, // supplied by the caller (EpochMs)
  "exportedFromTimeZone": "Europe/Berlin",
  "checksum": { "algorithm": "SHA-256", "value": "<64 lowercase hex>" },
  "data": {
    "questTemplates": [],
    "questOccurrences": [],
    "questCompletions": [],
    "xpTransactions": []       // in ledger order
  }
}
```

Level, rank and total EXP are **not** in the file; they are rebuilt from the ledger. Export is one consistent read-only snapshot, validated first (a database that fails integrity checks cannot be exported — it throws `record_validation_failed`/`ledger_integrity_failed` with `issues`). Key order is canonical (sorted), so identical state and metadata produce identical text. `exportBackup(db, { exportedAt, exportedFromTimeZone, appVersion })` takes all metadata as input; `serializeBackup(envelope)` produces the file text.

### Checksum

SHA-256 (Web Crypto, no dependency) over the **canonical JSON of the whole envelope excluding the `checksum` field**, so it also covers the metadata. It is **corruption detection only** (truncation, accidental damage), not a signature; it gives no protection against deliberate edits. A mismatch is a rejection (`backup_checksum_mismatch`).

### Import (full replace)

`parseBackup(text)` validates without touching the database; `importBackup(db, text)` does the same and then restores. In order, the first failure wins:

1. size, JSON parse, object, `format`;
2. version numbers: `formatVersion`/`schemaVersion` newer than this build → `unsupported_backup_version`; older → upgraded through `BACKUP_DATA_MIGRATIONS` (empty today; a missing step is also `unsupported_backup_version`, never a guess);
3. exact envelope shape (unknown fields rejected);
4. checksum;
5. `validateDataset` on the (upgraded) data.

Only then does **one `readwrite` transaction over all four stores** clear them, add every record, and read the result back (store counts and ledger tip must match what was validated) before committing.

- A bad file is **returned** as `{ ok: false, error: { code, message, issues } }` with codes `invalid_backup | unsupported_backup_version | backup_checksum_mismatch`. Nothing was written.
- A failure of the restore itself is **thrown**: `storage_quota_exceeded` / `database_closed` as themselves, anything else as `import_failed` (cause preserved). The transaction aborts, so the previous data is exactly as it was.
- Success returns an `IntegrityReport`: record counts and progression derived from the restored ledger.

Importing never merges. The same backup imported twice yields the same state. The **application** is responsible for the confirmation dialog and for exporting a safety backup of the current data first (DATA_MODEL §15 step 5); persistence only guarantees the replacement is atomic.

## Errors

All failures are `PersistenceError { code, message, issues, cause }`:

| Code | Meaning |
|------|---------|
| `database_unavailable` | no IndexedDB in this environment |
| `database_open_failed` | open or migration failed |
| `database_blocked` | an upgrade is blocked by another connection |
| `database_version_unsupported` | stored database is newer than this build |
| `database_closed` | connection closed (explicitly, `versionchange`, or abnormally) |
| `transaction_failed` | any other IndexedDB failure (`cause` has the original) |
| `constraint_violation` | duplicate primary key or unique index |
| `storage_quota_exceeded` | out of storage |
| `not_found` | update/archive of a missing template |
| `record_validation_failed` | a record failed validation (`issues`) |
| `ledger_integrity_failed` | records contradict each other (`issues` when available) |
| `checksum_unavailable` | no Web Crypto |
| `invalid_backup` / `unsupported_backup_version` / `backup_checksum_mismatch` | backup rejection codes |
| `import_failed` | the restore transaction failed and was rolled back |

Expected outcomes (a duplicate completion, a rejected completion, a bad backup file) are **returned** values; unexpected failures are thrown. Persistence never shows alerts and never swallows an error; wording is the UI's job.

## Tests

`fake-indexeddb` (devDependency only) provides a real IndexedDB implementation; no repository function is mocked. Persistence test files declare `// @vitest-environment node`. Atomicity tests assert on the **raw stored records**, and the failure cases inject real faults (a store write that throws mid-transaction, a planted conflicting ledger row) rather than only checking return values.

## What Phase 03 does not implement

- Any UI, startup wiring, or use of persistence from the application; `localStorage` for core data.
- Seeding of default quests. The six approved seeds (five prayers + Sleep) depend on `PlayerProfile.startedOn` and belong to Phase 04; `getTemplateBySeedKey` and the unique `seedKey` index exist so seeding can be idempotent.
- The `player` store (`PlayerProfile`) — the phase that first needs it (Phase 04). No `PlayerProgress` cache is planned unless a performance need appears.
- `dailySummaries` and streak persistence — **implemented in Phase 06** (schema v2, backup schema 2); see [DAILY_LIFECYCLE.md](DAILY_LIFECYCLE.md).
- `weeklyBoards`, `weeklyRewardClaims` and the Weekly Goal Crusher engine — **implemented in Phase 07** (schema v3, backup schema 3); see [WEEKLY_GOAL_CRUSHER.md](WEEKLY_GOAL_CRUSHER.md). The weekly bonus is the only producer of `weekly_goal_crusher` ledger rows.
- `achievementUnlocks`, `dailyMessageAssignments`, `AppSettings` — their phases (settings depend on OD-08 and others).
- A "reset all data" function. Restore is the only whole-store replacement and it has its own deliberate path.
- Cross-tab UI synchronization (correctness does not depend on it).
- Salvage of a corrupt database (export refuses; Phase 13 may add a repair path).

Each deferred store is added by a normal migration in the phase that needs it; when the stored data model changes, bump `BACKUP_SCHEMA_VERSION` and register the upgrade in `backup/schemaMigrations.ts` so older backups still import.
