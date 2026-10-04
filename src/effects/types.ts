import type { DateKey, RankId, WeekKey } from '@/domain'

/**
 * Presentation model (Phase 10). Everything here is about SHOWING results the
 * domain already produced; nothing in this layer decides EXP, levels, ranks,
 * streaks, scores or whether an achievement is unlocked.
 */

/**
 * How heavy a moment is. It decides concurrency, not narrative order:
 *  - minor    inline / toast feedback, never modal, runs beside anything calm
 *  - medium   one SYSTEM popup at a time
 *  - major    a modal overlay
 *  - critical a modal overlay with the heaviest treatment
 */
export type PresentationClass = 'minor' | 'medium' | 'major' | 'critical'

export const CLASS_PRIORITY: Readonly<Record<PresentationClass, number>> = {
  minor: 0,
  medium: 1,
  major: 2,
  critical: 3,
}

/** A modal moment: it pauses everything lighter while it is on screen. */
export function isModalClass(presentationClass: PresentationClass): boolean {
  return presentationClass === 'major' || presentationClass === 'critical'
}

/** The sound / haptic identity of a moment. One cue maps to one pattern and one synthesized sound. */
export type Cue =
  | 'quest'
  | 'quest_strong'
  | 'achievement'
  | 'perfect_day'
  | 'level_up'
  | 'weekly_result'
  | 'rank_up'
  | 'perfect_week'

/** Where an entry came from. Lifecycle entries (startup, resume, midnight) wait while the page is hidden or a form is open. */
export type PresentationOrigin = 'action' | 'lifecycle'

/**
 * What the HUD shows while a Level Up is waiting to be revealed: the level and
 * rank the player had, with the bar full. It lets the bar fill and the overlay
 * open instead of the bar visibly jumping back.
 */
export interface HudHold {
  readonly level: number
  readonly rank: RankId
  /** EXP the held level needs (the bar shows it as full). */
  readonly expToNext: number
}

interface EntryBase {
  /** Unique, and the deduplication key: the same moment is never presented twice in a session. */
  readonly id: string
  readonly origin: PresentationOrigin
  readonly cue: Cue | null
}

/** +EXP feedback on the quest that was just completed. */
export interface QuestFeedbackEntry extends EntryBase {
  readonly kind: 'quest_feedback'
  readonly class: 'minor'
  readonly occurrenceId: string
  readonly amount: number
  /** Harder quests get a slightly stronger (still short) response. */
  readonly strength: 'base' | 'strong' | 'major'
}

/** A weekly goal reached its target while the week is still open (reversible, not final). */
export interface WeeklyGoalFeedbackEntry extends EntryBase {
  readonly kind: 'weekly_goal'
  readonly class: 'minor'
  readonly weekKey: WeekKey
  readonly goalsReached: number
  readonly score: number
}

/** Every weekly goal is done, but the week is not over: not a result. */
export interface WeeklyAllGoalsEntry extends EntryBase {
  readonly kind: 'weekly_all_goals'
  readonly class: 'medium'
  readonly weekKey: WeekKey
}

/** The live day stands at 100 %; it is not a finalized Perfect Day. */
export interface PerfectDayEntry extends EntryBase {
  readonly kind: 'perfect_day'
  readonly class: 'medium'
  readonly dateKey: DateKey
}

export interface AchievementItem {
  readonly id: string
  readonly title: string
  readonly description: string
}

/** One popup for every achievement one action unlocked, in catalog order. */
export interface AchievementsEntry extends EntryBase {
  readonly kind: 'achievements'
  readonly class: 'medium'
  readonly items: readonly AchievementItem[]
}

/**
 * One reveal for everything an EXP award did to level and rank. The domain's
 * own events are folded in unchanged (`levelsCrossed`, every rank transition).
 */
export interface ProgressionEntry extends EntryBase {
  readonly kind: 'progression'
  /** Critical when a rank changed, major otherwise. */
  readonly class: 'major' | 'critical'
  readonly level: { readonly from: number; readonly to: number; readonly levelsCrossed: readonly number[] } | null
  readonly rank: { readonly from: RankId; readonly to: RankId; readonly atLevels: readonly number[] } | null
  readonly expGained: number
  readonly hold: HudHold | null
}

/** How strong a finalized Goal Crusher result was (OD-20). */
export type WeeklyTier = 'restrained' | 'success' | 'strong' | 'perfect'

/** The finalization of a weekly board: the one Goal Crusher spectacle. */
export interface WeeklyResultEntry extends EntryBase {
  readonly kind: 'weekly_result'
  readonly class: 'medium' | 'major' | 'critical'
  readonly tier: WeeklyTier
  readonly weekKey: WeekKey
  readonly score: number
  readonly bonusExp: number
  /** The lowest score of the reward tier earned, or null. */
  readonly rewardTierMinScore: number | null
}

export type PresentationEntry =
  | QuestFeedbackEntry
  | WeeklyGoalFeedbackEntry
  | WeeklyAllGoalsEntry
  | PerfectDayEntry
  | AchievementsEntry
  | ProgressionEntry
  | WeeklyResultEntry

export type PresentationKind = PresentationEntry['kind']
