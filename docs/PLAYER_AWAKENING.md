# Player Awakening (Phase 11)

**Document status:** implementation record for Phase 11 (first-launch onboarding and the Player Name). The approved game rules stay in [MASTER_SPEC.md](MASTER_SPEC.md) (§17.4 describes the Awakening concept); this file records how it was built. No open decision (`OPEN_DECISIONS.md`) covered Awakening, so none is retired.

## 1. Principles

- **Identity and presentation only.** Awakening and the Player Name never change EXP, levels, ranks, achievements, quest seeds, weekly logic, streaks or any other progression. The name is read by no game rule.
- **The gate is the profile row.** A single row in a new IndexedDB store means "Awakening is complete". Nothing else (no flag, no timestamp, no field value) is ever read as that signal.
- **A new player is awakened before anything exists.** On a brand-new database the application does not start (no default quests, no occurrences, no reconcile) until Awakening is saved.
- **An existing player is never made to "start".** Upgrading a Phase 10 installation, restoring an older backup and a damaged profile all leave the player in the app.
- **Failure never pretends.** If the identity cannot be saved, onboarding is not complete and the screen does not advance.

## 2. Persistence

### 2.1 The store (IndexedDB schema v5, backup schema 5)

`DATABASE_VERSION` is **5** and `BACKUP_SCHEMA_VERSION` is **5**. One new store, `playerProfile` (key path `id`), holds **at most one row**:

```ts
interface PlayerProfileRecord {
  id: 'player'                 // the only key
  name: string | null          // the chosen name (already normalized), or null = no name chosen
  awakenedAt: EpochMs | null   // the real instant Awakening was accepted, or null for a LEGACY player
}
```

- `name: null` means no name was chosen. The screens then show the generic `PLAYER` label (`playerDisplayName` in `displayLabels.ts`; the label text lives only there).
- **`awakenedAt: null` on a migrated row means "a legacy, pre-Phase-11 player with no real Awakening timestamp".** It must **never** be interpreted as "onboarding is required". Only row existence decides that. A player who really awakens gets the instant of the acceptance.
- The spec's conceptual `createdAt` and `startedOn` (`DATA_MODEL §3`) were deliberately not added: nothing reads them, and `startedOn` would imply a rule the earlier phases never had.
- The application type `PlayerProfile` already means the derived statistics, so the use-case view type is `PlayerIdentity { name: string | null }`; the persistence type is `PlayerProfileRecord`.

### 2.2 The v4 → v5 migration rule (`persistence/migrations/v5.ts`, version-frozen)

