# Visual SYSTEM Layer and Manual Quest Ordering (Phase 09)

Records what Phase 09 built: the static SYSTEM look of the whole app and the player's manual ordering of daily quests. Authoritative rules stay in `MASTER_SPEC.md`; this file is the implementation record. It is **not** the animation phase: see "Phase 10 boundary".

## 1. Visual direction

Near-black violet background, deep violet primary accent, a restrained cyan secondary, thin luminous borders, translucent dark panels, sharp (3 px) corners and HUD corner brackets on the few windows that anchor a screen. Ordinary screens stay calm: glow is reserved for the level number, the EXP fill and the active nav tab. Nothing animates beyond the existing 300 ms width transition of the EXP bar (reduced-motion safe).

### Tokens (`src/styles/globals.css`)

Every colour a component uses is a CSS variable mapped into Tailwind through `@theme inline`; components never hard-code violet, cyan or a status colour.

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#07060d` | page; also `theme-color` in `index.html` |
| `--surface` / `--surface-raised` | `#0d0b17` / `#141026` | panels / emphasised panels and controls |
| `--border` / `--border-strong` | `#29233f` / violet at 50 % | hairlines / luminous borders |
| `--foreground` / `--muted` | `#ececf4` / `#a4a4ba` | text (body ≥ 7:1, muted ≥ 4.5:1 on the surfaces) |
| `--accent` / `--accent-strong` | `#a78bfa` / `#7c3aed` | primary violet |
| `--accent-2` | `#22d3ee` | cyan: EXP rewards, unlock dates, the message rail |
| `--success` / `--warning` / `--danger` | `#34d399` / `#fbbf24` / `#f87171` | status (the old `red-*` / `amber-*` classes are gone) |
| `--glow-soft` / `--glow` | shadows | the three glow places above |
| `--nav-height` | `3.5rem` | bottom navigation; also drives the page's bottom padding |

The existing token names (`background`, `foreground`, `surface`, `border`, `muted`, `accent`, `accent-strong`) are unchanged, so every earlier screen picked the new look up without edits.

