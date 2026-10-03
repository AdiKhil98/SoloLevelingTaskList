import {
  isWeekKey,
  isWeeklyRewardTierScore,
  rewardTierForScore,
  validateWeeklyBoardDefinition,
  weekEndOf,
  weeklyBonusExpForScore,
  weeklyBonusTransactionId,
  type WeeklyFinalization,
  type WeeklyGoal,
  type WeeklyGoalBoard,
  type WeeklyGoalResult,
  type WeeklyGoalTracking,
  type WeeklyRewardClaim,
  type WeeklyRewardTier,
  type WeeklyRewardTierScore,
} from '@/domain'
import {
  IssueCollector,
  isPlainObject,
  joinPath,
  parserFor,
  readBoolean,
  readDateKey,
  readEnum,
  readNullableString,
  readObject,
  readSafeInteger,
  readString,
  type RecordReader,
} from './readers'

const BOARD_REQUIRED = [
  'weekKey',
  'startDate',
  'endDate',
  'focus',
  'goals',
  'rewardTiers',
  'status',
  'createdAt',
  'updatedAt',
  'revision',
  'finalization',
] as const
const GOAL_REQUIRED = ['id', 'title', 'maxPoints', 'target', 'unit', 'tracking', 'manualProgress', 'notes'] as const
const FINALIZATION_REQUIRED = ['finalizedAt', 'score', 'bonusExp', 'xpTransactionId', 'goalResults', 'rewardTier'] as const
const RESULT_REQUIRED = [
  'goalId',
  'title',
  'unit',
  'maxPoints',
  'target',
  'trackingMode',
  'templateId',
  'finalProgress',
  'completed',
  'earnedPoints',
] as const
const CLAIM_REQUIRED = ['weekKey', 'tierMinScore', 'rewardTextSnapshot', 'claimedAt'] as const

/** A quest has at most one occurrence per day, so a week holds at most this many completions of it. */
const DAYS_IN_WEEK = 7

const isStatus = (value: unknown): value is WeeklyGoalBoard['status'] => value === 'active' || value === 'finalized'
const isTrackingMode = (value: unknown): value is WeeklyGoalTracking['mode'] => value === 'manual' || value === 'linked_quest'

function readTracking(collector: IssueCollector, value: unknown, path: string): WeeklyGoalTracking | undefined {
  if (!isPlainObject(value)) {
    collector.add(path, 'not_an_object', 'Expected an object')
    return undefined
  }
  if (value.mode === 'manual') {
    return readObject(collector, value, path, ['mode']) === undefined ? undefined : { mode: 'manual' }
  }
  if (value.mode === 'linked_quest') {
    const source = readObject(collector, value, path, ['mode', 'templateId'])
    if (source === undefined) return undefined
    const templateId = readString(collector, source, 'templateId', path)
    return templateId === undefined ? undefined : { mode: 'linked_quest', templateId }
  }
  collector.add(joinPath(path, 'mode'), 'invalid_value', 'Expected "manual" or "linked_quest"')
  return undefined
}

function readGoal(collector: IssueCollector, value: unknown, path: string): WeeklyGoal | undefined {
  const source = readObject(collector, value, path, GOAL_REQUIRED)
  if (source === undefined) return undefined
  const before = collector.issues.length
  const id = readString(collector, source, 'id', path)
  const title = readString(collector, source, 'title', path)
  const maxPoints = readSafeInteger(collector, source, 'maxPoints', path)
  const target = readSafeInteger(collector, source, 'target', path)
  const unit = readNullableString(collector, source, 'unit', path)
  const tracking = readTracking(collector, source.tracking, joinPath(path, 'tracking'))
  const manualProgress = readSafeInteger(collector, source, 'manualProgress', path)
  const notes = readNullableString(collector, source, 'notes', path)
  if (
    collector.issues.length > before ||
    id === undefined ||
    title === undefined ||
    maxPoints === undefined ||
    target === undefined ||
    unit === undefined ||
    tracking === undefined ||
    manualProgress === undefined ||
    notes === undefined
  ) {
    return undefined
  }
  return { id, title, maxPoints, target, unit, tracking, manualProgress, notes }
}

