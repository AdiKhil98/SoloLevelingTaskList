import { dateKeyParts, type DateKey, type QuestRecurrence } from '@/domain'
import { weekdayShortName } from '../displayLabels'

/**
 * Human-readable recurrence text. Presentation only: it describes a recurrence
 * the domain already validated and is never parsed or used as domain logic.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** `2026-10-08` → `Oct 8, 2026`. Reads the date's own fields: no `Date` object, so no time zone can shift it. */
export function formatDateKey(dateKey: DateKey): string {
  const { year, month, day } = dateKeyParts(dateKey)
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

/** `Daily` · `Mon, Wed, Fri` · `Every 2 days` · `One-time · Oct 8, 2026` */
export function recurrenceSummary(recurrence: QuestRecurrence): string {
  switch (recurrence.kind) {
    case 'daily':
      return 'Daily'
    case 'weekdays':
      return [...recurrence.weekdays].sort((a, b) => a - b).map(weekdayShortName).join(', ')
    case 'interval':
      return `Every ${recurrence.everyNDays} days`
    case 'one_time':
      return `One-time · ${formatDateKey(recurrence.date)}`
  }
}

/** The summary as shown in the management list: weekday and interval quests are labelled `Scheduled`. */
export function recurrenceListText(recurrence: QuestRecurrence): string {
  const summary = recurrenceSummary(recurrence)
  return recurrence.kind === 'weekdays' || recurrence.kind === 'interval' ? `Scheduled · ${summary}` : summary
}
