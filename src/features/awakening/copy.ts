/**
 * The Awakening wording. Original SYSTEM-style text: it borrows only the idea of
 * a SYSTEM contacting a player, and reproduces no dialogue from any series or game.
 */
export const AWAKENING_COPY = {
  badge: 'SYSTEM',
  noticeHeading: 'CONNECTION ESTABLISHED',
  noticeLines: ['PLAYER DETECTED', 'AWAKENING AVAILABLE'] as const,
  accept: 'ACCEPT',
  identifyHeading: 'IDENTIFY YOURSELF',
  nameLabel: 'PLAYER NAME',
  nameHint: 'You can change this later in Status.',
  confirm: 'CONFIRM',
  skip: 'SKIP',
  skipHint: 'Skip to be called PLAYER.',
  registering: 'INITIALIZING PLAYER...',
  completeHeading: 'AWAKENING COMPLETE',
  begin: 'BEGIN',
  saveFailed: 'Your identity could not be saved, so nothing has changed. Please try again.',
} as const

/** "WELCOME, ADA": the name is shown as the SYSTEM shows labels, in capitals (screen readers keep the original text). */
export function welcomeLine(displayName: string): string {
  return `WELCOME, ${displayName}`
}