function readArray<T>(
  collector: IssueCollector,
  value: unknown,
  path: string,
  read: (collector: IssueCollector, item: unknown, path: string) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) {
    collector.add(path, 'not_an_array', 'Expected an array')
    return undefined
  }
  const items: T[] = []
  let clean = true
  value.forEach((item: unknown, index) => {
    const read_ = read(collector, item, joinPath(path, index))
    if (read_ === undefined) clean = false
    else items.push(read_)
  })
  return clean ? items : undefined
}

function readTierScore(collector: IssueCollector, source: Record<string, unknown>, key: string, path: string): WeeklyRewardTierScore | undefined {
  const value = source[key]
  if (!isWeeklyRewardTierScore(value)) {
    collector.add(joinPath(path, key), 'invalid_value', 'Expected a reward tier score (6–10)')
    return undefined
  }
  return value
}

function readRewardTier(collector: IssueCollector, value: unknown, path: string): WeeklyRewardTier | undefined {
  const source = readObject(collector, value, path, ['minScore', 'text'])
  if (source === undefined) return undefined
  const before = collector.issues.length
  const minScore = readTierScore(collector, source, 'minScore', path)
  const text = readString(collector, source, 'text', path, { allowEmpty: true })
  if (collector.issues.length > before || minScore === undefined || text === undefined) return undefined
  return { minScore, text }
}

function readGoalResult(collector: IssueCollector, value: unknown, path: string): WeeklyGoalResult | undefined {
  const source = readObject(collector, value, path, RESULT_REQUIRED)
  if (source === undefined) return undefined
  const before = collector.issues.length
  const goalId = readString(collector, source, 'goalId', path)
  const title = readString(collector, source, 'title', path)
  const unit = readNullableString(collector, source, 'unit', path)
  const maxPoints = readSafeInteger(collector, source, 'maxPoints', path)
  const target = readSafeInteger(collector, source, 'target', path)
  const trackingMode = readEnum(collector, source, 'trackingMode', path, isTrackingMode, '"manual" or "linked_quest"')
  const templateId = readNullableString(collector, source, 'templateId', path)
  const finalProgress = readSafeInteger(collector, source, 'finalProgress', path)
  const completed = readBoolean(collector, source, 'completed', path)
  const earnedPoints = readSafeInteger(collector, source, 'earnedPoints', path)
  if (
    collector.issues.length > before ||
    goalId === undefined ||
    title === undefined ||
    unit === undefined ||
    maxPoints === undefined ||
    target === undefined ||
    trackingMode === undefined ||
    templateId === undefined ||
    finalProgress === undefined ||
    completed === undefined ||
    earnedPoints === undefined
  ) {
    return undefined
  }
  return { goalId, title, unit, maxPoints, target, trackingMode, templateId, finalProgress, completed, earnedPoints }
}

function readFinalization(collector: IssueCollector, value: unknown, path: string): WeeklyFinalization | undefined {
  const source = readObject(collector, value, path, FINALIZATION_REQUIRED)
  if (source === undefined) return undefined
  const before = collector.issues.length
  const finalizedAt = readSafeInteger(collector, source, 'finalizedAt', path)
  const score = readSafeInteger(collector, source, 'score', path, { max: 10 })
  const bonusExp = readSafeInteger(collector, source, 'bonusExp', path)
  const xpTransactionId = readNullableString(collector, source, 'xpTransactionId', path)
  const goalResults = readArray(collector, source.goalResults, joinPath(path, 'goalResults'), readGoalResult)
  let rewardTier: WeeklyRewardTier | null | undefined
  if (source.rewardTier === null) rewardTier = null
  else rewardTier = readRewardTier(collector, source.rewardTier, joinPath(path, 'rewardTier'))
  if (
    collector.issues.length > before ||
    finalizedAt === undefined ||
    score === undefined ||
    bonusExp === undefined ||
    xpTransactionId === undefined ||
    goalResults === undefined ||
    rewardTier === undefined
  ) {
    return undefined
  }
  return { finalizedAt, score, bonusExp, xpTransactionId, goalResults, rewardTier }
}

/**
 * Checks a finalized board's snapshot against the board's own goals and the
 * approved rules, using ONLY the stored record: the frozen `goalResults` must
 * agree with the goals, the score with the results, the bonus with the table,
 * the reward tier with the score, and the ledger link with the week. Nothing
 * is recomputed from completions, so later data can never change what a
 * finalized week says (it can only make an inconsistent record invalid).
 */
