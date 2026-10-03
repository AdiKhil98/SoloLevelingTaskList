# SoloLevelingTaskList — Quest Management (Phase 05)

Implementation facts about creating, editing, archiving and restoring **normal quests**. Product rules live in [MASTER_SPEC.md](MASTER_SPEC.md) (§5.3 EXP from difficulty, §5.7 same-day semantics); the domain API is in [DOMAIN_ENGINE.md](DOMAIN_ENGINE.md), storage in [PERSISTENCE.md](PERSISTENCE.md), and the Phase 04 shell this extends in [CORE_UI.md](CORE_UI.md). This file does not repeat them.

Phase 05 changed **no domain code, no persistence code, no schema and no dependency.** It added application use cases, quest-management screens, an id source, and changed one application function (`loadToday`). It resolves **OD-05** and **OD-16**.

## Routes

| Route | Screen |
|-------|--------|
| `/quests` | Quest list: **Active (n)** and **Archived (n)** views, Add Quest, Edit, Archive (with confirmation), Restore |
| `/quests/new` | Create form |
| `/quests/:templateId/edit` | Edit form (unknown id → "Quest not found"; archived id → "Quest archived, restore it first") |

All three work on direct navigation or refresh (form state is component state, not route state). The only thing carried in navigation state is a one-shot confirmation ("Quest created.") that is cleared from the history entry once shown. The bottom nav is **Home · Quests · Status** (Quests stays active on its nested routes). Home has a 48 px **Add Quest** "+" link in its header, and the Quests screen has an **Add Quest** button.

## Recurrence choices and form fields

Common: **Title**, **Quest type**, **Difficulty** (E — Trivial, D — Easy, C — Normal, B — Hard, A — Very Hard, S — Major; the descriptive names are UI labels only), a read-only **Reward**, **Category** (exactly the five approved ones). A new quest starts as Daily, C, Discipline, starting today.

| Type | Extra fields | Stored as |
|------|--------------|-----------|
| Daily | Start date | `{ kind: 'daily' }`, `activeFrom` = start date |
| Scheduled → Selected weekdays | seven weekday checkboxes, Start date | `{ kind: 'weekdays', weekdays }` (ISO 1–7, ascending, unique), `activeFrom` = start date |
| Scheduled → Interval | Every N days, Starting (date) | `{ kind: 'interval', everyNDays, anchor }`, `anchor` = `activeFrom` = starting date (the anchor itself is eligible) |
| One-Time | Quest date | `{ kind: 'one_time', date }`, `activeFrom` = the creation date (never later than the date) |

No monthly, RRULE, cron, hourly or Goal Crusher type exists, and `activeUntil` has no form field (archiving is how a quest stops). `seedKey`, template id and `role` are never form fields; the form values type has no such field.

### No custom EXP (OD-05)

The Reward line is `expRewardForDifficulty(difficulty)` from the domain, rendered as text. There is no EXP input, and neither the form values, the definition, the template nor the occurrence-creating code path has an EXP field to fill: an occurrence's `expReward` is derived from `difficulty` by `createOccurrence` and frozen there. React holds no copy of the table.

## Validation

`parseQuestForm(values, { today, current? })` (application layer, pure) is the single place form strings become a `QuestDefinition`. It returns **all** field errors at once as codes (the UI chooses wording) and finally asks the domain's `validateRecurrence`; the use cases then run `validateQuestTemplate`, and persistence validates again before writing.

- Title: trimmed, non-empty (the domain has no length limit, so none is added).
- Weekdays: at least one, each 1–7.
- Interval: digits only, a safe integer, `>= MIN_INTERVAL_DAYS` (2). `1` is rejected (use Daily).
- Dates: a native `type="date"` value is passed through `parseDateKey`, so `2026-02-30` is rejected rather than normalized. Start and quest dates may not be in the past, **except** that on edit a date equal to the stored one is accepted unchanged.
- The date inputs' `min` is only a hint; the use case validates against a fresh clock reading.

## Use cases (`src/application/quests/`)

All take `ApplicationContext { database, clock, ids }`, read the clock once, never throw for expected outcomes, hide raw errors (`FailureReason` via `classifyFailure`), and end with `loadHome` so the returned `Refreshed` state (or `home: null` + `refreshCause` if only the re-read failed) is authoritative.

| Use case | Result statuses |
|----------|-----------------|
| `createQuest(context, values)` | `created` · `invalid` · `failed` |
| `loadQuestForEdit(context, id)` | `found` · `not_found` · `archived` · `failed` |
| `updateQuest(context, id, values)` | `updated` · `invalid` · `not_found` · `archived` · `failed` |
| `archiveQuest(context, id)` | `archived` · `already_archived` · `not_found` · `failed` |
| `restoreQuest(context, id)` | `restored` · `already_active` · `expired` · `not_found` · `failed` |
| `listQuestTemplates(context)` | `ok` (active + archived `QuestListItem`s) · `failed` |

The runtime provider wraps these as `useAppRuntime().quests`; a saved change also replaces the Home snapshot, so Home is current the moment the player returns. Management actions award **0 EXP** and write no ledger row, completion or occurrence of their own.

## The frozen-occurrence rule (OD-16)

Once a `QuestOccurrence` exists for a date it is frozen for that date. Nothing in quest management writes `questOccurrences`, `questCompletions` or `xpTransactions`, the stores are insert-only, and the loader never rebuilds or drops an existing occurrence. See MASTER_SPEC §5.7 for the rule; its consequences here:

