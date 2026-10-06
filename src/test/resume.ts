import { act, waitFor } from '@testing-library/react'

/**
 * "The player came back" tests.
 *
 * The app hears a resume (`window` focus / pageshow, `document` visibilitychange) through listeners that
 * `useDaySync` attaches in an effect. That effect runs after the screen first paints and nothing in the DOM says
 * when, so a test that finds a heading and immediately dispatches `focus` can send the event before anyone is
 * listening. The event is then lost, the app never reconciles, and the test either times out (a positive check) or
 * passes without proving anything (a "nothing changes" check). How often this happens depends on how loaded the
 * machine is.
 *
 * `trackResumeListeners` (installed once by `setup.ts`) records which resume listeners are attached, so a test can wait
 * for the real precondition ("the app is listening") instead of a delay, and then deliver the event.
 *
 * Only `useDaySync` attaches window `focus` and `pageshow` listeners, so their presence means it is listening.
 */

const attached = {
  focus: new Set<unknown>(),
  pageshow: new Set<unknown>(),
}

type TrackedType = keyof typeof attached

const isTracked = (type: string): type is TrackedType => type === 'focus' || type === 'pageshow'

/** Wraps `window.addEventListener` / `removeEventListener` to remember the focus and pageshow listeners. Idempotent. */
export function trackResumeListeners(): void {
  const marker = '__resumeListenersTracked'
  const target = window as unknown as Record<string, unknown>
  if (target[marker] === true) return
  target[marker] = true

  // jsdom's window is its own receiver (the EventTarget prototype methods reject it), so bind the window's own methods.
  const add = window.addEventListener.bind(window) as (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => void
  const remove = window.removeEventListener.bind(window) as (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => void
  window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    if (listener !== null && isTracked(type)) attached[type].add(listener)
    add(type, listener, options)
  }) as typeof window.addEventListener
  window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => {
    if (listener !== null && isTracked(type)) attached[type].delete(listener)
    remove(type, listener, options)
  }) as typeof window.removeEventListener
}

/** True once the app's resume listeners are attached. */
export const resumeListenersAttached = (): boolean => attached.focus.size > 0 && attached.pageshow.size > 0

/** Resolves when the app is listening for a resume (a precondition, not a retry of the action). */
export function appIsListeningForResume(): Promise<void> {
  return waitFor(() => {
    if (!resumeListenersAttached()) throw new Error('The app has not attached its resume listeners yet')
  })
}

/**
 * Waits until the app is listening, then delivers a resume: window `focus`, plus `visibilitychange` when asked
 * (a phone coming back from the background fires both). Everything the event starts is awaited by the caller's next
 * `waitFor`/`findBy`, as before.
 */
export async function resumeApp({ withVisibilityChange = false }: { readonly withVisibilityChange?: boolean } = {}): Promise<void> {
  await appIsListeningForResume()
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
    if (withVisibilityChange) document.dispatchEvent(new Event('visibilitychange'))
  })
}
