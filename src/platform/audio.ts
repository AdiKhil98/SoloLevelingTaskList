/**
 * The one Web Audio context the app may use for its synthesized cues, created
 * lazily and only after the player turned sound on (a user gesture), because
 * browsers keep an audio context suspended until then. Everything is best
 * effort: no audio support, a blocked context or a failed resume means silence,
 * never an error.
 *
 * This module imports no other layer; it returns the context for the effects
 * layer's pure scheduler to play on.
 */

interface WebAudioWindow {
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
}

let shared: AudioContext | null = null

/** The shared context, created on first use, or null where Web Audio is unavailable. */
export function getAudioContext(): AudioContext | null {
  if (shared !== null) return shared
  try {
    const scope = window as unknown as WebAudioWindow
    const Constructor = scope.AudioContext ?? scope.webkitAudioContext
    if (Constructor === undefined) return null
    shared = new Constructor()
    return shared
  } catch {
    return null
  }
}

/**
 * Creates the context if needed and asks it to run. Call from a user gesture
 * (the sound toggle, a tap). Resolves to whether sound can play now.
 */
export async function primeAudio(): Promise<boolean> {
  const context = getAudioContext()
  if (context === null) return false
  try {
    if (context.state === 'suspended') await context.resume()
    return context.state === 'running'
  } catch {
    return false
  }
}
