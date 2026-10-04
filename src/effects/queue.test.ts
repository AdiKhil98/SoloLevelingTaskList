import { describe, expect, it, vi } from 'vitest'
import { asDateKey, asWeekKey } from '@/domain'
import { createPresentationController } from './controller'
import { EMPTY_QUEUE, MAX_PENDING, MAX_SEEN, queueReducer, selectHudHold, firstHeldEntryId, type QueueAction, type QueueState } from './queue'
import type { PresentationEntry } from './types'

let counter = 0
const id = () => `e${(counter += 1)}`

const minor = (entryId = id()): PresentationEntry => ({ kind: 'quest_feedback', class: 'minor', id: entryId, origin: 'action', cue: 'quest', occurrenceId: entryId, amount: 10, strength: 'base' })
const medium = (entryId = id()): PresentationEntry => ({ kind: 'perfect_day', class: 'medium', id: entryId, origin: 'action', cue: 'perfect_day', dateKey: asDateKey('2026-10-05') })
const major = (entryId = id(), withHold = true): PresentationEntry => ({
  kind: 'progression',
  class: 'major',
  id: entryId,
  origin: 'action',
  cue: 'level_up',
  level: { from: 1, to: 2, levelsCrossed: [2] },
  rank: null,
  expGained: 50,
  hold: withHold ? { level: 1, rank: 'E', expToNext: 100 } : null,
})
const critical = (entryId = id()): PresentationEntry => ({
  kind: 'weekly_result',
  class: 'critical',
  id: entryId,
  origin: 'lifecycle',
  cue: 'perfect_week',
  tier: 'perfect',
  weekKey: asWeekKey('2026-09-28'),
  score: 10,
  bonusExp: 500,
  rewardTierMinScore: 10,
})

const run = (state: QueueState, ...actions: QueueAction[]) => actions.reduce(queueReducer, state)
const enqueue = (...entries: PresentationEntry[]): QueueAction => ({ type: 'enqueue', entries })
const ids = (entries: readonly PresentationEntry[]) => entries.map((entry) => entry.id)

describe('deduplication', () => {
  it('ignores an entry whose id was already enqueued, in one batch or across batches', () => {
    const a = medium('same')
    const state = run(EMPTY_QUEUE, enqueue(a, a), enqueue(medium('same')))
    expect(ids(state.pending)).toEqual(['same'])
  })

  it('still ignores it after it was shown and finished', () => {
    const a = medium('shown')
    const state = run(EMPTY_QUEUE, enqueue(a), { type: 'start_next' }, { type: 'finish', id: 'shown' }, enqueue(medium('shown')))
    expect(state.active).toBeNull()
    expect(state.pending).toEqual([])
  })

  it('still ignores it after the queue was cleared', () => {
    const state = run(EMPTY_QUEUE, enqueue(medium('gone')), { type: 'clear' }, enqueue(medium('gone')))
    expect(state.pending).toEqual([])
  })

  it('remembers a bounded number of ids', () => {
    const entries = Array.from({ length: MAX_SEEN + 20 }, () => minor())
    const state = run(EMPTY_QUEUE, enqueue(...entries))
    expect(state.seen).toHaveLength(MAX_SEEN)
  })
})

describe('ordering and concurrency', () => {
  it('shows medium, major and critical entries one at a time, first in first out', () => {
    const [m, j, c] = [medium(), major(), critical()]
    let state = run(EMPTY_QUEUE, enqueue(m, j, c), { type: 'start_next' })
    expect(state.active?.id).toBe(m.id)
    expect(ids(state.pending)).toEqual([j.id, c.id])

    state = run(state, { type: 'start_next' }) // nothing starts while one is showing
    expect(state.active?.id).toBe(m.id)

    state = run(state, { type: 'finish', id: m.id }, { type: 'start_next' })
    expect(state.active?.id).toBe(j.id)
    state = run(state, { type: 'finish', id: j.id }, { type: 'start_next' })
    expect(state.active?.id).toBe(c.id)
  })

  it('a modal overlay never preempts the entry that is already showing, and holds lighter ones behind it', () => {
    const [popup, overlay, later] = [medium(), critical(), medium()]
    let state = run(EMPTY_QUEUE, enqueue(popup), { type: 'start_next' }, enqueue(overlay, later))
    expect(state.active?.id).toBe(popup.id) // not preempted
    state = run(state, { type: 'finish', id: popup.id }, { type: 'start_next' })
    expect(state.active?.id).toBe(overlay.id)
    expect(ids(state.pending)).toEqual([later.id]) // paused behind the overlay
  })

  it('finish only closes the entry that is actually showing', () => {
    const state = run(EMPTY_QUEUE, enqueue(medium('a')), { type: 'start_next' }, { type: 'finish', id: 'not-a' })
    expect(state.active?.id).toBe('a')
  })

  it('start_next does nothing when nothing waits', () => {
    expect(run(EMPTY_QUEUE, { type: 'start_next' })).toBe(EMPTY_QUEUE)
  })
})

