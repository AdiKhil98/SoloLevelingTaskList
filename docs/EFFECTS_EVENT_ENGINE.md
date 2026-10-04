# Effects & Event Engine (Phase 10)

**Document status:** implementation record for Phase 10. The approved game rules stay in [MASTER_SPEC.md](MASTER_SPEC.md); this file records how the app *shows* them. It resolves **OD-06** (sound), **OD-07** (haptics), **OD-08** (animation intensity / timings) and **OD-20** (the Goal Crusher spectacle).

## 1. Principles

- **Effects are earned.** Heavy motion appears only for a meaningful event; ordinary screens stay calm and nothing animates in the background. Every animation is finite.
- **Presentation consumes results; it never decides them.** EXP, levels, ranks, streaks, scores and achievement unlocks are produced by the domain and persistence layers. Nothing in this phase changes an XP value, the progression formula, a streak rule, daily finalization, weekly scoring, an achievement condition, quest order or recurrence. Achievements still award **0 EXP**.
- **One controlled queue.** No component opens its own overlay. Everything an earned moment shows goes through one queue and one host.
- **No new storage.** There is no new IndexedDB store, no schema change and no backup change. The only persisted thing is three per-device preferences in `localStorage`.

## 2. Architecture

```
domain events ──► application (what did this action just write?) ──► effects (plan → queue) ──► features (host, popups, overlays)
                                                                                   ▲
                                                platform adapters (storage, vibration, audio, visibility) ┘
```

| Layer | Files | Role |
|---|---|---|
| `src/domain` | `events/types.ts`, `achievements/unlockEvents.ts`, `daily/perfectDay.ts` | Two additive event types (`PerfectDayReached`, `AchievementUnlocked`) and their pure builders. |
| `src/application` | `presentation/presentationEvents.ts` | `completionPresentationEvents`, `reconciliationPresentationEvents`: the events one action or one reconciliation may present. Framework-free. |
| `src/effects` (imports `domain` only) | `plan.ts`, `queue.ts`, `controller.ts`, `timings.ts`, `settings.ts`, `settingsStore.ts`, `haptics.ts`, `sound.ts`, `particles.ts`, `burstLoop.ts`, `text.ts`, `useCountUp.ts`, `ParticleBurst.tsx`, `TextScramble.tsx`, `Typewriter.tsx` | The pure planner and queue, the cue data, and the domain-agnostic effect primitives. |
| `src/platform` | `preferences.ts`, `haptics.ts`, `audio.ts`, `page.ts` | The only readers of `localStorage`, `matchMedia`, the Vibration API, Web Audio and page visibility. Every call is guarded and never throws. |
| `src/features/presentation` | `PresentationHost.tsx`, `SystemPopup.tsx`, `GoalToast.tsx`, `ModalEntry.tsx`, `OverlayFrame.tsx`, `overlays/*`, `SystemSettingsPanel.tsx`, `runtime.ts`, `usePresentation.ts`, `entryText.ts`, `dev/*` | Renders queue entries. Imports the effects and platform layers. |
| `src/app` | `AppRuntimeProvider.tsx`, `routes.tsx` | The provider is the single place that calls the use cases, so it is the single place that feeds the queue. |

The `AppRuntimeProvider` creates one presentation runtime (queue, settings, cue player) and exposes it through `PresentationContext`. `PresentationHost` is mounted in `AppShell`, inside the router and above every route, so a moment survives navigation (for example Sleep opening the Daily Report).

## 3. Event flow

1. A use case saves something (a quest completion, a weekly goal update, a startup/resume/midnight reconciliation) and returns the domain events it produced.
2. The provider asks the application layer for the events worth presenting (`completionPresentationEvents` / `reconciliationPresentationEvents`). These add the live Perfect Day, linked weekly goals the completion completed, and the achievements the action just unlocked. A failed read is logged and the action's own events are still presented; presentation never fails an action that was saved.
3. `planPresentation(events, { origin })` (pure) turns them into ordered **presentation entries**.
4. The entries are enqueued **before** the new snapshot is adopted, so the HUD can hold the old level while a Level Up waits (see §6).
5. `PresentationHost` reads the queue and renders it. It starts each waiting entry after its own delay, plays its sound/haptic cue once, and removes it when it finishes.

## 4. Classes, priority and the queue

