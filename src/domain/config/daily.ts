/**
 * Day-quality thresholds as whole percentages of eligible quests
 * (MASTER_SPEC §7.2). A day is Perfect only at exactly 100 %.
 */
export const DAILY_QUALITY_THRESHOLDS = {
  completedPercent: 70,
  strongPercent: 85,
} as const