describe('minor feedback', () => {
  it('runs beside a calm screen and beside a popup, and is not queued behind them', () => {
    let state = run(EMPTY_QUEUE, enqueue(medium('p')), { type: 'start_next' }, enqueue(minor('m1')))
    expect(ids(state.minor)).toEqual(['m1'])
    expect(state.active?.id).toBe('p')
    state = run(state, { type: 'expire_minor', id: 'm1' })
    expect(state.minor).toEqual([])
  })

  it('is dropped while a major or critical overlay is on screen', () => {
    const state = run(EMPTY_QUEUE, enqueue(critical('big')), { type: 'start_next' }, enqueue(minor('late')))
    expect(state.minor).toEqual([])
  })

  it('its inline feedback ends when a modal overlay opens over it', () => {
    const state = run(EMPTY_QUEUE, enqueue(minor('m'), major('lv')), { type: 'start_next' })
    expect(state.active?.id).toBe('lv')
    expect(state.minor).toEqual([])
  })

  it('expiring an unknown id changes nothing', () => {
    const state = run(EMPTY_QUEUE, enqueue(minor('m')))
    expect(queueReducer(state, { type: 'expire_minor', id: 'other' })).toBe(state)
  })
})

describe('the bound', () => {
  it('drops the oldest medium entry first when the line is too long, and never a major or critical one', () => {
    const keep = [major('keep-major'), critical('keep-critical')]
    const mediums = Array.from({ length: MAX_PENDING }, (_, index) => medium(`m${index}`))
    const state = run(EMPTY_QUEUE, enqueue(...keep, ...mediums))
    expect(state.pending).toHaveLength(MAX_PENDING)
    expect(ids(state.pending)).toContain('keep-major')
    expect(ids(state.pending)).toContain('keep-critical')
    expect(ids(state.pending)).not.toContain('m0') // the oldest medium went first
    expect(ids(state.pending)).not.toContain('m1')
  })

  it('never drops modal entries, even past the bound', () => {
    const modals = Array.from({ length: MAX_PENDING + 3 }, (_, index) => (index % 2 === 0 ? major(`j${index}`) : critical(`c${index}`)))
    expect(run(EMPTY_QUEUE, enqueue(...modals)).pending).toHaveLength(MAX_PENDING + 3)
  })
})

describe('the HUD hold', () => {
  it('is the state before the first unrevealed Level Up, and holds until the overlay reports it is open', () => {
    let state = run(EMPTY_QUEUE, enqueue(medium('p'), major('lv')))
    expect(selectHudHold(state)).toEqual({ level: 1, rank: 'E', expToNext: 100 })
    expect(firstHeldEntryId(state)).toBe('lv')
    state = run(state, { type: 'start_next' }, { type: 'finish', id: 'p' }, { type: 'start_next' }) // the Level Up is now the active entry…
    expect(state.active?.id).toBe('lv')
    expect(selectHudHold(state)).toEqual({ level: 1, rank: 'E', expToNext: 100 }) // …but its overlay may still be loading: still held
    state = run(state, { type: 'release_hold', id: 'lv' }) // the overlay mounted
    expect(selectHudHold(state)).toBeNull()
    expect(state.active?.id).toBe('lv') // the reveal itself carries on
  })

  it('releasing an entry that holds nothing changes nothing', () => {
    const state = run(EMPTY_QUEUE, enqueue(medium('p'), major('nohold', false)))
    expect(queueReducer(state, { type: 'release_hold', id: 'p' })).toBe(state)
    expect(queueReducer(state, { type: 'release_hold', id: 'nohold' })).toBe(state)
    expect(queueReducer(state, { type: 'release_hold', id: 'unknown' })).toBe(state)
  })

  it('can be released early, and then the real level shows', () => {
    const state = run(EMPTY_QUEUE, enqueue(major('lv')), { type: 'release_hold', id: 'lv' })
    expect(selectHudHold(state)).toBeNull()
    expect(firstHeldEntryId(state)).toBeNull()
    expect(ids(state.pending)).toEqual(['lv']) // the reveal itself still happens
  })

  it('does not exist for an entry without a hold, or when nothing waits', () => {
    expect(selectHudHold(EMPTY_QUEUE)).toBeNull()
    expect(selectHudHold(run(EMPTY_QUEUE, enqueue(major('nohold', false))))).toBeNull()
  })

  it('ends if the held entry is dropped from the line', () => {
    const state = run(EMPTY_QUEUE, enqueue(major('lv')), { type: 'clear' })
    expect(selectHudHold(state)).toBeNull()
  })
})

describe('createPresentationController', () => {
  it('notifies subscribers only when the state really changes, and keeps the same state object otherwise', () => {
    const controller = createPresentationController()
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)

    controller.enqueue([medium('a')])
    expect(listener).toHaveBeenCalledTimes(1)
    const before = controller.getState()

    controller.enqueue([medium('a')]) // a duplicate: no change
    controller.dispatch({ type: 'finish', id: 'nothing' })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(controller.getState()).toBe(before)

    unsubscribe()
    controller.enqueue([medium('b')])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
