import { describe, expect, it } from 'vitest'
import { welcomeTyping } from './welcomeTyping'

const label = 'WELCOME,'

describe('welcomeTyping: the label is typed first, the name right after it', () => {
  it('shares the usual typing time between the label and the name, in proportion to their length', () => {
    const typing = welcomeTyping({ label, name: 'Ada', typeMs: 1_100, delayMs: 0 })
    expect(typing).toEqual({ labelMs: 800, nameDelayMs: 800, nameMs: 300 }) // 8 of 11 characters are the label
  })

  it('the two always add up to the total typing time, whatever the name', () => {
    for (const name of ['A', 'Ada', 'Ada Lovelace', 'אדי', 'علي', '🐺🐺🐺', 'W'.repeat(20)]) {
      for (const typeMs of [0, 1, 600, 900, 60_000]) {
        const typing = welcomeTyping({ label, name, typeMs, delayMs: 250 })
        expect(typing.labelMs + typing.nameMs).toBe(typeMs)
        expect(typing.labelMs).toBeGreaterThanOrEqual(0)
        expect(typing.nameMs).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('the name never starts before the label has finished: its delay is the line delay plus the whole label', () => {
    for (const delayMs of [0, 600, 1_000]) {
      const typing = welcomeTyping({ label, name: 'Ada Lovelace', typeMs: 600, delayMs })
      expect(typing.nameDelayMs).toBe(delayMs + typing.labelMs)
      expect(typing.nameDelayMs).toBeGreaterThanOrEqual(delayMs)
    }
  })

  it('counts what a person sees (code points), so an emoji or an RTL name is not over-weighted', () => {
    expect(welcomeTyping({ label, name: '🐺🐺', typeMs: 1_000, delayMs: 0 }).nameMs).toBe(welcomeTyping({ label, name: 'ab', typeMs: 1_000, delayMs: 0 }).nameMs)
  })

  it('REDUCED (no typing time) gives zero everywhere, so the line is simply there', () => {
    expect(welcomeTyping({ label, name: 'אדי', typeMs: 0, delayMs: 0 })).toEqual({ labelMs: 0, nameDelayMs: 0, nameMs: 0 })
  })

  it('a negative time is treated as none, never as a negative duration', () => {
    const typing = welcomeTyping({ label, name: 'Ada', typeMs: -50, delayMs: 0 })
    expect(typing.labelMs).toBe(0)
    expect(typing.nameMs).toBe(0)
  })
})
