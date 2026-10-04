import { describe, expect, it } from 'vitest'
import { HAPTIC_PATTERNS, hapticPatternFor } from './haptics'
import { cueDuration, MASTER_VOLUME, scheduleCue, SOUND_SCORES, type AudioContextLike, type GainLike, type OscillatorLike } from './sound'
import { easeOutCubic, interpolateWhole, scrambleFrame, typedPrefix } from './text'
import type { Cue } from './types'

const CUES: readonly Cue[] = ['quest', 'quest_strong', 'achievement', 'perfect_day', 'level_up', 'weekly_result', 'rank_up', 'perfect_week']
const total = (pattern: readonly number[]) => pattern.reduce((sum, ms) => sum + ms, 0)

describe('haptic patterns (OD-07)', () => {
  it('every cue has a non-empty pattern of positive durations', () => {
    for (const cue of CUES) {
      const pattern = hapticPatternFor(cue)
      expect(pattern.length).toBeGreaterThan(0)
      expect(pattern.every((ms) => Number.isInteger(ms) && ms > 0)).toBe(true)
    }
    expect(Object.keys(HAPTIC_PATTERNS).sort()).toEqual([...CUES].sort())
  })

  it('scales with the moment: quest light, achievement and level medium, rank and perfect week stronger', () => {
    expect(hapticPatternFor('quest')).toEqual([15])
    expect(total(hapticPatternFor('quest'))).toBeLessThan(total(hapticPatternFor('achievement')))
    expect(total(hapticPatternFor('achievement'))).toBeLessThanOrEqual(total(hapticPatternFor('level_up')))
    expect(total(hapticPatternFor('level_up'))).toBeLessThan(total(hapticPatternFor('rank_up')))
    expect(total(hapticPatternFor('rank_up'))).toBeLessThan(total(hapticPatternFor('perfect_week')))
  })
})

/** A recording stand-in for the Web Audio parts the scheduler uses. */
function fakeAudio() {
  const log: { oscillators: { type: string; start: number; stop: number; frequencies: number[] }[]; masterGains: number[]; connected: string[] } = {
    oscillators: [],
    masterGains: [],
    connected: [],
  }
  const param = (onSet?: (value: number) => void) => ({
    setValueAtTime: (value: number) => onSet?.(value),
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: (value: number) => onSet?.(value),
  })
  const destination = { name: 'destination' }
  let gainCount = 0
  const context: AudioContextLike = {
    currentTime: 10,
    destination,
    createOscillator: (): OscillatorLike => {
      const entry = { type: '', start: -1, stop: -1, frequencies: [] as number[] }
      log.oscillators.push(entry)
      return {
        get type() {
          return entry.type
        },
        set type(value: string) {
          entry.type = value
        },
        frequency: param((value) => entry.frequencies.push(value)),
        connect: () => undefined,
        start: (time: number) => void (entry.start = time),
        stop: (time: number) => void (entry.stop = time),
      }
    },
    createGain: (): GainLike => {
      gainCount += 1
      const isMaster = gainCount === 1
      return {
        gain: param((value) => {
          if (isMaster) log.masterGains.push(value)
        }),
        connect: (target: unknown) => {
          if (isMaster) log.connected.push(target === destination ? 'destination' : 'other')
        },
      }
    },
  }
  return { context, log }
}

describe('synthesized sound (OD-06): original tones, no assets', () => {
  it('every cue has a score of audible notes and a duration', () => {
    for (const cue of CUES) {
      expect(SOUND_SCORES[cue].length).toBeGreaterThan(0)
      for (const tone of SOUND_SCORES[cue]) {
        expect(tone.frequency).toBeGreaterThan(20)
        expect(tone.duration).toBeGreaterThan(0)
        expect(tone.gain).toBeGreaterThan(0)
        expect(tone.gain).toBeLessThanOrEqual(1)
      }
      expect(cueDuration(cue)).toBeGreaterThan(0)
    }
  })

  it('heavier moments last longer', () => {
    expect(cueDuration('quest')).toBeLessThan(cueDuration('level_up'))
    expect(cueDuration('level_up')).toBeLessThan(cueDuration('perfect_week'))
  })

  it('schedules one oscillator per note, starting at the cue time, through a quiet master gain to the output', () => {
    const { context, log } = fakeAudio()
    const seconds = scheduleCue(context, 'level_up')
    expect(log.oscillators).toHaveLength(SOUND_SCORES.level_up.length)
    expect(log.oscillators[0]?.start).toBe(10)
    for (const oscillator of log.oscillators) {
      expect(oscillator.start).toBeGreaterThanOrEqual(10)
      expect(oscillator.stop).toBeGreaterThan(oscillator.start)
    }
    expect(log.masterGains[0]).toBe(MASTER_VOLUME)
    expect(MASTER_VOLUME).toBeLessThanOrEqual(0.25)
    expect(log.connected).toEqual(['destination'])
    expect(seconds).toBe(cueDuration('level_up'))
  })

  it('a gliding note ramps its pitch', () => {
    const { context, log } = fakeAudio()
    scheduleCue(context, 'rank_up')
    const glide = SOUND_SCORES.rank_up.findIndex((tone) => tone.endFrequency !== undefined)
    expect(glide).toBeGreaterThanOrEqual(0)
    expect(log.oscillators[glide]?.frequencies).toEqual([SOUND_SCORES.rank_up[glide]?.frequency, SOUND_SCORES.rank_up[glide]?.endFrequency])
  })
})

describe('text effect helpers', () => {
  const random = () => 0.5

  it('scramble ends as exactly the text and keeps spaces, punctuation and symbols in place', () => {
    expect(scrambleFrame('LEVEL UP', 1, random)).toBe('LEVEL UP')
    const frame = scrambleFrame('E-RANK → ???', 0, random)
    expect(frame).toHaveLength('E-RANK → ???'.length)
    expect(frame[1]).toBe('-')
    expect(frame[6]).toBe(' ')
    expect(frame.endsWith('→ ???')).toBe(true)
  })

  it('scramble reveals from the start as progress grows and never changes the length', () => {
    const text = 'RANK ADVANCEMENT'
    const half = scrambleFrame(text, 0.5, random)
    expect(half.startsWith(text.slice(0, 8))).toBe(true)
    expect(half).toHaveLength(text.length)
  })

  it('treats nonsense progress as the start', () => {
    expect(scrambleFrame('AB', Number.NaN, random)).toHaveLength(2)
    expect(typedPrefix('AB', Number.NaN)).toBe('')
  })

  it('typewriter reveals a growing prefix and ends as exactly the text (by code point)', () => {
    expect(typedPrefix('SYSTEM', 0)).toBe('')
    expect(typedPrefix('SYSTEM', 0.5)).toBe('SYS')
    expect(typedPrefix('SYSTEM', 1)).toBe('SYSTEM')
    expect(typedPrefix('A→B', 1)).toBe('A→B')
  })

  it('counts whole EXP numbers with an easing that starts fast and lands exactly', () => {
    expect(interpolateWhole(0, 225, 0)).toBe(0)
    expect(interpolateWhole(0, 225, 1)).toBe(225)
    expect(Number.isInteger(interpolateWhole(10, 99, 0.37))).toBe(true)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})
