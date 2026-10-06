import type { AchievementsEntry, ProgressionEntry, WeeklyGoalFeedbackEntry, WeeklyResultEntry } from '@/effects/types'
import { rankLabel } from '../displayLabels'

/**
 * The words the presentation layer shows. Presentation only: every figure comes
 * from an entry, which carries what the domain reported. The same text feeds the
 * overlays, the plain fallback card and the screen-reader summaries, so they can
 * never disagree.
 */

export interface PhaseText {
  readonly heading: string
  /** The one-line SYSTEM message (typed out in normal mode). */
  readonly line: string
  /** `LV. 9` / `E-RANK` and where it went. */
  readonly from: string
  readonly to: string
  readonly detail: string | null
}

export function levelPhaseText(entry: ProgressionEntry): PhaseText | null {
  if (entry.level === null) return null
  const crossed = entry.level.levelsCrossed.length
  return {
    heading: 'LEVEL UP',
    line: 'YOUR LEVEL HAS INCREASED.',
    from: `LV. ${entry.level.from}`,
    to: `LV. ${entry.level.to}`,
    detail: crossed > 1 ? `+${crossed} LEVELS` : null,
  }
}

export function rankPhaseText(entry: ProgressionEntry): PhaseText | null {
  if (entry.rank === null) return null
  const unknown = rankLabel(entry.rank.to) === '???'
  return {
    heading: 'RANK ADVANCEMENT',
    line: unknown ? 'RANK UNKNOWN.' : 'A NEW RANK HAS BEEN RECOGNIZED.',
    from: rankLabel(entry.rank.from),
    to: rankLabel(entry.rank.to),
    detail: null,
  }
}

/** `+120 EXP`, or null when the award is not known. */
export function expText(amount: number): string | null {
  return amount > 0 ? `+${amount.toLocaleString('en-US')} EXP` : null
}

/** The whole reveal as one sentence, for screen readers and the plain fallback. */
export function progressionSummary(entry: ProgressionEntry): string {
  const parts: string[] = []
  const level = levelPhaseText(entry)
  const rank = rankPhaseText(entry)
  if (level !== null) parts.push(`${level.heading}. ${level.from} to ${level.to}.${level.detail === null ? '' : ` ${level.detail}.`}`)
  if (rank !== null) parts.push(`${rank.heading}. ${rank.from} to ${rank.to}.`)
  const exp = expText(entry.expGained)
  if (exp !== null) parts.push(`${exp}.`)
  return parts.join(' ')
}

export interface WeeklyResultText {
  readonly heading: string
  readonly line: string
  readonly score: string
  /** `+225 EXP`, or the plain statement that no bonus was earned. */
  readonly bonus: string
  readonly reward: string | null
}

export function weeklyResultText(entry: WeeklyResultEntry): WeeklyResultText {
  const heading =
    entry.tier === 'perfect' ? 'PERFECT WEEK' : entry.tier === 'strong' ? 'STRONG WEEK' : entry.tier === 'success' ? 'WEEK COMPLETE' : 'WEEKLY RESULT'
  const line =
    entry.tier === 'perfect'
      ? 'ALL GOALS CRUSHED.'
      : entry.tier === 'strong'
        ? 'EXCELLENT PERFORMANCE RECORDED.'
        : entry.tier === 'success'
          ? 'GOAL CRUSHER RESULT CONFIRMED.'
          : 'THE WEEK HAS BEEN RECORDED.'
  return {
    heading,
    line,
    score: `SCORE ${entry.score} / 10`,
    bonus: expText(entry.bonusExp) ?? 'NO BONUS THIS WEEK',
    reward: entry.rewardTierMinScore === null ? null : `REWARD TIER ${entry.rewardTierMinScore === 10 ? '10' : `${entry.rewardTierMinScore}+`} UNLOCKED`,
  }
}

export function weeklyResultSummary(entry: WeeklyResultEntry): string {
  const text = weeklyResultText(entry)
  return [`${text.heading}.`, `${text.score}.`, `${text.bonus}.`, text.reward === null ? null : `${text.reward}.`].filter((part) => part !== null).join(' ')
}

/** A live day at 100 %: it says what is true now and never claims a finalized Perfect Day. */
export const PERFECT_DAY_TEXT = { title: 'PERFECT DAY', body: 'ALL DAILY QUESTS COMPLETE' } as const

/** Every weekly goal is done but the week is still open, so the text never calls it a result. */
export const ALL_GOALS_TEXT = { title: 'ALL GOALS COMPLETE', body: 'THE RESULT IS FINAL AFTER SUNDAY' } as const

export function achievementsHeading(entry: AchievementsEntry): string {
  return entry.items.length === 1 ? 'ACHIEVEMENT UNLOCKED' : 'ACHIEVEMENTS UNLOCKED'
}

/** `GOAL COMPLETE · SCORE 3 / 10` (the small toast for a goal reached while the week is still open). */
export function weeklyGoalToastText(entry: WeeklyGoalFeedbackEntry): string {
  const goals = entry.goalsReached === 1 ? 'GOAL COMPLETE' : `${entry.goalsReached} GOALS COMPLETE`
  return `${goals} · SCORE ${entry.score} / 10`
}
