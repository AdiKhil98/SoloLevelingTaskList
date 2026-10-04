import { CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type FormEvent, type MouseEvent } from 'react'
import { Panel } from '@/components/ui/Panel'
import { BUTTON_PRIMARY, BUTTON_QUIET } from '@/components/ui/styles'
import { levelStateOf } from '@/domain'
import { ParticleBurst } from '@/effects/ParticleBurst'
import { TextScramble } from '@/effects/TextScramble'
import { timingsFor } from '@/effects/timings'
import { Typewriter } from '@/effects/Typewriter'
import { cn } from '@/lib/utils'
import { pageVisibility } from '@/platform/page'
import { playerDisplayName, rankLabel } from '../displayLabels'
import { NameField } from '../identity/NameField'
import { NAME_HINT, playerNameErrorText } from '../identity/nameText'
import { usePlayerNameDraft } from '../identity/usePlayerNameDraft'
import { useFinish, useVisibleTimeout } from '../presentation/useFinish'
import { useFx, usePresentationRuntime } from '../presentation/usePresentation'
import { AWAKENING_COPY, welcomeLine } from './copy'
import { awakeningReducer, initialAwakeningState, type AwakeningAction, type AwakeningProblem } from './machine'
import type { AwakeningFlowProps, AwakeningSaveResult } from './types'

const NOTICE_PARTICLES = 36
const COMPLETE_PARTICLES = 90
const BLANK_NAME_TEXT = 'Enter a name, or choose SKIP to be called PLAYER.'

/** The effect mode and the Awakening timings that apply (reduced outside the app, so a lone screen stays static). */
function useAwakeningFx() {
  const runtime = usePresentationRuntime()
  const { mode } = useFx()
  const overrides = runtime?.timingOverrides
  const timings = useMemo(() => timingsFor(mode, overrides).awakening, [mode, overrides])
  return { runtime, mode, reduced: mode === 'reduced', timings }
}

function problemText(problem: AwakeningProblem | null): string | null {
  if (problem === null) return null
  return problem === 'save_failed' ? AWAKENING_COPY.saveFailed : playerNameErrorText(problem)
}

function saveOutcomeAction(outcome: AwakeningSaveResult): AwakeningAction {
  switch (outcome.status) {
    case 'saved':
      return { type: 'saved', name: outcome.name }
    case 'rejected':
      return { type: 'save_rejected', reason: outcome.reason }
    case 'failed':
      return { type: 'save_failed' }
  }
}

/** The icon-and-label chip that heads every stage (decorative: the headings carry the meaning). */
function Badge() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-[3px] border border-border-strong text-accent">
        <CircleAlert className="size-5" />
      </span>
      <span className="font-display text-[0.6875rem] font-semibold tracking-[0.5em] text-accent">[ {AWAKENING_COPY.badge} ]</span>
    </div>
  )
}

/**
 * Player Awakening: the first-launch onboarding screen (Phase 11). It is a
 * full screen of its own, shown INSTEAD of the app until the player is awakened,
 * so Home never appears behind it. Its stages are the pure state machine in
 * `machine.ts`; this component draws them, runs their timers and reports the
 * save to the application through `save`.
 *
 *  - NOTICE: SYSTEM makes contact. Tapping the screen (or a key) only FINISHES
 *    the text; entering the next stage needs the ACCEPT button, which ignores
 *    taps for a short guard after it appears.
 *  - IDENTIFY: the player names themselves (or skips).
 *  - INITIALIZING: the save. If it fails, nothing advances.
 *  - COMPLETE: AWAKENING COMPLETE, then the exit fade into the app.
 *
 * It is presentation and onboarding only. It never touches EXP, levels, ranks,
 * quests or any stored progress, and it plays each effect once: nothing loops.
 * REDUCED shows every message at once with short fades and no particles,
 * scramble or typing.
 */
