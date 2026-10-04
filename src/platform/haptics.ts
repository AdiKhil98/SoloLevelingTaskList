/**
 * Vibration, best effort. A device or browser without the Vibration API (iOS
 * Safari, desktops) simply does nothing, and no failure here may ever reach
 * gameplay. Chrome ignores `navigator.vibrate` until the page has had a user
 * gesture and logs a console intervention if it is called anyway, so a call
 * before the first tap is skipped silently.
 *
 * This module imports no other layer; the patterns are passed in.
 */

interface VibrationNavigator {
  vibrate?: (pattern: number | number[]) => boolean
  userActivation?: { hasBeenActive: boolean }
}

/** True when the Vibration API exists (it says nothing about whether the device has a motor). */
export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as VibrationNavigator).vibrate === 'function'
}

/** Vibrates with `pattern` (ms on, off, on, …). Returns whether the call was made; never throws. */
export function vibrate(pattern: readonly number[]): boolean {
  try {
    if (!canVibrate()) return false
    const device = navigator as VibrationNavigator
    if (device.userActivation !== undefined && !device.userActivation.hasBeenActive) return false
    return device.vibrate?.([...pattern]) ?? false
  } catch {
    return false
  }
}