A migration is told the version the database had **before the whole upgrade**, not the step before it (`Migration` now receives `{ originalFrom }`; `runMigrations` passes the upgrade's `from`; no existing migration changed). A new database runs migrations 1 through 5 in **one** upgrade, so its migration to v5 still sees `originalFrom === 0`.

| Database | `originalFrom` | v5 result |
|---|---|---|
| Brand new (0 → 5, one upgrade) | `0` | `playerProfile` created **empty**: no row, so Awakening is required |
| Existing installation (4 → 5, or 1, 2, 3 → 5) | `≥ 1` | store created with the legacy-completed row `{ id: 'player', name: null, awakenedAt: null }` |

The rule is the **version**, not the data: an existing but empty v4 database is still an existing installation. The row is written inside the live version-change transaction, so the upgrade is all-or-nothing (a failure leaves the database at v4 with no profile store and no data changed). Every other store and row is untouched.

Regression tests (`persistence/database/migrationV5.test.ts`) pin this: fresh 0 → 5 has no row; real v4 → 5 gets the legacy row with every other store identical; v1/v2/v3/v4 → 5 all get it; an empty v4 gets it; every step of a fresh upgrade (including v5) is told `originalFrom = 0` and a v4 → 5 upgrade runs only v5 told `4`; the migration called directly decides from `originalFrom` alone; a failing v5 leaves v4 untouched.

### 2.3 Backup

- `data.playerProfile` is a collection of **0 or 1** rows, validated strictly like every record (shape, `id = 'player'`, `name` null or a stored-form valid name, `awakenedAt` null or a safe integer, no duplicates, no unexpected fields) and required from schema 5.
- **Backup upgrade 4 → 5** (also from 1, 2, 3 through the chain): every backup older than schema 5 came from an installation that predates Awakening, so it restores as a legacy-completed player: one row `{ id: 'player', name: null, awakenedAt: null }` (the same row the database upgrade writes). The upgrade is pure and adds no timestamp.
- A schema-5 backup carries its own profile. A backup exported **before** Awakening finished carries none; restoring it replaces the profile (the restore is a full replace), so that device shows Awakening again, which is correct for an empty state.
- Export and integrity checks are strict: a damaged profile row makes `exportBackup` refuse (`record_validation_failed`) until a rename repairs it. The runtime read is lenient (see §2.4); strictness only applies where a file is produced or accepted.

### 2.4 Missing or damaged profile

`loadAwakeningState` (read-only: it never writes, not even a repair):

| Stored state | Result | Name |
|---|---|---|
| Valid row (including a legacy row) | complete (`profile`) | the row's `name` |
| Row exists but is invalid | complete (`damaged_profile`): Awakening still happened | none (`PLAYER`) |
| No row, and quest templates exist | complete (`existing_data`): quests exist only after Awakening (or before Phase 11), so this database lost its row; it is never a first launch | none (`PLAYER`) |
| No row, no quests | **Awakening required** | n/a |

The provider logs a warning for the two damaged cases. A rename repairs the row (`renamePlayer` recreates a missing row as a legacy row with `awakenedAt: null`, or rewrites a damaged one keeping a still-valid `awakenedAt`).
`renamePlayer` on a database that has **not** awakened writes nothing and returns `not_awakened`: creating the row would silently skip Awakening.

### 2.5 Commands

Both are single atomic transactions that touch only `playerProfile`:

- `completeAwakeningAtomically`: adds the row **only if absent**. A repeat, a double tap or a second tab gets `already_awakened` with the stored profile; **the stored name is never replaced**. A damaged existing row is reported as already awakened and left alone.
- `renamePlayerAtomically`: changes the name only; `awakenedAt` and row existence are preserved; same name returns `unchanged` and writes nothing.

## 3. Startup flow

`AppRuntimeProvider` opens the one database handle, then asks `loadAwakeningState` **before** `startApplication`:

- **Required** → state `awakening`: the Awakening screen replaces the app. Nothing has been created.
- **Complete** → the existing startup runs unchanged (seed defaults, reconcile, load Home), and the name is set together with the first ready state, so Home never shows `PLAYER` and then the name.

Because the app renders nothing until this decision (the existing `SYSTEM INITIALIZING...` screen covers the open), **Home never flashes before Awakening** (a test records every DOM mutation during a first launch and asserts Home never appears early).

Completing Awakening:

1. the screen calls `save(name | null)`; the provider runs `completeAwakening` (validates the name, then the atomic add-if-absent, stamping the real instant from the injected clock);
2. on success it starts `startApplication` straight away, so Home is ready by the time the player taps through the reveal;
3. when the reveal finishes (`onFinish`, after the exit fade) the provider shows the app; if startup fails here, the usual error screen appears and its **Retry runs the normal startup (the profile row exists), never Awakening again**.

The first day therefore starts when the player accepts: no occurrences, summaries or streak days exist before it, and an abandoned first launch leaves no progression rows at all.

| Situation | Behavior |
|---|---|
| New install | Awakening, then Home with the chosen name (or `PLAYER`) |
| Existing player (v4 upgrade, older backup, valid row) | straight to the app |
| Refresh during onboarding | restarts from the first stage; nothing was written; a typed draft is not kept |
| App closed halfway (before the save) | same as a refresh |
| App closed after the save, before Home | next launch is a normal one, with that name; no replay |
| After completion | never again; the row exists |
| Save fails | stays on the name stage with an alert; the typed name is kept; nothing stored; works once storage recovers |
| Double tap on CONFIRM / SKIP | saves once (the machine ignores a submit while saving) |
| Two tabs both on Awakening | the second save gets `already_awakened`; the first name stands |

## 4. The Awakening screen

A full screen of its own (the page's `main`), driven by a pure state machine (`features/awakening/machine.ts`: no timers, DOM or storage). It is lazy-loaded (its own chunk) and used only on a first launch.

```
boot → notice → identify → registering → complete → (exit fade) → app
                   ↑___________|  a save that failed or was refused
```

An action that does not belong to the current stage is ignored (the same state comes back), so stages cannot be skipped and a double tap is harmless.

| Stage | NORMAL | REDUCED |
|---|---|---|
| **boot** | ~0.6 s of dark, a single light sweep, aura fading in | skipped |
| **notice** | `CONNECTION ESTABLISHED` (scramble), `PLAYER DETECTED` and `AWAKENING AVAILABLE` (typed), one small particle burst, a border-light panel; **ACCEPT** appears at ~2.4 s | all lines at once, 150 ms fade, ACCEPT at once |
| **identify** | `IDENTIFY YOURSELF` (scramble); PLAYER NAME field with a character counter; CONFIRM and SKIP. No timer. | static |
| **registering** | `INITIALIZING PLAYER...`; the save happens here; at least 0.7 s so the beat is felt | no minimum |
| **complete** | `AWAKENING COMPLETE` (scramble), high aura, one ~90-particle burst, `WELCOME, <NAME>` (typed), `LV. 1 · E-RANK` (computed from the domain at 0 EXP, never hard-coded); continues by itself after ~3.6 s (visible time only) or on BEGIN / tap / Escape (after a 0.5 s guard); one haptic cue; a 250 ms exit fade | all at once, auto-continue ~2.6 s, 150 ms fade |

About 7 s unskipped; about 2 s if tapped through; once ever. Every animation is finite: nothing loops.

### 4.1 ACCEPT is explicit

Tapping the notice (or pressing Enter, Space or Escape) may only **finish its text animation**. Once ACCEPT is shown, a stray tap, key or repeated skip does **not** accept: entering the identify stage needs the ACCEPT button's own activation (`accept` is valid only when the text is done, and only the button dispatches it). A key held down (`repeat`) finishes nothing. ACCEPT also ignores taps for 350 ms after it appears, so the second tap of a double-tap meant to skip the text cannot land on it.

### 4.2 Timings are data

`PresentationTimings.awakening` (`effects/timings.ts`) holds every duration (NORMAL and REDUCED sets). Tests pass `TEST_AWAKENING_TIMINGS` (everything zero except the screen's own auto-continue, which keeps its real value so a test taps through it).

### 4.3 Effects reused

`TextScramble`, `Typewriter`, the finite `ParticleBurst`, the `system-fx-aura`, `-sweep`, `-trail` and `-reveal` classes, `Panel`, `SectionLabel` and Oxanium. The screen is **not** an `OverlayFrame` (that is a modal, tap-anywhere-closes shell for earned moments). No Level Up or Rank Up event is faked. One new cue, `awakening`, plays a haptic pattern at COMPLETE; its synthesized-sound score exists because every cue has one, but sound is OFF by default so a new install is silent.

### 4.4 Reduced motion

NORMAL or REDUCED comes from the same effect settings as the rest of the app, and **the OS reduced-motion setting forces REDUCED**. REDUCED shows every message at once: no boot beat, no scramble or typing, no particles, no sweep, 150 ms fades. The auto-continue read time remains.

## 5. The player name

Rules live in the domain (`domain/profile/playerName.ts`, pure and tested):

- **Normalization:** Unicode NFC; every whitespace run (spaces, tabs, line breaks, NBSP) collapsed to one space; trimmed. Blank (only whitespace) is **no name** (`null`).
- **Rejected:** control, private-use and lone-surrogate characters and invisible format characters (zero-width space, soft hyphen, word joiner, BOM, bidi marks and overrides). **ZWJ and ZWNJ are allowed** (emoji sequences; Persian and Indic scripts). A name needs at least one visible character (letter, number, symbol/emoji, punctuation).
- **Length:** at most **20 grapheme clusters** (`Intl.Segmenter`, code points where it is unavailable) and at most 96 UTF-16 code units (a storage guard). The field validates and counts rather than using native `maxLength` (which silently truncates a paste); a generous native cap of 128 units only bounds what the DOM holds.
- **Unicode** of any script is accepted. **No HTML interpretation:** `<`, `&` and quotes are ordinary characters; a name is only ever rendered as React text, a `textContent` typewriter or an input value, inside `<bdi dir="auto">`.
- **Blank and Skip:** in Awakening a blank field never confirms (it asks for a name or an explicit SKIP and saves nothing); SKIP stores `null`, shown as `PLAYER`. On Status, saving a blank name returns to `PLAYER`.
- The stored form is its own normalized form (`isStoredPlayerName`), so a stored name always re-validates.

### 5.1 Renaming from Status

An **IDENTITY** panel on `/status` shows the name with an inline editor (SAVE, Cancel; the draft starts from the stored name). Renaming:

- is one atomic write to the profile row; the UI updates at once (Home and Status read the runtime's `identity.name`);
- never replays Awakening and never touches progression (tests assert the ledger, quests, completions, EXP and level are identical);
- does **not** synchronize the day, so it also works while the device clock is behind;
- repairs a missing or damaged profile row (§2.4);
- on a failed save keeps the editor and the draft and says so; a double tap saves once; Cancel returns focus to the Edit button.

## 6. Reference image decision

`_reference/solo-leveling-effects-pack/assets/reference/Level Up_ Play this game.png` (a 1536 × 1024, 3.7 MB PNG) was **not** copied into the app and its dialog text is **not** reused:

- its provenance and licence are unknown (it was a file from `Downloads`; the pack's licence notes cover only the code libraries); it appears to be AI-generated art in the style of an existing series;
- its dialog line is a near-verbatim line from that series, and the project rule is original copy only;
- 3.7 MB would be a poor fit for a phone-first, offline PWA.

It was used only as composition inspiration: a framed notification panel, an icon-and-label header chip, a luminous violet-black panel with sparks. The screen is rebuilt from the app's own tokens, CSS and a Lucide icon; there is no external asset. (`PHASE_PLAN` listed copying the image into app assets; this decision supersedes that line.)

## 7. DEV preview

The development-only `/dev/effects` lab has an **AWAKENING (FIRST LAUNCH)** section: "Preview Awakening" and "Preview (first save fails)". It renders the real screen in its own dialog with a **stub** `save` that only reports a result back to the screen, plus an always-reachable "Exit preview" button. It imports no application, persistence, platform or runtime-action code, so it **cannot** read or write the real name, the Awakening state, the database or `localStorage` (tests assert the stored profile, quests and `localStorage` are identical afterwards, including with a real name stored). It is part of the lab, so it is removed from production builds with it (the route and its only dynamic import sit behind `import.meta.env.DEV`; a test guards that the preview is imported only by the lab).

## 8. Accessibility

- The screen is the page's `main`, one `h1` per stage; every visible message has its full text in a visually hidden node (the effect components keep the complete text for screen readers while the animated layer is `aria-hidden`).
- **Focus** moves to the control that matters: ACCEPT when it appears (described by the notice lines), the name input on identify (labelled, described by its hint and counter), the status line while saving, BEGIN on complete. The form submits on Enter.
- Validation text is a polite live region; a save failure is `role="alert"`. Nothing is disabled-and-hidden: CONFIRM is always focusable and explains a blank field instead of silently refusing.
- Touch targets are 44–48 px; the layout scrolls rather than clips when a phone keyboard is open.
- Skip and dismiss: tap or a key finishes the notice text; ACCEPT, CONFIRM or SKIP move on; BEGIN, tap or Escape leave the finished screen. Timers count visible time only.

## 9. Files

- Domain: `profile/playerName.ts` (+ tests), exported from `domain/index.ts`.
- Persistence: `config.ts`, `migrations/index.ts` (context), `migrations/v5.ts`, `records/playerProfile.ts`, `repositories/playerProfile.ts`, `commands/completeAwakening.ts`, `commands/renamePlayer.ts`, `integrity/dataset.ts`, `integrity/verify.ts`, `backup/import.ts`, `backup/schemaMigrations.ts`, `index.ts`.
- Application: `profile/awakening.ts` (`loadAwakeningState`, `completeAwakening`, `renamePlayer`).
- App: `AppRuntimeProvider.tsx` (the awakening state, identity), `runtimeContext.ts` (`identity`).
- Effects: `timings.ts` (`awakening`), the `awakening` cue in `types.ts`, `haptics.ts`, `sound.ts`.
- Features: `awakening/` (`machine.ts`, `AwakeningFlow.tsx`, `copy.ts`, `types.ts`), `identity/` (`NameField`, `usePlayerNameDraft`, `nameText`), `status/IdentityPanel.tsx`, `presentation/dev/AwakeningPreview.tsx`.
- Test harness: `src/test/renderApp.tsx` pre-awakens its database by default (`awakened: false` plays the real first launch), with `identity.ts`, `AwakenedGate.tsx`, `flakyWrites.ts`.

## 10. Verification and limitations

Automated: the migration, backup, command, use-case, machine, screen, rename and preview tests described above. Manual browser checks and the final test and bundle numbers are in the Phase 11 report.

Limitations: real Android haptics for the `awakening` cue and the continuous particle and scramble animation on a real phone are not verified here (the browser pane often reports the page hidden, which pauses animation); a typed draft is not kept across a refresh; the V1 copy and timings are polish for Phase 14.