function checkFinalization(collector: IssueCollector, board: WeeklyGoalBoard, finalization: WeeklyFinalization, path: string): void {
  const at = (field: string) => joinPath(joinPath(path, 'finalization'), field)
  const problem = (field: string, code: string, message: string) => collector.add(at(field), code, message)

  if (finalization.finalizedAt < board.createdAt) problem('finalizedAt', 'out_of_range', 'Cannot precede the board’s creation')

  const { goalResults } = finalization
  if (goalResults.length !== board.goals.length) {
    problem('goalResults', 'final_results_mismatch', 'Must hold exactly one result per goal')
  } else {
    goalResults.forEach((result, index) => {
      const goal = board.goals[index]
      const here = joinPath(at('goalResults'), index)
      if (goal === undefined) return
      const linkedTemplate = goal.tracking.mode === 'linked_quest' ? goal.tracking.templateId : null
      if (
        result.goalId !== goal.id ||
        result.title !== goal.title ||
        result.unit !== goal.unit ||
        result.maxPoints !== goal.maxPoints ||
        result.target !== goal.target ||
        result.trackingMode !== goal.tracking.mode ||
        result.templateId !== linkedTemplate
      ) {
        collector.add(here, 'final_result_goal_mismatch', 'Differs from the goal it records')
      }
      if (result.completed !== result.finalProgress >= result.target) {
        collector.add(joinPath(here, 'completed'), 'final_result_completion_mismatch', 'Must be true exactly when progress reaches the target')
      }
      if (result.earnedPoints !== (result.completed ? result.maxPoints : 0)) {
        collector.add(joinPath(here, 'earnedPoints'), 'final_result_points_mismatch', 'Must be the goal’s points when completed, otherwise 0')
      }
      if (result.trackingMode === 'manual' && result.finalProgress !== goal.manualProgress) {
        collector.add(joinPath(here, 'finalProgress'), 'final_progress_mismatch', 'A manual goal’s final progress must equal its frozen value')
      }
      if (result.trackingMode === 'linked_quest' && result.finalProgress > DAYS_IN_WEEK) {
        collector.add(joinPath(here, 'finalProgress'), 'out_of_range', `A week holds at most ${DAYS_IN_WEEK} completions of one quest`)
      }
    })
  }

  const score = goalResults.reduce((sum, result) => sum + result.earnedPoints, 0)
  if (finalization.score !== score) problem('score', 'final_score_mismatch', 'Must equal the sum of the earned points')
  if (finalization.bonusExp !== weeklyBonusExpForScore(finalization.score)) {
    problem('bonusExp', 'final_bonus_mismatch', 'Differs from the bonus the score earns')
  }
  const expectedTransaction = finalization.bonusExp > 0 ? weeklyBonusTransactionId(board.weekKey) : null
  if (finalization.xpTransactionId !== expectedTransaction) {
    problem('xpTransactionId', 'final_transaction_mismatch', 'Must be the week’s bonus transaction exactly when a bonus was earned')
  }
  const expectedTier = rewardTierForScore(finalization.score, board.rewardTiers)
  const tier = finalization.rewardTier
  if (
    (tier === null) !== (expectedTier === null) ||
    (tier !== null && expectedTier !== null && (tier.minScore !== expectedTier.minScore || tier.text !== expectedTier.text))
  ) {
    problem('rewardTier', 'final_tier_mismatch', 'Must be the highest tier the score reached, with the board’s text')
  }
}

/**
 * Reads an untrusted value as a `WeeklyGoalBoard`: shape, then every rule that
 * can be decided from the board alone (DATA_MODEL §10): the week's dates, the
 * approved board rules (the domain's `validateWeeklyBoardDefinition`, so the
 * exactly-10 rule exists once), the status ↔ finalization pairing, and, for a
 * finalized board, the consistency of its frozen snapshot. Rules that span
 * records (the ledger row, claims) are in `validateDataset`.
 */
