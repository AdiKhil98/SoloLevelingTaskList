import type { PlayerNameErrorCode } from '@/domain'

/**
 * The Player Awakening state machine (Phase 11): pure, with no timers, DOM or
 * storage. It only says which stage the screen is in and which transitions are
 * allowed; the screen asks the application to save, and reports back here.
 *
 *   boot → notice → identify → registering → complete
 *                      ↑____________|  (a save that failed or was refused)
 *
 * The order cannot be skipped: an action that does not belong to the current
 * stage is ignored (the same state comes back), which is also what makes a
 * double-tap harmless. Nothing here decides whether the player IS awakened:
 * that is the stored profile row, written by the application layer.
 */

export type AwakeningStage = 'boot' | 'notice' | 'identify' | 'registering' | 'complete'

/** Why the identify stage is showing again after an attempt to save. */
export type AwakeningProblem = 'save_failed' | PlayerNameErrorCode

export interface AwakeningState {
  readonly stage: AwakeningStage
  /** NOTICE: every line has arrived (or was finished by a tap), so ACCEPT is shown. */
  readonly noticeDone: boolean
  /** The name being saved (null = Skip) while `registering`; the saved name once `complete`. */
  readonly name: string | null
  readonly problem: AwakeningProblem | null
}

export type AwakeningAction =
  | { readonly type: 'boot_done' }
  /** The notice text finished by itself, or the player tapped to finish it. NEVER accepts. */
  | { readonly type: 'finish_notice' }
  /** The explicit activation of the ACCEPT button. The only way into the identify stage. */
  | { readonly type: 'accept' }
  | { readonly type: 'submit'; readonly name: string | null }
  | { readonly type: 'save_failed' }
  | { readonly type: 'save_rejected'; readonly reason: PlayerNameErrorCode }
  | { readonly type: 'saved'; readonly name: string | null }

export function initialAwakeningState({ skipBoot, noticeDone }: { skipBoot: boolean; noticeDone: boolean }): AwakeningState {
  return { stage: skipBoot ? 'notice' : 'boot', noticeDone: skipBoot && noticeDone, name: null, problem: null }
}

export function awakeningReducer(state: AwakeningState, action: AwakeningAction): AwakeningState {
  switch (action.type) {
    case 'boot_done':
      return state.stage === 'boot' ? { ...state, stage: 'notice', noticeDone: false } : state
    case 'finish_notice':
      // A tap, a key or the timer may finish the text. It stays on the notice: ACCEPT is a separate, explicit step.
      return state.stage === 'notice' && !state.noticeDone ? { ...state, noticeDone: true } : state
    case 'accept':
      return state.stage === 'notice' && state.noticeDone ? { ...state, stage: 'identify', problem: null } : state
    case 'submit':
      return state.stage === 'identify' ? { ...state, stage: 'registering', name: action.name, problem: null } : state
    case 'save_failed':
      return state.stage === 'registering' ? { ...state, stage: 'identify', problem: 'save_failed' } : state
    case 'save_rejected':
      return state.stage === 'registering' ? { ...state, stage: 'identify', problem: action.reason } : state
    case 'saved':
      return state.stage === 'registering' ? { ...state, stage: 'complete', name: action.name, problem: null } : state
  }
}
