import type { PlayerNameErrorCode } from '@/domain'

/** What saving the player's identity reported back to the Awakening screen. */
export type AwakeningSaveResult =
  /** Written (or already written by another tab). `name` is the STORED name: the screen shows this one. */
  | { readonly status: 'saved'; readonly name: string | null }
  /** The name was refused (the screen validates first, so this is rare). Nothing was saved. */
  | { readonly status: 'rejected'; readonly reason: PlayerNameErrorCode }
  /** Nothing was saved, so onboarding is not complete and the screen does not advance. */
  | { readonly status: 'failed' }

export interface AwakeningFlowProps {
  /** Saves the identity: the typed name, or `null` for Skip. */
  save(name: string | null): Promise<AwakeningSaveResult>
  /** Called once, after the exit fade, to hand over to the real app. */
  onFinish(): void
  /** The real first launch is the page's `main`; the DEV preview embeds it in its own dialog instead. */
  as?: 'main' | 'div'
}