export const readWeeklyBoard: RecordReader<WeeklyGoalBoard> = (collector, value, path) => {
  const source = readObject(collector, value, path, BOARD_REQUIRED)
  if (source === undefined) return undefined

  const before = collector.issues.length
  const weekKey = readDateKey(collector, source, 'weekKey', path)
  const startDate = readDateKey(collector, source, 'startDate', path)
  const endDate = readDateKey(collector, source, 'endDate', path)
  const focus = readNullableString(collector, source, 'focus', path)
  const goals = readArray(collector, source.goals, joinPath(path, 'goals'), readGoal)
  const rewardTiers = readArray(collector, source.rewardTiers, joinPath(path, 'rewardTiers'), readRewardTier)
  const status = readEnum(collector, source, 'status', path, isStatus, '"active" or "finalized"')
  const createdAt = readSafeInteger(collector, source, 'createdAt', path)
  const updatedAt = readSafeInteger(collector, source, 'updatedAt', path)
  const revision = readSafeInteger(collector, source, 'revision', path, { min: 1 })
  let finalization: WeeklyFinalization | null | undefined
  if (source.finalization === null) finalization = null
  else finalization = readFinalization(collector, source.finalization, joinPath(path, 'finalization'))

  if (
    collector.issues.length > before ||
    weekKey === undefined ||
    startDate === undefined ||
    endDate === undefined ||
    focus === undefined ||
    goals === undefined ||
    rewardTiers === undefined ||
    status === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    revision === undefined ||
    finalization === undefined
  ) {
    return undefined
  }

  if (!isWeekKey(weekKey)) {
    collector.add(joinPath(path, 'weekKey'), 'week_key_not_monday', 'A week key must be a Monday')
    return undefined
  }
  if (startDate !== weekKey) collector.add(joinPath(path, 'startDate'), 'week_dates_mismatch', 'Must equal the week key (the Monday)')
  let sunday: string | null
  try {
    sunday = weekEndOf(weekKey)
  } catch {
    sunday = null
  }
  if (endDate !== sunday) collector.add(joinPath(path, 'endDate'), 'week_dates_mismatch', 'Must be the Sunday of the week')
  if (updatedAt < createdAt) collector.add(joinPath(path, 'updatedAt'), 'out_of_range', 'Cannot precede createdAt')

  for (const issue of validateWeeklyBoardDefinition({ focus, goals, rewardTiers })) {
    collector.add(path, `board_${issue.code}`, `Invalid board: ${JSON.stringify(issue)}`)
  }

  if (status === 'active' && finalization !== null) {
    collector.add(joinPath(path, 'finalization'), 'status_finalization_mismatch', 'An active board has no finalization')
  }
  if (status === 'finalized' && finalization === null) {
    collector.add(joinPath(path, 'finalization'), 'status_finalization_mismatch', 'A finalized board must carry its finalization')
  }
  if (collector.issues.length > before) return undefined

  const board: WeeklyGoalBoard = {
    weekKey,
    startDate,
    endDate,
    focus,
    goals,
    rewardTiers,
    status,
    createdAt,
    updatedAt,
    revision,
    finalization,
  }
  if (finalization !== null) {
    checkFinalization(collector, board, finalization, path)
    if (collector.issues.length > before) return undefined
  }
  return board
}

export const parseWeeklyBoard = parserFor(readWeeklyBoard)

/** Reads an untrusted value as a `WeeklyRewardClaim` (shape and week key; the finalized board it needs is checked in `validateDataset`). */
export const readWeeklyRewardClaim: RecordReader<WeeklyRewardClaim> = (collector, value, path) => {
  const source = readObject(collector, value, path, CLAIM_REQUIRED)
  if (source === undefined) return undefined
  const before = collector.issues.length
  const weekKey = readDateKey(collector, source, 'weekKey', path)
  const tierMinScore = readTierScore(collector, source, 'tierMinScore', path)
  const rewardTextSnapshot = readString(collector, source, 'rewardTextSnapshot', path)
  const claimedAt = readSafeInteger(collector, source, 'claimedAt', path)
  if (
    collector.issues.length > before ||
    weekKey === undefined ||
    tierMinScore === undefined ||
    rewardTextSnapshot === undefined ||
    claimedAt === undefined
  ) {
    return undefined
  }
  if (!isWeekKey(weekKey)) {
    collector.add(joinPath(path, 'weekKey'), 'week_key_not_monday', 'A week key must be a Monday')
    return undefined
  }
  return { weekKey, tierMinScore, rewardTextSnapshot, claimedAt }
}

export const parseWeeklyRewardClaim = parserFor(readWeeklyRewardClaim)
