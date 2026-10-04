import { describe, expect, it } from 'vitest'
import { awakeningReducer, initialAwakeningState, type AwakeningAction, type AwakeningState } from './machine'

const fresh = () => initialAwakeningState({ skipBoot: false, noticeDone: false })
const run = (actions: readonly AwakeningAction[], from: AwakeningState = fresh()) => actions.reduce(awakeningReducer, from)

describe('Awakening state machine: stage order', () => {
  it('starts in the dark boot beat, or straight at the notice when boot is skipped (REDUCED)', () => {
    expect(fresh()).toEqual({ stage: 'boot', noticeDone: false, name: null, problem: null })
    expect(initialAwakeningState({ skipBoot: true, noticeDone: false }).stage).toBe('notice')
    expect(initialAwakeningState({ skipBoot: true, noticeDone: true })).toMatchObject({ stage: 'notice', noticeDone: true })
    // The boot beat is never "notice done": the lines have not even started.
    expect(initialAwakeningState({ skipBoot: false, noticeDone: true }).noticeDone).toBe(false)
  })

  it('walks boot → notice → identify → registering → complete in that order', () => {
    const stages: string[] = [fresh().stage]
    let state = fresh()
    for (const action of [
      { type: 'boot_done' },
      { type: 'finish_notice' },
      { type: 'accept' },
      { type: 'submit', name: 'Ada' },
      { type: 'saved', name: 'Ada' },
    ] as const) {
      const next = awakeningReducer(state, action)
      if (next.stage !== state.stage) stages.push(next.stage)
      state = next
    }
    expect(stages).toEqual(['boot', 'notice', 'identify', 'registering', 'complete'])
    expect(state).toMatchObject({ stage: 'complete', name: 'Ada' })
  })

  it('cannot skip a stage: every action out of order is ignored (the very same state object)', () => {
    const boot = fresh()
    for (const action of [{ type: 'finish_notice' }, { type: 'accept' }, { type: 'submit', name: 'Ada' }, { type: 'saved', name: 'Ada' }, { type: 'save_failed' }] as const) {
      expect(awakeningReducer(boot, action)).toBe(boot)
    }
    const notice = run([{ type: 'boot_done' }])
    for (const action of [{ type: 'boot_done' }, { type: 'submit', name: 'Ada' }, { type: 'saved', name: 'Ada' }] as const) {
      expect(awakeningReducer(notice, action)).toBe(notice)
    }
    const identify = run([{ type: 'boot_done' }, { type: 'finish_notice' }, { type: 'accept' }])
    for (const action of [{ type: 'accept' }, { type: 'finish_notice' }, { type: 'saved', name: 'Ada' }, { type: 'save_failed' }] as const) {
      expect(awakeningReducer(identify, action)).toBe(identify)
    }
  })
})

describe('Awakening state machine: a tap may finish the notice text but never accept', () => {
  const notice = run([{ type: 'boot_done' }])

  it('ACCEPT is refused until the notice text has finished', () => {
    expect(awakeningReducer(notice, { type: 'accept' })).toBe(notice)
  })

  it('finishing the text keeps the player on the notice stage', () => {
    const done = awakeningReducer(notice, { type: 'finish_notice' })
    expect(done).toMatchObject({ stage: 'notice', noticeDone: true })
  })

  it('once ACCEPT is shown, any number of further finish/skip events change nothing and do NOT enter identify', () => {
    const done = awakeningReducer(notice, { type: 'finish_notice' })
    let state = done
    for (let index = 0; index < 5; index += 1) state = awakeningReducer(state, { type: 'finish_notice' })
    expect(state).toBe(done)
    expect(state.stage).toBe('notice')
  })

  it('only the explicit accept action enters identify', () => {
    expect(run([{ type: 'finish_notice' }, { type: 'accept' }], notice).stage).toBe('identify')
  })
})

describe('Awakening state machine: saving', () => {
  const identify = run([{ type: 'boot_done' }, { type: 'finish_notice' }, { type: 'accept' }])

  it('Skip is a submit with no name', () => {
    expect(awakeningReducer(identify, { type: 'submit', name: null })).toMatchObject({ stage: 'registering', name: null })
  })

  it('a second submit while registering is ignored (a double tap cannot save twice)', () => {
    const registering = awakeningReducer(identify, { type: 'submit', name: 'Ada' })
    expect(awakeningReducer(registering, { type: 'submit', name: 'Bob' })).toBe(registering)
    expect(registering.name).toBe('Ada')
  })

  it('a failed save returns to identify with the problem, and does not advance', () => {
    const registering = awakeningReducer(identify, { type: 'submit', name: 'Ada' })
    expect(awakeningReducer(registering, { type: 'save_failed' })).toMatchObject({ stage: 'identify', problem: 'save_failed' })
    expect(awakeningReducer(registering, { type: 'save_rejected', reason: 'too_long' })).toMatchObject({ stage: 'identify', problem: 'too_long' })
  })

  it('submitting again clears the problem; saved ends in complete with the stored name', () => {
    const failed = run([{ type: 'submit', name: 'Ada' }, { type: 'save_failed' }], identify)
    const again = awakeningReducer(failed, { type: 'submit', name: 'Ada' })
    expect(again).toMatchObject({ stage: 'registering', problem: null })
    expect(awakeningReducer(again, { type: 'saved', name: 'Ada' })).toMatchObject({ stage: 'complete', name: 'Ada' })
  })

  it('complete is final: nothing leaves it', () => {
    const complete = run([{ type: 'submit', name: 'Ada' }, { type: 'saved', name: 'Ada' }], identify)
    for (const action of [{ type: 'boot_done' }, { type: 'accept' }, { type: 'submit', name: 'x' }, { type: 'save_failed' }, { type: 'saved', name: 'y' }] as const) {
      expect(awakeningReducer(complete, action)).toBe(complete)
    }
  })
})