- **Create** — the template is saved with `createTemplate`, then `loadHome` materializes today's occurrence if (and only if) the new template is eligible today. Nothing is created for earlier dates. If the second step fails the template still exists and the next Home load creates the occurrence (`created` with `home: null`).
- **Edit** — only the template changes (`applyDefinition`): title, difficulty, category, recurrence and start date; `revision` + 1 and `updatedAt` are set. `id`, `createdAt`, `seedKey`, `role`, `status`, `activeUntil` and any description are carried over from the freshly re-read record by construction. Today's existing occurrence is untouched (even if the edit makes the quest ineligible today, or the quest is already completed); the next occurrence uses the new values. If no occurrence exists for today, the edited template's normal eligibility decides, and the refresh creates it immediately if now eligible. One-Time: an existing occurrence is never moved; changing the date only affects an occurrence not yet created.
- **Archive** — `archiveTemplate` sets `status: 'archived'` (**the authoritative state**). Future occurrences stop because the loader only creates occurrences from active templates. Today's existing occurrence stays visible, completable and in the denominator. The stored `activeUntil` is compatibility bookkeeping only: template validation forbids `activeUntil < activeFrom` and cutting off a One-Time quest's date, so it is the latest of the archive date, `activeFrom` and a One-Time date. A second archive writes nothing.
- **Restore** — sets `status: 'active'` and `activeUntil: null`; identity, seed key, role, recurrence, `activeFrom`, revision and history are untouched. An existing occurrence for today is reused; one is created only if the quest is eligible today and has none; nothing is generated for the days it was archived. A One-Time quest whose date has passed cannot be restored (`expired`; the UI shows "Date passed").
- **Archived quests are not editable**; restore first. A stale form from another tab can neither edit nor un-archive an archived quest (the use case re-reads and refuses).

## Home loader change (`loadToday`)

Phase 04 started from active templates. Phase 05:

1. reads every occurrence stored for today and keeps all of them;
2. reads the templates of any status (for display order);
3. creates an occurrence only for an **active** template that is eligible today and has none yet;
4. joins completions and computes progress over the union.

So an occurrence whose template was archived, edited out of today, or is missing still counts and still completes; a hard task cannot be archived away to shrink today's denominator. Ordering of such occurrences uses their template's seed key and creation time (falling back to the occurrence's `materializedAt`).

## Seeded templates

The six seeds remain ordinary templates. They can be edited, archived and restored; id, `seedKey` and `role` are preserved (Sleep keeps `role: 'sleep'` even if it is retitled or rescheduled). An archived seed is found by `seedKey` and never re-seeded, so initialization creates no copy. If the Sleep quest is archived or rescheduled, no Sleep occurrence exists on some days; Phase 06's Sleep action must handle that.

## Ordering (temporary)

Unchanged from Phase 04 (`compareQuestOrder`): the six seeds in their natural order, then user quests by creation time, then template id. Editing never changes `createdAt`, so it never changes a position. There is no manual ordering and no sort-order field (no migration).

## Id generation

User-created templates are `tpl_<uuid v4>`. The randomness enters through an `IdSource` in `ApplicationContext` (like `Clock`), supplied by `systemIds` in `src/platform/ids.ts`, the only place that reads Web Crypto:

1. `crypto.randomUUID()` when it exists (called as a method);
2. otherwise a v4 UUID built from `crypto.getRandomValues()` (version and variant bits set);
3. otherwise it throws. There is no `Math.random` and no timestamp fallback.

`crypto.randomUUID` is secure-context only, so it is absent over plain HTTP on a LAN address (an Android phone opening the dev server); `getRandomValues` is available everywhere. This was verified in a real insecure context (`http://<lan-ip>:5173`: `isSecureContext` false, `randomUUID` undefined) by creating a quest. Seed ids are `tpl_seed_*`; a UUID is hex digits and hyphens only, so the two namespaces can never collide. The domain and persistence layers never see a random source.

> `crypto.subtle` is also secure-context only (it was `undefined` in that same check). The backup checksum uses it, so Backup export/import will report `checksum_unavailable` over plain HTTP. There is no Backup UI yet, so Phase 05 is unaffected; the backup-UI and PWA phases must account for it.

## Failure handling

Every failure leaves stored truth unchanged and the screen usable: a failed create or edit keeps the form and everything typed with a safe message; a failed archive leaves the quest active and listed; no optimistic updates. Raw errors are logged to the console only. A double tap on Create is guarded synchronously, so it cannot create two quests.

## Phase 05 limitations (deliberate)

- No manual reordering, no `activeUntil`/end-date field, no unsaved-changes warning, no eligibility preview (PHASE_PLAN lists one; the owner deferred it).
- An active One-Time quest whose date has passed stays in the active list, labelled "Date passed", until archived. Nothing archives it automatically (that would be lifecycle, Phase 06).
- No streak lifecycle, rollover, Weekly Goal Crusher, achievements, Player Name onboarding, final effects or PWA work.
- A saved change that cannot be re-read triggers a full reload rather than patching state; there is no cross-tab live sync.

## Tests

`src/application/quests/*` and `src/application/today/frozenOccurrences.test.ts` (node, fake-indexeddb): form parsing, create for every recurrence, the create-today matrix, edit snapshots, the archive cases (none today / uncompleted / completed / reload / later date / seed not re-seeded), restore, EXP integrity (no management action touches the ledger), list and load-for-edit, and the loader's orphan handling. `src/platform/ids.test.ts` and `src/application/ids.test.ts`: UUID format, uniqueness, the `getRandomValues` fallback, the no-source failure, no `Math.random`. `src/features/quests/*` and `src/features/home/HomeQuestManagement.test.tsx` (jsdom, the real provider, persistence and domain over a fake IndexedDB): forms, accessibility, validation, save failures, archive confirmation, restore, and Home integration.
