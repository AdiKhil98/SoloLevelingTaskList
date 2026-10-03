import {
  evaluateWeeklyGoals,
  rewardTierForScore,
  type DateKey,
  type EpochMs,
  type LinkedCompletionCounts,
  type QuestTemplate,
  type WeekKey,
  type WeeklyGoalBoard,
  type WeeklyGoalTrackingMode,
  type WeeklyRewardClaim,
  type WeeklyRewardTier,
  type WeeklyRewardTierScore,
} from '@/domain'

/**
 * Display models of the Weekly screens. The first is the LIVE view of an active
 * board (score and completion derived from the goals and the current progress);
 * the second is the FROZEN view of a finalized one, built only from the board's
 * own finalization snapshot and its claim: no template, completion or ledger is
 * ever consulted, so later data can never change what a finished week shows.
 */

export interface WeeklyGoalView {
  readonly id: string
  readonly title: string
  readonly maxPoints: number
  readonly target: number
  readonly unit: string | null
  readonly trackingMode: WeeklyGoalTrackingMode
  /** The linked quest, or null for a manual goal. */
  readonly templateId: string | null
  /** The linked quest's current title (display only); null when the goal is manual or the quest is unknown. */
  readonly templateTitle: string | null
  readonly templateArchived: boolean
  /** The player's number (manual) or the completions counted so far this week (linked). */
  readonly progress: number
  readonly completed: boolean
  readonly earnedPoints: number
  readonly notes: string | null
}

export interface WeeklyRewardTierView {
  readonly minScore: WeeklyRewardTierScore
  readonly text: string
  /** The score has reached this tier. */
  readonly reached: boolean
  /** The highest tier reached: the only one that applies. */
  readonly current: boolean
}

export interface ActiveWeeklyBoardView {
  readonly weekKey: WeekKey
  readonly startDate: DateKey
  readonly endDate: DateKey
  readonly revision: number
  readonly focus: string | null
  readonly goals: readonly WeeklyGoalView[]
  /** Derived now; nothing about the score is stored on an active board. */
  readonly score: number
  readonly goalsCompleted: number
  readonly goalCount: number
  readonly rewardTiers: readonly WeeklyRewardTierView[]
}

export interface FinalizedWeeklyGoalView {
  readonly goalId: string
  readonly title: string
  readonly unit: string | null
  readonly maxPoints: number
  readonly target: number
  readonly trackingMode: WeeklyGoalTrackingMode
  /** The exact progress that was scored. */
  readonly progress: number
  readonly completed: boolean
  readonly earnedPoints: number
}

export interface FinalizedWeekView {
  readonly weekKey: WeekKey
  readonly startDate: DateKey
  readonly endDate: DateKey
  readonly focus: string | null
  readonly score: number
  readonly goalCount: number
  readonly goalsCompleted: number
  readonly goals: readonly FinalizedWeeklyGoalView[]
  readonly bonusExp: number
  /** The tier the score earned, with its text as it was at finalization; null below 6. */
  readonly rewardTier: WeeklyRewardTier | null
  readonly finalizedAt: EpochMs
  /** When the reward was claimed, or null. */
  readonly claimedAt: EpochMs | null
  /** A tier with text was earned and has not been claimed yet. */
  readonly claimable: boolean
}

export function buildActiveBoardView(
  board: WeeklyGoalBoard,
  linkedCounts: LinkedCompletionCounts,
  templates: ReadonlyMap<string, QuestTemplate>,
): ActiveWeeklyBoardView {
  const evaluation = evaluateWeeklyGoals(board.goals, linkedCounts)
  const goals = board.goals.map((goal, index): WeeklyGoalView => {
    const result = evaluation.goalResults[index]
    const templateId = goal.tracking.mode === 'linked_quest' ? goal.tracking.templateId : null
    const template = templateId === null ? undefined : templates.get(templateId)
    return {
      id: goal.id,
      title: goal.title,
      maxPoints: goal.maxPoints,
      target: goal.target,
      unit: goal.unit,
      trackingMode: goal.tracking.mode,
      templateId,
      templateTitle: template === undefined ? null : template.title,
      templateArchived: template !== undefined && template.status === 'archived',
      progress: result?.finalProgress ?? 0,
      completed: result?.completed ?? false,
      earnedPoints: result?.earnedPoints ?? 0,
      notes: goal.notes,
    }
  })
  const current = rewardTierForScore(evaluation.score, board.rewardTiers)
  return {
    weekKey: board.weekKey,
    startDate: board.startDate,
    endDate: board.endDate,
    revision: board.revision,
    focus: board.focus,
    goals,
    score: evaluation.score,
    goalsCompleted: evaluation.goalsCompleted,
    goalCount: board.goals.length,
    rewardTiers: board.rewardTiers.map((tier) => ({
      minScore: tier.minScore,
      text: tier.text,
      reached: evaluation.score >= tier.minScore,
      current: current !== null && current.minScore === tier.minScore,
    })),
  }
}

/** The frozen view of a finalized board, or null if the board is not finalized. */
export function buildFinalizedWeekView(board: WeeklyGoalBoard, claim: WeeklyRewardClaim | null): FinalizedWeekView | null {
  const { finalization } = board
  if (board.status !== 'finalized' || finalization === null) return null
  const { rewardTier } = finalization
  return {
    weekKey: board.weekKey,
    startDate: board.startDate,
    endDate: board.endDate,
    focus: board.focus,
    score: finalization.score,
    goalCount: finalization.goalResults.length,
    goalsCompleted: finalization.goalResults.filter((result) => result.completed).length,
    goals: finalization.goalResults.map((result) => ({
      goalId: result.goalId,
      title: result.title,
      unit: result.unit,
      maxPoints: result.maxPoints,
      target: result.target,
      trackingMode: result.trackingMode,
      progress: result.finalProgress,
      completed: result.completed,
      earnedPoints: result.earnedPoints,
    })),
    bonusExp: finalization.bonusExp,
    rewardTier,
    finalizedAt: finalization.finalizedAt,
    claimedAt: claim === null ? null : claim.claimedAt,
    claimable: rewardTier !== null && rewardTier.text.trim() !== '' && claim === null,
  }
}
