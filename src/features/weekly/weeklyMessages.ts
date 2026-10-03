import type {
  ClaimWeeklyRewardRejectionReason,
  ClaimWeeklyRewardUseCaseResult,
  FailureReason,
  SaveWeeklyBoardRejectionReason,
  SetWeeklyGoalProgressRejectionReason,
  WeeklyBoardErrorCode,
  WeeklyGoalErrorCode,
} from '@/application'
import { WEEKLY_BOARD_TOTAL_POINTS, WEEKLY_LIMITS, dateKeyParts, type DateKey } from '@/domain'

/** Wording for the Weekly Goal Crusher screens. Presentation only: the domain and application layers return codes. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function monthDay(key: DateKey): string {
  const { month, day } = dateKeyParts(key)
  return `${MONTHS[month - 1]} ${day}`
}

/** `Sep 28 – Oct 4, 2026` (the year of the Sunday). */
export function formatWeekRange(start: DateKey, end: DateKey): string {
  return `${monthDay(start)} – ${monthDay(end)}, ${dateKeyParts(end).year}`
}

/** `6+`, `7+`, `8+`, `9+`, `10`: how a reward tier is named. */
export function tierLabel(minScore: number): string {
  return minScore === WEEKLY_BOARD_TOTAL_POINTS ? String(minScore) : `${minScore}+`
}

export function goalErrorText(code: WeeklyGoalErrorCode): string {
  switch (code) {
    case 'title_required':
      return 'Enter a title.'
    case 'title_too_long':
      return `Use at most ${WEEKLY_LIMITS.goalTitleMaxLength} characters.`
    case 'points_invalid':
      return `Choose from 1 to ${WEEKLY_BOARD_TOTAL_POINTS} points.`
    case 'target_invalid':
      return `Enter a whole number from 1 to ${WEEKLY_LIMITS.targetMax}, digits only.`
    case 'unit_too_long':
      return `Use at most ${WEEKLY_LIMITS.unitMaxLength} characters.`
    case 'notes_too_long':
      return `Use at most ${WEEKLY_LIMITS.notesMaxLength} characters.`
    case 'link_required':
      return 'Choose the quest to count.'
    case 'link_unknown':
      return 'That quest no longer exists. Choose another.'
  }
}

export function boardErrorText(code: WeeklyBoardErrorCode, total: number | undefined): string {
  switch (code) {
    case 'no_goals':
      return 'Add at least one goal.'
    case 'points_total_invalid':
      return `The points must add up to exactly ${WEEKLY_BOARD_TOTAL_POINTS}${total === undefined ? '' : ` (they add up to ${total})`}.`
    case 'focus_too_long':
      return `The Weekly Focus can have at most ${WEEKLY_LIMITS.focusMaxLength} characters.`
    case 'reward_tiers_invalid':
      return 'The reward tiers are not valid.'
  }
}

export function rewardErrorText(): string {
  return `Use at most ${WEEKLY_LIMITS.rewardTextMaxLength} characters.`
}

/** Shown when a weekly action could not be saved (nothing was changed). */
export function weeklyFailureText(reason: FailureReason): string {
  switch (reason) {
    case 'storage_full':
      return 'Your device is out of storage space. Nothing was changed.'
    case 'database_unavailable':
    case 'database_blocked':
      return 'Saving is unavailable right now. Nothing was changed.'
    case 'clock_behind':
      return 'This device’s clock is behind your last recorded day, so changes are paused. Nothing was changed.'
    case 'day_not_synchronized':
      return 'The day changed. Your week has been reloaded; please try again. Nothing was changed.'
    default:
      return 'That could not be saved. Nothing was changed. Please try again.'
  }
}

export function saveRejectionText(reason: SaveWeeklyBoardRejectionReason): string {
  switch (reason) {
    case 'board_finalized':
      return 'This week is already final, so its board can no longer be changed.'
    case 'stale':
      return 'This board changed somewhere else. Reload it and try again. Nothing was changed.'
    case 'week_not_current':
      return 'That week is over. Open the Weekly screen to see the current week. Nothing was changed.'
  }
}

export function progressRejectionText(reason: SetWeeklyGoalProgressRejectionReason): string {
  switch (reason) {
    case 'board_not_found':
      return 'There is no board for this week.'
    case 'board_finalized':
      return 'This week is already final, so its progress can no longer be changed.'
    case 'week_not_current':
      return 'That week is over. Reload to see the current week.'
    case 'goal_not_found':
      return 'That goal no longer exists. Reload to see the current board.'
    case 'goal_not_manual':
      return 'That goal is counted from quest completions, so it has no number to set.'
    case 'progress_invalid':
      return 'Enter a whole number, 0 or more.'
  }
}

/** What to tell the player after a claim attempt; the Weekly screen and the History share it. */
export function describeClaimResult(result: ClaimWeeklyRewardUseCaseResult): { tone: 'success' | 'error'; text: string } {
  switch (result.status) {
    case 'claimed':
    case 'already_claimed':
      return { tone: 'success', text: 'Reward claimed.' }
    case 'rejected':
      return { tone: 'error', text: claimRejectionText(result.reason) }
    case 'failed':
      console.error('Claiming a weekly reward failed', result.cause)
      return { tone: 'error', text: weeklyFailureText(result.reason) }
  }
}

function claimRejectionText(reason: ClaimWeeklyRewardRejectionReason): string {
  switch (reason) {
    case 'board_not_found':
      return 'That week has no board.'
    case 'not_finalized':
      return 'A reward can be claimed only after the week is finalized.'
    case 'no_reward':
      return 'That week earned no reward.'
    case 'reward_text_blank':
      return 'No reward was written for that tier, so there is nothing to claim.'
  }
}