| Class | Surface | Entries | Behavior |
|---|---|---|---|
| **minor** | inline / toast, never modal | quest feedback (+EXP), weekly goal reached while the week is open | ~0.9–1.6 s; runs beside a calm screen; dropped while an overlay is open |
| **medium** | one SYSTEM popup (`role="status"`) | achievements, live Perfect Day, all weekly goals done (live), restrained weekly result (0–5) | one at a time, ~3 s, tap/close button dismisses |
| **major** | modal overlay (`role="dialog"`) | Level Up, weekly result 6–9 | tap/Esc, ~4.5–5.5 s |
| **critical** | modal overlay, heaviest treatment | any change of rank (including Level 100 → `???`), Perfect Week (10/10) | tap to advance, ~7–8 s |

**Order within one batch** (fixed by the planner): quest feedback → weekly goal feedback → all-goals / Perfect Day → weekly result → Level/Rank reveal → achievements. **Progression always comes before achievements**, so an achievement can never spoil a Level or Rank reveal.

**Rules** (`effects/queue.ts`, a pure reducer; every rule is unit-tested):

- **Deduplication:** an entry whose id (a stable key such as `quest:{occurrenceId}`, `progression:{transactionId}`, `weekly:{weekKey}`, `perfect:{dateKey}`) was already enqueued this session is ignored, including after it was shown or the queue was cleared. The last 256 ids are remembered.
- **Concurrency:** medium, major and critical entries wait in one first-in-first-out line and show **one at a time**. A modal (major/critical) therefore pauses everything lighter behind it. Nothing preempts what is already showing.
- **Minor** entries are not queued behind anything but are dropped while a modal is open, and end when a modal opens over them.
- **Bound:** at most 8 waiting entries; past that the oldest lightest entry is dropped. Major and critical entries are never dropped.
- **Hidden page:** nothing starts while the page is hidden, and every auto-dismiss clock runs only in visible time.
- **Navigation:** the queue lives above the router, so entries survive route changes. A reconciliation-origin entry additionally waits while a form route (`/quests/new`, `/quests/:id/edit`, `/weekly/edit`) is open; an action-origin entry never waits for that.
- **Refresh / reopen:** the queue is in memory only. A reload drops anything pending and nothing is replayed (§10).

## 5. Event → effect mapping

| Source event(s) | Entry | Class | Cue (haptic / sound) |
|---|---|---|---|
| `QuestCompleted` + `XPAwarded` | quest feedback: row pulse, rising `+N EXP`, EXP bar fill and glow. Stronger for B/A, strongest for S. | minor | `quest` / `quest_strong` |
| `WeeklyGoalCompleted` (score < 10) | small toast "GOAL COMPLETE · SCORE n / 10" | minor | none |
| `WeeklyGoalCompleted` (score = 10) | "ALL GOALS COMPLETE — the result is final after Sunday" | medium | `achievement` |
| `PerfectDayReached` | "PERFECT DAY — ALL DAILY QUESTS COMPLETE" (a live statement; never claims finalization) | medium | `perfect_day` |
| `WeeklyBoardFinalized` | weekly result by tier (§9) | by tier | by tier |
| `LevelUp` (+ `RankUp`s) | one progression overlay (§6) | major / critical | `level_up` / `rank_up` / `perfect_week` (Level 100) |
| `AchievementUnlocked` | one popup listing every unlock of the action, in catalog order | medium | `achievement` |

## 6. Level Up and Rank Up

- **One award → one overlay**, however many levels it crosses. `LV. 9 → LV. 12` is one overlay with the domain's `levelsCrossed` kept; a rank change makes the **same** overlay critical and adds a second phase: a tap (or the timer) moves from `LEVEL UP  LV. 9 → LV. 12` to `RANK ADVANCEMENT  E-RANK → D-RANK`, and a second tap closes it. Several rank transitions of one award fold into one first→last transition with every boundary level kept.
- **Level 100+:** crossing 100 is the critical milestone and reads `S-RANK → ???` (the label comes only from `rankLabel`, no name is invented, the line reads "RANK UNKNOWN."). Levels 101 and up are ordinary Level Ups; the rank stays `???`.
- **XP bar and the HUD hold.** The EXP bar fills (600 ms, with a glow) when an award is saved. When that award also crosses a level, the bar would otherwise run *backwards* to the new level's small fraction. Instead the queue publishes a **HUD hold**: while a Level Up waits, Home shows the level and rank the player had, with the bar full (the state before the award, read from the event's own totals). When the overlay opens, the HUD shows the new level behind it. The hold ends by itself if the entry starts, is dropped, the queue is cleared, or after 1.5 s (so the HUD can never stay stale). `ExpProgressBar` also snaps (never drains) whenever its value decreases.
- **Tap safety:** an overlay ignores taps and Esc for its first 500 ms, so the tap that completed the quest cannot dismiss it.