A single fixed, static violet vignette sits behind the page (`body::before`, composited, no repaint on scroll). `_reference/` supplied ideas only (corner brackets, the `[ TITLE ]` header, the violet→cyan EXP gradient, the notification window's icon-box/header-cell); no code was copied and no reference effect component is used.

### Typography

- **Display font: Oxanium** (variable, weight 200–800), used only for app-owned text: `[ LABELS ]`, the level, rank, EXP and stat numerals, headings, nav labels. User text (quest titles, goals, rewards, notes) stays in the body font, so the display font never has to cover arbitrary glyphs.
- **Body font:** the platform stack (Roboto on Android): readable, native, always available offline.
- **Source and licence:** `src/assets/fonts/oxanium-latin-wght-normal.woff2` (14,044 bytes, SHA-256 `3aa555c528430aab19bb2693dc206bab557767d3082dba66400784c9cc90cfbb`) from the pinned npm package `@fontsource-variable/oxanium@5.3.0`, latin subset only; licence text in `src/assets/fonts/OFL-Oxanium.txt` (SIL Open Font License 1.1, 4,383 bytes). It is a committed asset, **not** an npm dependency.
- **Offline / PWA:** `@font-face` points at the bundled file with `font-display: swap`; Vite emits it as a hashed same-origin asset (`dist/assets/oxanium-latin-wght-normal-*.woff2`), so Phase 12's service worker precaches it like any other asset. There is no network font request.

### Reusable static components

| Where | What |
| --- | --- |
| `components/ui/Panel.tsx` | `Panel`: the thin-bordered window; `tone="accent"` and `framed` (corner brackets) for the one hero window per screen |
| `components/ui/SectionLabel.tsx` | `[ LABEL ]` heading (`h1`/`h2`/`h3`/`p`); brackets are `aria-hidden` so the accessible name is the text, joined with non-breaking spaces so a wrapped label never strands a bracket |
| `components/ui/RankBadge.tsx` | framed rank tag (also renders the Level 100+ `???`) |
| `components/ui/MeterBar.tsx` | framed progress meter (goals, scores, achievement progress); same ARIA contract as before, clamped to the track |
| `components/ui/ExpProgressBar.tsx` | restyled, same props and roles |
| `components/ui/styles.ts` | `BUTTON`, `BUTTON_PRIMARY`, `BUTTON_DANGER`, `BUTTON_QUIET`, `NOTICE_*`, `EMPTY_STATE` class strings |

CSS classes `system-panel`, `system-panel-accent`, `system-frame`, `system-label` and `system-focus` (one focus ring) live in `globals.css`.

### Screens

Home (hero player window, Daily Message with a cyan rail, Today and Daily Streak as two tiles from 360 px up and stacked below, Weekly tile, quest list with a `n/m DONE` hint), quest cards (status node, title, `Difficulty X · Category`, cyan `+EXP`; completed rows are violet-filled with a left rail, check and muted EXP), Quests, Create/Edit quest, Weekly (board, goals, rewards, history, editor), Status (PLAYER STATUS window, streaks, statistics, category bars), Achievements (unlocked = lit window with a filled badge and cyan date; locked = dim dashed window with a lock and progress), Daily Report, Daily History, startup and error screens, and the bottom navigation (same four destinations, 56 px targets, active tab marked by a top line and tint, safe-area padding unchanged). No information was removed from any screen.

## 2. Manual quest ordering

The player can reorder the daily quests, seeded prayers and custom quests alike. There is no prayer-first rule any more. Reordering lives **only on `/quests`**; Home shows the same order (its rows are completion buttons, so a drag handle there would risk accidental completions).

### Storage

`QuestTemplate.sortOrder`: a **unique non-negative safe integer**, one sequence over **all** templates (active and archived). Only the relative order matters; gaps are allowed. It is a presentation preference: it never bumps `revision` or `updatedAt`, and an occurrence snapshot never stores it. The rule lives in the domain (`domain/quests/order.ts`): `compareQuestOrder` (sort order, then `createdAt`, then id: the tie-breakers only ever matter for a damaged dataset), `sortTemplatesByOrder`, `renumberInOrder`, `isSortOrder`. `application/today/questOrder.ts` re-exports it, so Home, the Quests list and the Weekly quest picker share one comparator. The Phase 04–08 rule ("six defaults first, then by creation time") now exists only, frozen, inside the migration.

### Schema v4 and backup schema 4

No store or index was added; the migration backfills the new field once.

- `migrations/v4.ts` runs inside the version-change transaction, so the upgrade is all-or-nothing (a failure leaves the database at v3 and the rows unchanged; tested).
- **Version-frozen.** It imports nothing from the domain or application and keeps its own copy of the Phase 08 rule (`PHASE_08_SEED_KEY_ORDER`: `prayer.fajr`, `prayer.dhuhr`, `prayer.asr`, `prayer.maghrib`, `prayer.isha`, `sleep`; then every other template oldest `createdAt` first, then id; archived templates take part). The result is dense `0…n-1` and reproduces the Phase 08 visible order exactly. Do not edit it; add a new migration instead.
- The backup upgrade `3 → 4` (`backup/schemaMigrations.ts`) calls the same pure function (`assignPhase08SortOrder`), so a database upgrade and an old backup get identical values (tested). Backups of schema 1–3 still import.
- `sortOrder` is required by the record reader. Dataset integrity (import, export and `verifyDatabaseIntegrity`) rejects a duplicate (`duplicate_sort_order`), a negative, a fractional or an out-of-range value.
- Guards for the frozen list: a persistence test pins `PHASE_08_SEED_KEY_ORDER`, an application test pins `DEFAULT_QUEST_SEEDS`, and a 400-dataset randomized test compares the migration with a restated copy of the Phase 08 comparator.

### Writes (the only code that sets `sortOrder`)

| Operation | Behaviour |
| --- | --- |
| New quest / seeds (`appendTemplate`) | one transaction reads the largest stored value and inserts at `max + 1` (0 for the first), so two tabs cannot pick the same one; a fresh install gets Fajr … Sleep as 0–5. If the largest value is already `Number.MAX_SAFE_INTEGER` (foreign data only) the whole sequence is first renumbered `0…n-1` in its current order in the same transaction, so appending can never overflow |
| Edit (`updateTemplate`) | reads the stored row **in the same transaction** and writes it back with the stored `sortOrder` whatever the caller passed, so a stale form can neither move a quest nor undo a newer reorder |
| Archive | does not touch `sortOrder` |
| Restore | does not touch `sortOrder`: the quest returns to the slot it held |
| Reorder (`reorderTemplates`) | see below |

### Reorder transaction

`reorderTemplates({ expectedOrder, newOrder })`: one read-write transaction on the template store.

1. Reads every template and computes the stored **active** order.
2. `expectedOrder` must equal it exactly, else `stale_order` (a quest was added/archived/restored, or another tab reordered): nothing is written and the current order is returned. `newOrder` must be a permutation of it, else `invalid_order`.
3. The active templates' existing `sortOrder` values are handed to the quests in their new order and only the rows whose value changed are written. Values are only permuted, so the sequence stays unique, archived rows are never touched and nothing overflows. If a damaged dataset ever repeats a value, the sequence is first renumbered in its current order inside the same transaction.

`revision`, `updatedAt` and every other field are left alone; "unchanged", a rejection or a corrupt stored row write nothing. The application use case `reorderQuests` runs the normal day-synchronization gate first (refused while the clock is behind or a past day is unfinalized), then the command, then refreshes Home. It writes no occurrence, completion or EXP row.

### Archive / restore semantics

An archived quest keeps its slot in the global sequence. Moves among the active quests permute only the active slots, so a restored quest reappears at its old index among all quests (between whatever now occupies the neighbouring slots). New quests always go below everything, archived ones included.

### Today's occurrences

Home sorts today's occurrences by their **template's** `sortOrder`. Nothing about order is stored on an occurrence, so reordering cannot touch a frozen snapshot, the denominator, completions or the ledger (tested). An occurrence whose template is missing (only foreign or hand-edited data; the app archives, never deletes) sorts after every quest that has a template, then by `materializedAt` and template id. A completed quest keeps its place; completion never moves a row.

### Stale tabs and concurrency

The Quests page sends `expectedOrder` (the order it last loaded or stored) with every write and queues its writes, so each is checked against the order the previous one left; rapid Move presses apply in order. A refusal (stale/invalid) or a failure reloads the list from storage, discards the queued writes of that generation and shows a message; nothing is silently overwritten and no duplicate or invalid position can be produced. A reorder racing a new quest either wins (the new quest lands below) or is told it is stale.

## 3. Reorder UX (`/quests`, Active view)

- **Rows** show their position (`01`, `02` …), a drag handle, the quest, and an action row: Move up, Move down, Edit, Archive (all 44 px high; Move buttons 44 px wide). The Archived view has no handle or arrows.
- **Drag** (`useSortableList`, plain Pointer Events, no library; the then-unused `framer-motion` dependency was never imported and was removed in Phase 14): only the handle starts a drag and only the handle has `touch-action: none`, so the page still scrolls with a finger. A 6 px threshold separates a tap from a drag. While dragging, rows move with transforms set directly on the elements (no React render per pointer move) and **nothing is stored**. The new position comes from the pure `dropIndex(centers, draggedIndex, draggedCenter)`; the others make room by `shiftFor`. Near the top or bottom of the visible area the page auto-scrolls (the dragged row stays under the pointer). On release the new order is reported **once**.
- **Cancel writes nothing:** pointer cancel, lost pointer capture, Escape, the page being hidden, leaving the screen or a list change mid-drag all revert the rows and report nothing (each tested, asserting zero read-write transactions). The context menu is suppressed on the handle; secondary pointers and non-primary buttons are ignored.
- **Accessible fallback:** every active row has real `Move <title> up` / `Move <title> down` buttons (`aria-disabled` at the ends, so they stay focusable). Focus is returned to the pressed button after the row moves; the polite status region announces `Fajr moved to position 2 of 6.`; each row also carries a screen-reader-only `Position n of m`. The handle is `aria-hidden` and pointer-only: keyboard and screen-reader players use the buttons.

## 4. Verification

Automated: domain (order rules), persistence (v3→v4 with real data and the Phase 08 parity property test, atomic failure, backup upgrade, integrity, append incl. concurrency and overflow, update/archive preservation, the reorder command incl. races and a 300-step randomized sequence), application (initial order, bottom default, moves of seeded and custom quests, restart and day rollover, edit/archive/restore, frozen occurrences, day gate, stale tabs, missing template, Weekly picker), UI (handles, drag, cancel, Move buttons, focus, announcements, reload persistence, failures) and shared primitives. Existing behaviour tests keep passing; the few that pinned a class string or raw heading text now assert the semantics (accessible names; the nav target height token ≥ 44 px).

Manual (built-in browser, dev server): Home, Quests, Create/Edit, Weekly, Weekly edit/history, Status, Achievements, Daily Report, Daily History and the 404 page at **360×800** and **320×568**: no horizontal overflow, last content clear of the bottom navigation, no touch target under 44 px, clean console. A real pointer sequence on the real layout moved a quest, showed the live offsets, cancelled with no write, dropped with one write, and the order survived a reload and appeared on Home; the database upgraded in place to v4 with the template `revision` unchanged. Not exercised live: auto-scroll (the pane does not run animation frames; covered by a deterministic test with a stubbed scroll) and a real desktop width (the pane could not be given one this session; the centred `max-w-md` column and the bottom navigation container are unchanged from earlier phases).

## 5. Phase 10 boundary

Not implemented (and not prepared beyond static surfaces): `ParticleCanvas`, animated `BorderTrail`, `SystemAura` animation, `LevelUpOverlay`, `RankUpOverlay`, typewriter and `TextScramble` effects, XP float, quest-complete animation, the Goal Crusher cinematic, sounds, haptics, achievement celebration overlays. The panels, corner brackets, glow tokens and meters are the static surfaces those effects will build on.

## 6. Known limitations

- Reordering is available only on `/quests`; Home follows it.
- The order is one global list: a quest scheduled for certain days keeps its place on the days it appears.
- A completed quest does not sink to the bottom of Home.
- The bundle is ~536 kB (the Vite advisory remains; code splitting is a later concern).
