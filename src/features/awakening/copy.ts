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
  /** The static part of the welcome line. The player's name is never joined to it into one string (see `WelcomeLine`). */
  welcomeLabel: 'WELCOME,',
  begin: 'BEGIN',
  saveFailed: 'Your identity could not be saved, so nothing has changed. Please try again.',
} as const
