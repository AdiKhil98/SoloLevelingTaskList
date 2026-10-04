import { PLAYER_NAME_MAX_GRAPHEMES, type PlayerNameErrorCode } from '@/domain'

/** Player-facing wording for a rejected name. The rules themselves live in the domain (`parsePlayerName`). */
export function playerNameErrorText(code: PlayerNameErrorCode): string {
  switch (code) {
    case 'too_long':
      return `Use ${PLAYER_NAME_MAX_GRAPHEMES} characters or fewer.`
    case 'invalid_characters':
      return 'That name has characters that cannot be used. Letters, numbers, symbols and emoji are fine.'
    case 'no_visible_characters':
      return 'Use at least one visible character.'
  }
}

/** The one line shown under a name field. */
export const NAME_HINT = `Up to ${PLAYER_NAME_MAX_GRAPHEMES} characters. Any language.`