export default function AwakeningFlow({ save, onFinish, as = 'main' }: AwakeningFlowProps) {
  const { runtime, mode, reduced, timings } = useAwakeningFx()
  const [state, dispatch] = useReducer(awakeningReducer, undefined, () =>
    initialAwakeningState({ skipBoot: timings.bootMs <= 0, noticeDone: timings.noticeDoneMs <= 0 }),
  )
  const paused = useSyncExternalStore(pageVisibility.subscribe, pageVisibility.isHidden, () => false)
  const draft = usePlayerNameDraft()
  const [blankTried, setBlankTried] = useState(false)
  const [noticeBurstDone, setNoticeBurstDone] = useState(false)
  const [completeBurstDone, setCompleteBurstDone] = useState(false)

  const onFinishRef = useRef(onFinish)
  useEffect(() => {
    onFinishRef.current = onFinish
  }, [onFinish])
  const finish = useCallback(() => onFinishRef.current(), [])
  const { closing, close } = useFinish(timings.exitMs, finish)

  const acceptRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const beginRef = useRef<HTMLButtonElement>(null)
  const acceptReadyAt = useRef(0)
  const beginReadyAt = useRef(0)
  const saving = useRef(false)

  const { stage, noticeDone } = state
  const noticeSettled = reduced || noticeDone

  // The timers run on visible time only: they wait while the page is hidden. Their callbacks are stable, so a re-render never restarts them.
  const bootDone = useCallback(() => dispatch({ type: 'boot_done' }), [])
  const noticeFinished = useCallback(() => dispatch({ type: 'finish_notice' }), [])
  useVisibleTimeout(stage === 'boot' ? timings.bootMs : 0, paused, bootDone, 'boot')
  useVisibleTimeout(stage === 'notice' && !noticeDone ? timings.noticeDoneMs : 0, paused, noticeFinished, 'notice')
  useVisibleTimeout(stage === 'complete' && !closing ? timings.completeAutoMs : 0, paused, close, 'complete')

  // ACCEPT ignores taps for a moment after it appears: a double tap meant to skip the text must not accept.
  useEffect(() => {
    if (stage === 'notice' && noticeDone) {
      acceptReadyAt.current = performance.now() + timings.acceptGuardMs
      acceptRef.current?.focus({ preventScroll: true })
    }
  }, [stage, noticeDone, timings.acceptGuardMs])

  useEffect(() => {
    if (stage === 'identify') inputRef.current?.focus({ preventScroll: true })
    else if (stage === 'registering') statusRef.current?.focus({ preventScroll: true })
    else if (stage === 'complete') {
      beginReadyAt.current = performance.now() + timings.completeGuardMs
      beginRef.current?.focus({ preventScroll: true })
      runtime?.playCue('awakening')
    }
  }, [stage, runtime, timings.completeGuardMs])

  const proceed = useCallback(() => {
    if (performance.now() < beginReadyAt.current) return
    close()
  }, [close])

  // Keys: on the notice they may FINISH the text (never accept: the focused ACCEPT button does that); Escape leaves the finished screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (stage === 'notice' && !noticeDone && (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape')) {
        event.preventDefault()
        dispatch({ type: 'finish_notice' })
      } else if (stage === 'complete' && event.key === 'Escape') {
        proceed()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [stage, noticeDone, proceed])

  function onSurfaceClick(event: MouseEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest('button, a, input, label')) return
    if (stage === 'notice') dispatch({ type: 'finish_notice' }) // finishes the text; it can never accept
    else if (stage === 'complete') proceed()
  }

  function onAccept() {
    if (performance.now() < acceptReadyAt.current) return
    dispatch({ type: 'accept' })
  }

  const run = useCallback(
    async (name: string | null) => {
      if (saving.current) return
      saving.current = true
      dispatch({ type: 'submit', name })
      const startedAt = performance.now()
      let outcome: AwakeningSaveResult
      try {
        outcome = await save(name)
      } catch (error) {
        console.error('Saving the player identity failed', error)
        outcome = { status: 'failed' }
      }
      const remaining = timings.registerMinMs - (performance.now() - startedAt)
      if (outcome.status === 'saved' && remaining > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remaining))
      saving.current = false
      dispatch(saveOutcomeAction(outcome))
    },
    [save, timings.registerMinMs],
  )

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (draft.error !== null) {
      inputRef.current?.focus()
      return
    }
    if (draft.name === null) {
      setBlankTried(true)
      inputRef.current?.focus()
      return
    }
    void run(draft.name)
  }

  const Root = as
  const level = levelStateOf(0)
  const welcome = welcomeLine(playerDisplayName(state.name))
  const identifyAlert = state.problem !== null ? problemText(state.problem) : blankTried && draft.blank ? BLANK_NAME_TEXT : null

  return (
    <Root
      data-fx={mode}
      data-stage={stage}
      data-state={closing ? 'closing' : 'open'}
      onClick={onSurfaceClick}
      className="system-fx-overlay relative flex min-h-dvh w-full flex-col overflow-hidden pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-center"
    >
      <div key={stage === 'complete' ? 'high' : 'base'} aria-hidden="true" data-intensity={stage === 'complete' ? 'high' : 'normal'} className="system-fx-aura" />
      {!reduced && stage === 'boot' && <div aria-hidden="true" className="system-fx-sweep" />}
      {!reduced && stage === 'notice' && !noticeBurstDone && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <ParticleBurst count={NOTICE_PARTICLES} durationMs={1_800} style="radial" onDone={() => setNoticeBurstDone(true)} />
        </div>
      )}
      {!reduced && stage === 'complete' && !completeBurstDone && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <ParticleBurst count={COMPLETE_PARTICLES} durationMs={2_400} style="radial" onDone={() => setCompleteBurstDone(true)} />
        </div>
      )}
      {!reduced && (stage === 'complete' || stage === 'identify') && <div key={`sweep-${stage}`} aria-hidden="true" className="system-fx-sweep" />}

      <div className="relative z-10 flex min-h-0 flex-1 px-5">
        <div className="m-auto flex w-full max-w-sm flex-col items-center py-4">
          {stage === 'boot' && (
            <p role="status" className="sr-only">
              SYSTEM INITIALIZING
            </p>
          )}

          {stage === 'notice' && (
            <Panel aria-labelledby="awakening-heading" tone="accent" framed className="system-fx-reveal system-fx-trail flex w-full flex-col items-center gap-5 px-5 py-8">
              <Badge />
              <h1 id="awakening-heading" className="font-display text-2xl font-extrabold tracking-[0.1em] text-foreground [text-shadow:0_0_22px_rgb(167_139_250/0.8)]">
                <TextScramble text={AWAKENING_COPY.noticeHeading} reduced={noticeSettled} durationMs={timings.scrambleMs} />
              </h1>
              <div className="flex flex-col gap-2 font-display text-sm font-semibold tracking-[0.25em] text-accent-2">
                <p id="awakening-line-1">
                  <Typewriter text={AWAKENING_COPY.noticeLines[0]} reduced={noticeSettled} durationMs={timings.typeMs} delayMs={timings.secondLineMs} />
                </p>
                <p id="awakening-line-2">
                  <Typewriter text={AWAKENING_COPY.noticeLines[1]} reduced={noticeSettled} durationMs={timings.typeMs} delayMs={timings.thirdLineMs} />
                </p>
              </div>
              {/* The button's space is always reserved, so the panel does not jump when it appears. */}
              <div className="flex min-h-12 items-center">
                {noticeDone && (
                  <button
                    ref={acceptRef}
                    type="button"
                    onClick={onAccept}
                    aria-describedby="awakening-line-1 awakening-line-2"
                    className={cn(BUTTON_PRIMARY, 'system-fx-reveal min-h-12 px-10 font-display tracking-[0.3em]')}
                  >
                    {AWAKENING_COPY.accept}
                  </button>
                )}
              </div>
            </Panel>
          )}

          {stage === 'identify' && (
            <Panel aria-labelledby="awakening-heading" tone="accent" framed className="system-fx-reveal system-fx-trail flex w-full flex-col gap-5 px-5 py-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <Badge />
                <h1 id="awakening-heading" className="font-display text-2xl font-extrabold tracking-[0.1em] text-foreground [text-shadow:0_0_22px_rgb(167_139_250/0.8)]">
                  <TextScramble text={AWAKENING_COPY.identifyHeading} reduced={reduced} durationMs={timings.scrambleMs} />
                </h1>
              </div>
              <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
                <NameField
                  id="awakening-name"
                  label={AWAKENING_COPY.nameLabel}
                  draft={{
                    ...draft,
                    setValue: (next) => {
                      setBlankTried(false)
                      draft.setValue(next)
                    },
                  }}
                  inputRef={inputRef}
                  hint={`${NAME_HINT} ${AWAKENING_COPY.nameHint}`}
                  alert={identifyAlert}
                />
                <button type="submit" className={cn(BUTTON_PRIMARY, 'min-h-12 font-display tracking-[0.3em]')}>
                  {AWAKENING_COPY.confirm}
                </button>
                <div className="flex flex-col items-center gap-1">
                  <button type="button" onClick={() => void run(null)} className={cn(BUTTON_QUIET, 'font-display tracking-[0.3em]')}>
                    {AWAKENING_COPY.skip}
                  </button>
                  <p className="text-xs text-muted">{AWAKENING_COPY.skipHint}</p>
                </div>
              </form>
            </Panel>
          )}

          {stage === 'registering' && (
            <Panel tone="accent" framed className="system-fx-reveal flex w-full flex-col items-center gap-5 px-5 py-10">
              <Badge />
              <p ref={statusRef} tabIndex={-1} role="status" className="font-display text-sm font-semibold tracking-[0.25em] text-accent-2 outline-none">
                {AWAKENING_COPY.registering}
              </p>
            </Panel>
          )}

          {stage === 'complete' && (
            <Panel aria-labelledby="awakening-heading" tone="accent" framed className="system-fx-reveal system-fx-trail flex w-full flex-col items-center gap-5 px-5 py-10">
              <Badge />
              <h1 id="awakening-heading" className="font-display text-3xl font-extrabold tracking-[0.1em] text-foreground [text-shadow:0_0_22px_rgb(167_139_250/0.8)]">
                <TextScramble text={AWAKENING_COPY.completeHeading} reduced={reduced} durationMs={timings.scrambleMs} />
              </h1>
              <p id="awakening-welcome" dir="auto" className="font-display text-lg font-semibold tracking-[0.15em] break-words text-accent-2 uppercase [text-shadow:0_0_20px_rgb(34_211_238/0.6)]">
                <Typewriter text={welcome} reduced={reduced} durationMs={timings.typeMs} delayMs={timings.welcomeDelayMs} />
              </p>
              <p id="awakening-level" className="font-display text-xs font-semibold tracking-[0.25em] text-muted">
                LV. {level.level} · {rankLabel(level.rank)}
              </p>
              <button
                ref={beginRef}
                type="button"
                onClick={proceed}
                aria-describedby="awakening-welcome awakening-level"
                className={cn(BUTTON_PRIMARY, 'min-h-12 px-10 font-display tracking-[0.3em]')}
              >
                {AWAKENING_COPY.begin}
              </button>
            </Panel>
          )}
        </div>
      </div>
    </Root>
  )
}