## 7. Achievements: detecting only what is new

Achievements stay **fully derived** from history (Phase 08). Nothing is stored and there is no "seen" flag. Each unlock already carries the exact record that unlocked it (a ledger transaction id, a finalized day, a finalized week). The presentation layer reports an achievement only if that record is **one the current action or reconciliation just wrote**:

- a **completion** reports unlocks whose evidence is the new `XPAwarded.transactionId` (quest counts, and levels/ranks reached by that award);
- a **reconciliation** reports unlocks whose evidence is a day or week it just finalized, or the weekly bonus transaction.

Because evaluation is idempotent and the evidence is a specific record, achievements that were already unlocked can never replay: nothing evaluates the full unlocked list for presentation, and a reload, a restart or a repeat completion (`already_completed` carries no events) produces nothing. Several simultaneous unlocks come out in catalog order and are shown as one popup. A crash between saving and showing loses that one celebration, never the achievement (it is on `/achievements` with its date).

## 8. Perfect Day (live)

A live day reaching 100 % produces `PerfectDayReached` from the refreshed day (`buildPerfectDayReachedEvent`, a pure function of `DailyProgress`) and shows **PERFECT DAY — ALL DAILY QUESTS COMPLETE**. It never says "finalized". The historical Perfect Day (streaks, Total Perfect Days, the "First Perfect Day" achievement) is still decided only at day finalization (Phase 06, unchanged), so that achievement appears the next morning.

## 9. Weekly Goal Crusher (OD-20, resolved)

The spectacle is the **finalization** moment: it is when the result is immutable and the bonus is actually paid. A live goal or a live 10/10 is reversible (manual progress is an absolute value that can be lowered), so it gets only a small, honest notice and is never called a result.

| Score | Presentation |
|---|---|
| 0–5 | restrained popup: score, "NO BONUS THIS WEEK" |
| 6–7 | overlay "WEEK COMPLETE": aura, score, counted-up bonus EXP, reward tier |
| 8–9 | overlay "STRONG WEEK": adds a light particle rise and the light sweep |
| 10 | overlay "PERFECT WEEK" (critical): full burst, running border light, strongest cue |

