/**
 * Whether the app is running inside the Android app shell (the Capacitor APK) rather than in a browser tab or an
 * installed PWA. The shell injects a `Capacitor` global before any page script runs; the app never imports Capacitor,
 * so a plain browser build carries nothing of it and this is simply `false` there.
 *
 * It exists only to switch OFF infrastructure the APK does not need (the service worker and its update notice: the
 * APK already holds every file, and an update arrives as a new APK; the OFFLINE marker: the app never needs a
 * network). It must never decide anything about gameplay or data.
 *
 * Never throws. This module imports no other layer.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
}

export function isNativeApp(): boolean {
  try {
    const capacitor = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
    return typeof capacitor?.isNativePlatform === 'function' && capacitor.isNativePlatform() === true
  } catch {
    return false
  }
}
