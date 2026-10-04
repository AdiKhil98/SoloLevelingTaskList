import type { Cue } from './types'

/**
 * Original, synthesized sound cues (OD-06). Nothing is downloaded or bundled:
 * each cue is a few oscillator notes scheduled on a Web Audio context at the
 * moment it plays, so there is no asset to license and no file to cache. Sound
 * is OFF by default; this module only describes and schedules the notes.
 */

export interface Tone {
  /** Seconds after the cue starts. */
  readonly at: number
  readonly frequency: number
  /** If set, the pitch glides to this frequency over the note. */
  readonly endFrequency?: number
  readonly duration: number
  readonly wave: 'sine' | 'triangle' | 'square' | 'sawtooth'
  /** Peak gain 0–1 before the master volume. */
  readonly gain: number
}

/** Quiet by design: a SYSTEM chime, not a game fanfare. */
export const MASTER_VOLUME = 0.16

export const SOUND_SCORES: Readonly<Record<Cue, readonly Tone[]>> = {
  quest: [
    { at: 0, frequency: 880, duration: 0.09, wave: 'sine', gain: 0.5 },
    { at: 0.06, frequency: 1320, duration: 0.12, wave: 'sine', gain: 0.35 },
  ],
  quest_strong: [
    { at: 0, frequency: 660, duration: 0.1, wave: 'sine', gain: 0.5 },
    { at: 0.07, frequency: 990, duration: 0.12, wave: 'sine', gain: 0.4 },
    { at: 0.14, frequency: 1320, duration: 0.16, wave: 'triangle', gain: 0.35 },
  ],
  achievement: [
    { at: 0, frequency: 784, duration: 0.18, wave: 'triangle', gain: 0.45 },
    { at: 0.16, frequency: 1175, duration: 0.3, wave: 'sine', gain: 0.4 },
  ],
  perfect_day: [
    { at: 0, frequency: 659, duration: 0.16, wave: 'triangle', gain: 0.4 },
    { at: 0.14, frequency: 880, duration: 0.16, wave: 'triangle', gain: 0.4 },
    { at: 0.28, frequency: 1318, duration: 0.34, wave: 'sine', gain: 0.4 },
  ],
  level_up: [
    { at: 0, frequency: 392, duration: 0.2, wave: 'triangle', gain: 0.45 },
    { at: 0.14, frequency: 523, duration: 0.2, wave: 'triangle', gain: 0.45 },
    { at: 0.28, frequency: 659, duration: 0.2, wave: 'triangle', gain: 0.45 },
    { at: 0.42, frequency: 1047, duration: 0.55, wave: 'sine', gain: 0.45 },
  ],
  weekly_result: [
    { at: 0, frequency: 523, duration: 0.22, wave: 'triangle', gain: 0.45 },
    { at: 0.18, frequency: 784, duration: 0.22, wave: 'triangle', gain: 0.45 },
    { at: 0.36, frequency: 1047, duration: 0.5, wave: 'sine', gain: 0.4 },
  ],
  rank_up: [
    { at: 0, frequency: 110, endFrequency: 220, duration: 0.7, wave: 'sawtooth', gain: 0.18 },
    { at: 0.3, frequency: 392, duration: 0.5, wave: 'triangle', gain: 0.4 },
    { at: 0.3, frequency: 587, duration: 0.5, wave: 'triangle', gain: 0.3 },
    { at: 0.62, frequency: 784, duration: 0.9, wave: 'sine', gain: 0.45 },
    { at: 0.62, frequency: 1175, duration: 0.9, wave: 'sine', gain: 0.3 },
  ],
  perfect_week: [
    { at: 0, frequency: 110, endFrequency: 262, duration: 0.8, wave: 'sawtooth', gain: 0.18 },
    { at: 0.3, frequency: 523, duration: 0.35, wave: 'triangle', gain: 0.4 },
    { at: 0.5, frequency: 659, duration: 0.35, wave: 'triangle', gain: 0.4 },
    { at: 0.7, frequency: 784, duration: 0.35, wave: 'triangle', gain: 0.4 },
    { at: 0.9, frequency: 1047, duration: 1.1, wave: 'sine', gain: 0.45 },
    { at: 0.9, frequency: 1568, duration: 1.1, wave: 'sine', gain: 0.25 },
  ],
}

/** Seconds a cue lasts, including its last note's tail. */
export function cueDuration(cue: Cue): number {
  return SOUND_SCORES[cue].reduce((end, tone) => Math.max(end, tone.at + tone.duration), 0)
}

/** The few parts of Web Audio the scheduler touches (a real `AudioContext` satisfies them). */
export interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown
  linearRampToValueAtTime(value: number, time: number): unknown
  exponentialRampToValueAtTime(value: number, time: number): unknown
}
export interface AudioNodeLike {
  connect(destination: unknown): unknown
}
export interface OscillatorLike extends AudioNodeLike {
  type: string
  readonly frequency: AudioParamLike
  start(time: number): void
  stop(time: number): void
}
export interface GainLike extends AudioNodeLike {
  readonly gain: AudioParamLike
}
export interface AudioContextLike {
  readonly currentTime: number
  readonly destination: unknown
  createOscillator(): OscillatorLike
  createGain(): GainLike
}

const ATTACK_SECONDS = 0.012
const SILENCE = 0.0001

/**
 * Schedules a cue on `context` starting now. Pure scheduling: it creates nodes
 * and sets their envelopes; it reads no clock and plays nothing by itself
 * beyond what the context renders. Returns the seconds the cue lasts.
 */
export function scheduleCue(context: AudioContextLike, cue: Cue, volume: number = MASTER_VOLUME): number {
  const master = context.createGain()
  master.gain.setValueAtTime(volume, context.currentTime)
  master.connect(context.destination)

  const start = context.currentTime
  for (const tone of SOUND_SCORES[cue]) {
    const begin = start + tone.at
    const end = begin + tone.duration
    const oscillator = context.createOscillator()
    oscillator.type = tone.wave
    oscillator.frequency.setValueAtTime(tone.frequency, begin)
    if (tone.endFrequency !== undefined) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end)

    const envelope = context.createGain()
    envelope.gain.setValueAtTime(SILENCE, begin)
    envelope.gain.linearRampToValueAtTime(tone.gain, begin + ATTACK_SECONDS)
    envelope.gain.exponentialRampToValueAtTime(SILENCE, end)

    oscillator.connect(envelope)
    envelope.connect(master)
    oscillator.start(begin)
    oscillator.stop(end + 0.03)
  }
  return cueDuration(cue)
}