Every overlay shows the score, the bonus EXP exactly as the domain paid it and, when configured, "REWARD TIER n+ UNLOCKED" with a link to claim it in Weekly (claiming is unchanged and awards no EXP; the reward's own text stays on the claim screen). A level or rank the bonus caused follows the weekly overlay as its own reveal. A linked goal completed through a quest completion is derived in the application layer as the difference between the week's completion counts with and without that completion (`WeeklyGoalCompleted` is not emitted by the completion command; nothing stored changes).

## 10. Catch-up suppression (OD-21 preserved)

A reconciliation is presented only when it is **strictly overnight**: it finalized **at most 1 day and at most 1 weekly board** (`OVERNIGHT_MAX_FINALIZED_DAYS`, `OVERNIGHT_MAX_FINALIZED_BOARDS`). Anything larger returns no presentation events: the historical XP is still correct, the returned finalization events are still retained for audit, and the player sees only the existing restrained notice ("N days reconciled. 1 weekly board finalized (+EXP).") — no Level Up, Rank Up, achievement, Perfect Day or weekly spectacle replays. Closing the app on Sunday night and opening it on Monday is one day plus one board, so that week's result is presented; being away for several days is silent.

## 11. Text effects

- **TextScramble** (heading resolves from glyphs): Level Up, Rank Advancement, weekly result headings.
- **Typewriter** (a SYSTEM line typed out): the one-line message under a Level, Rank or weekly overlay. Reusable for Phase 11.
- **Always instant:** quest titles, body text, forms, navigation, statistics, the Achievements and History lists, every ordinary screen.
- **Accessibility:** both effects render the complete final string in a visually hidden node and keep the animated layer `aria-hidden`; the animated layer is updated through a ref (about 30 fps), so assistive technology never hears intermediate letters. Reduced effects render the final text immediately. EXP numbers count up only as a response to a change and never on mount.

## 12. Particles, aura, border light

- **ParticleBurst** mounts only inside an overlay for an earned moment (Level ≈ 60 particles, Rank ≈ 110, Strong week ≈ 50, Perfect Week ≈ 140; ×0.6 on devices with ≤ 4 cores). It is a finite burst (no respawn) drawn from two pre-rendered sprites (no per-particle blur), at most 1.5× pixel ratio, with a frame-time guard that halves the particles under load. It ends by itself, clears, stops its animation-frame loop and unmounts; a hidden page ends it at once.
- **Aura** is layered gradients that arrive once (no blur filters, no endless drift). **Border light** is a CSS conic-gradient that runs twice and fades; it is used only on Rank, Perfect Week and the achievement popup. The sweep is one finite CSS animation. Nothing runs on ordinary screens.
- Framer Motion is **not used**: CSS keyframes cover every effect here, so no animation library enters either bundle.

## 13. Reduced motion and settings (OD-08, resolved)

- Modes: **NORMAL** and **REDUCED**. The device's `prefers-reduced-motion` always forces REDUCED; the in-app choice can only add to it (the Settings panel says so).
- REDUCED removes particles, scramble, typewriter, count-up, the aura/trail/sweep and large transforms; popups and overlays only fade (150 ms), reading time is shorter, and **every word and number is still shown** (the same accessible descriptions). The global CSS rule for the device setting still applies as a safety net.
- **Settings** (`SYSTEM SETTINGS` panel at the end of `/status`): Effects (NORMAL/REDUCED), Haptics, Sound. Defaults: **Effects NORMAL (unless the device forces REDUCED), Haptics ON, Sound OFF.** They are stored in `localStorage` under `sltl.effects-settings.v1` and are **intentionally outside the IndexedDB backup**: they are per-device preferences (a phone has a motor and speakers, a desktop does not), losing them can never change progress, and there is therefore **no schema or backup change**. Storage failures (private windows, full storage) fall back to the choice lasting for the session.

## 14. Sound (OD-06) and haptics (OD-07)

- **Sound is original and synthesized at runtime** with Web Audio (a few oscillator notes per cue, quiet master gain 0.16). No audio file is bundled or downloaded, so there is nothing to license and no asset to cache offline. Cues: quest, strong quest, achievement, perfect day, level up, weekly result, rank up, perfect week. Sound is **off by default**; turning it on is a user gesture that unlocks the audio context and plays a soft confirmation. A blocked or unsupported context means silence, never an error. The notes are V1 starting values; judging them by ear and polishing them is Phase 14 work (they have been tested for schedule and structure, not listened to in this phase).
- **Haptics** use `navigator.vibrate` (ms): quest `[15]`, strong quest `[25]`, achievement and perfect day `[25,50,25]`, level up `[40,60,40]`, weekly result 6–9 `[30,50,30]`, rank up `[60,80,60,80,120]`, Perfect Week and the Level 100 milestone `[60,70,60,70,60,70,160]`. A restrained weekly result has no cue. A call before the page's first tap is skipped silently (Chrome would log an intervention); an unsupported device does nothing; no failure reaches gameplay.
- Each entry's cue plays once, when the entry starts showing.

## 15. Performance

- The full-screen overlays, particles and text effects are a **lazy chunk** (`EntryOverlay`), prefetched on idle after startup. If the chunk cannot be loaded (offline before it was cached) a plain dialog shows the same numbers and the failure is logged. Route splitting is deliberately not part of this phase.
- Bundle (production build): main JS 535.78 kB → 566.24 kB (gzip 159.77 → 169.53 kB); lazy `EntryOverlay` chunk 10.14 kB (gzip 3.58 kB); CSS 31.78 → 43.14 kB (gzip 6.73 → 8.65 kB). The development lab and its route are removed from production builds.
- Loops: the only animation-frame loops are the particle burst (bounded, stops on completion, hidden page and unmount), the text effects (end when done) and the EXP count-up (ends when the value arrives). None runs on an ordinary screen.

## 16. Accessibility

- Overlays are `role="dialog"` + `aria-modal`, named by their heading and described by the full text of the moment. Focus moves to the Continue button and returns to where it was; the rest of the page is `inert` while open; Esc, Enter, a tap or the timer dismiss it. There is no keyboard trap.
- Popups are polite `role="status"` live regions that never take focus. The quest feedback and weekly-goal toast are visual only (`aria-hidden`): the existing status line and the Weekly screen carry the same facts as text.
- Colour and glow never carry meaning alone; every state also has text. The Settings controls are native radios and switches.

## 17. Development-only effects lab

`/dev/effects` (the **Effects Lab**) exists only in development builds: the route and its dynamic import sit behind `import.meta.env.DEV`, a build-time constant, so a production build contains neither (verified by searching `dist` and by the route table test). It builds synthetic domain events and hands them to the same presentation queue. It imports no application, persistence or runtime-action code, writes nothing to the database or `localStorage`, and never touches the clock; a test asserts this.

## 18. Tests

Planner (every event shape, tiers, multi-level, each rank boundary, 100+, ordering); queue (priority, dedupe, FIFO, bound, minor rules, hold); settings and timings; haptics and sound data and scheduling; the particle simulation and the loop's life cycle (stops after the effect, no frames when hidden, thinning); text helpers; the platform adapters (blocked storage, missing APIs); domain builders; application presentation events against a real fake IndexedDB (first quest, no replay, the tenth completion, live Perfect Day, linked goals, simultaneous unlocks, strict overnight vs catch-up, read failures); the host (dialog semantics, focus, inert, input guard, auto-dismiss, hidden page, form routes, popups, weekly tiers, reduced motion, cues); the HUD hold and quest-row feedback; the EXP bar; the Settings panel; the lab and its guarantees; the chunk-failure fallback; and end-to-end flows through the real app.

### Test-harness stabilization

The Weekly page tests failed intermittently in nearly every full run. The cause was test scheduling, not product behavior: vitest ran one worker per core, which oversubscribed the CPU and made single UI steps take seconds instead of milliseconds (measured: the same step took 72 ms alone and 3–5 s under load), exceeding the 5 s async limit; and one test fired `focus` before the app's resume listener existed. Fixes, with no skipped, retried or weakened test and no timeout changed: `maxWorkers: '50%'` in the vitest config (the full suite then passed repeatedly and finished no later), and the clock-behind test now waits for the listener to be attached (a precondition) before changing the clock. No production behavior changed.

## 19. Verification

Automated: `npm run lint`, `typecheck`, `test:run` (1,766 tests in 96 files, up from 1,534; two consecutive clean full runs) and `build` pass. Production build checked: the lab route and its chunk are absent from `dist`.

Manual, in the browser pane at 360×440, 360×800 and 320×568 (DOM measurements for the taller sizes), against the real app and its real IndexedDB, and with the development lab for events that cannot be reached without clock tricks:

- a real quest completion (row pulse, `+10 EXP` chip marked `aria-hidden`, unchanged status line, no dialog); a real Level Up from an S quest; reload afterwards (nothing replays, no stale overlay or popup);
- the Level Up timeline in the real app: the HUD held the old level with the bar full until the dialog opened. This found a real flaw (the new level showed ~300 ms before the lazily loaded overlay opened); the hold now lasts until the overlay reports it is open, and is covered by deterministic tests;
- in the lab: Level Up, multi-level, Level + Rank, Rank, Level 100 (`S-RANK → ???`), Level 101, achievement ×1/×3, live Perfect Day, goal toast, all-goals notice, weekly 3 / 6 / 8 / 10: no horizontal overflow, nothing overlapping the Continue button, nothing off screen, content fits without scrolling at 320×568 and 360×800, the weekly toast sits above the navigation; dismissal removes the dialog, the canvas and `inert`, and focus returns to the control that opened it; clean console;
- REDUCED mode: `data-fx="reduced"`, no canvas, no aura/pop animation, the heading and the typed line complete at once, the same accessible description; and entries queued while the page was hidden appear only once it is visible.

Limits of that check, stated plainly: the pane often reports the page as hidden or unfocused, which pauses animation, so the *look in motion* (scramble, particles, trail, pulse timing) was confirmed in the frames the pane did draw and by reading computed animations, not by watching a continuous run; the device's own reduced-motion setting could not be toggled, so it is covered by tests; haptics and sound cannot be felt or heard here (their schedules and guards are unit-tested); and nothing was run on a real Android phone.

## 20. Limitations

- Sound and animation timing are V1 starting values that have not been judged by ear or on a real phone; real Android finger testing and tuning remain Phase 13/14 work.
- Presentation is in memory only: a crash between saving and showing loses that one celebration (never the data).
- A weekly result is presented only for a strict overnight reconciliation; after a longer absence the result is on Weekly with its CLAIM REWARD.
- The weekly-goal toast and quest feedback are visual; screen-reader users get the same facts from the existing status line and the Weekly screen.
- The Player Awakening (Phase 11) will reuse `Typewriter`, `TextScramble`, `ParticleBurst` and the overlay frame.
