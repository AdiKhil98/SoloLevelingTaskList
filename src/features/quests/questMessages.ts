import type { FailureReason, QuestFormErrorCode } from '@/application'

/** Wording for the form's field errors (the application layer only returns codes). */
export function fieldErrorText(code: QuestFormErrorCode): string {
  switch (code) {
    case 'title_required':
      return 'Enter a title.'
    case 'recurrence_invalid':
      return 'Check the schedule.'
    case 'difficulty_required':
      return 'Choose a difficulty.'
    case 'category_required':
      return 'Choose a category.'
    case 'weekdays_required':
      return 'Choose at least one day.'
    case 'weekdays_invalid':
      return 'Choose valid days.'
    case 'date_required':
      return 'Choose a date.'
    case 'date_invalid':
      return 'Enter a valid date.'
    case 'date_in_past':
      return 'The date cannot be in the past.'
    case 'interval_required':
      return 'Enter how many days.'
    case 'interval_not_integer':
      return 'Use a whole number of days, digits only.'
    case 'interval_too_small':
      return 'Use 2 or more days. For every day, choose Daily.'
  }
}

/** Shown when a management action could not be saved (nothing was changed). */
export function saveFailureText(reason: FailureReason, what: 'create' | 'update' | 'archive' | 'restore' | 'reorder'): string {
  if (reason === 'storage_full') return 'Your device is out of storage space. Nothing was changed.'
  if (reason === 'database_unavailable' || reason === 'database_blocked') {
    return 'Saving is unavailable right now. Nothing was changed.'
  }
  if (reason === 'clock_behind') {
    return 'This device’s clock is behind your last recorded day, so changes are paused. Nothing was changed.'
  }
  if (reason === 'day_not_synchronized') {
    return 'The day changed. Today’s quests have been loaded; please try again. Nothing was changed.'
  }
  switch (what) {
    case 'create':
      return 'That quest could not be saved. Nothing was created. Please try again.'
    case 'update':
      return 'That quest could not be saved. Nothing was changed. Please try again.'
    case 'archive':
      return 'That quest could not be archived. It is still active. Please try again.'
    case 'restore':
      return 'That quest could not be restored. Please try again.'
    case 'reorder':
      return 'The new order could not be saved, so the list was reloaded. Please try again.'
  }
}

export type FlashNotice = 'created' | 'updated' | 'archived' | 'restored'

export const FLASH_NOTICE_TEXT: Readonly<Record<FlashNotice, string>> = {
  created: 'Quest created.',
  updated: 'Quest updated.',
  archived: 'Quest archived.',
  restored: 'Quest restored.',
}

export function isFlashNotice(value: unknown): value is FlashNotice {
  return typeof value === 'string' && Object.hasOwn(FLASH_NOTICE_TEXT, value)
}
