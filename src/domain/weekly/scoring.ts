import type { WeeklyGoal, WeeklyGoalResult, WeeklyRewardTier } from './types'

/**
 * Linked progress input: completions of each quest template inside the week,
 * keyed by template id. A template that is absent has no completions.
 */
export type LinkedCompletionCounts = ReadonlyMap<string, number>

/** The progress a goal is scored on: the player's number, or the linked completion count. */
export function goalProgressOf(goal: WeeklyGoal, linkedCounts: LinkedCompletionCounts): number {
  return goal.tracking.mode === 'manual' ? goal.manualProgress : (linkedCounts.get(goal.tracking.templateId) ?? 0)
}

/** A goal counts as achieved when its progress reaches the target. More than the target earns nothing extra. */
export function isGoalComplete(progress: number, target: number): boolean {
  return progress >= target
}

export interface WeeklyEvaluation {
  /** One entry per goal, in board order. */
  readonly goalResults: readonly WeeklyGoalResult[]
  /** Σ points of achieved goals, 0–10. All-or-nothing per goal (no fractions). */
  readonly score: number
  readonly goalsCompleted: number
}

/**
 * Scores a board's goals against the given progress (MASTER_SPEC §12.4). Pure
 * and deterministic: it is used both for the live (derived) score of an active
 * board and, once, for the frozen result at finalization.
 */
export function evaluateWeeklyGoals(
  goals: readonly WeeklyGoal[],
  linkedCounts: LinkedCompletionCounts,
): WeeklyEvaluation {
  const goalResults = goals.map((goal): WeeklyGoalResult => {
    const finalProgress = goalProgressOf(goal, linkedCounts)
    const completed = isGoalComplete(finalProgress, goal.target)
    return {
      goalId: goal.id,
      title: goal.title,
      unit: goal.unit,
      maxPoints: goal.maxPoints,
      target: goal.target,
      trackingMode: goal.tracking.mode,
      templateId: goal.tracking.mode === 'linked_quest' ? goal.tracking.templateId : null,
      finalProgress,
      completed,
      earnedPoints: completed ? goal.maxPoints : 0,
    }
  })
  return {
    goalResults,
    score: goalResults.reduce((sum, result) => sum + result.earnedPoints, 0),
    goalsCompleted: goalResults.filter((result) => result.completed).length,
  }
}

/**
 * The single reward tier a score earns: the highest tier whose minimum the
 * score reaches (null below the first). Only that tier applies; there is no
 * stacking of lower ones.
 */
export function rewardTierForScore(score: number, tiers: readonly WeeklyRewardTier[]): WeeklyRewardTier | null {
  let earned: WeeklyRewardTier | null = null
  for (const tier of tiers) {
    if (score >= tier.minScore && (earned === null || tier.minScore > earned.minScore)) earned = tier
  }
  return earned
}
