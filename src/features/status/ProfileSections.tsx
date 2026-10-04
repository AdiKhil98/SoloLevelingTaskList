import type { PlayerProfile, TopQuest } from '@/application'
import { DAILY_QUALITY_THRESHOLDS, WEEKLY_BOARD_TOTAL_POINTS } from '@/domain'
import { averageScoreLabel, categoryLabel, formatDateKey, UNKNOWN_QUEST_LABEL } from '../displayLabels'
import { CardLink, Row, StatCard } from './StatBlocks'
import { SectionLabel } from '@/components/ui/SectionLabel'

/** The statistics sections of the Status screen. Each is a plain read of `PlayerProfile`; nothing is computed here. */

export function DaysSection({ days }: { days: PlayerProfile['days'] }) {
  return (
    <StatCard id="days-heading" heading="DAYS">
      <dl>
        <Row term="Finalized days">{days.finalizedDays}</Row>
        <Row term={`Completed days (${DAILY_QUALITY_THRESHOLDS.completedPercent}%+)`}>{days.completedDays}</Row>
        <Row term={`Strong days (${DAILY_QUALITY_THRESHOLDS.strongPercent}%+)`}>{days.strongDays}</Row>
        <Row term="Perfect days (100%)">{days.perfectDays}</Row>
        <Row term="Incomplete days">{days.incompleteDays}</Row>
        {days.noActiveQuestDays > 0 && <Row term="No Active Quests days">{days.noActiveQuestDays}</Row>}
        <Row term="Completion rate">{days.completionRatePercent === null ? '—' : `${days.completionRatePercent}%`}</Row>
      </dl>
      <CardLink to="/status/history">Daily History</CardLink>
    </StatCard>
  )
}

function questName(quest: TopQuest): string {
  return quest.title ?? UNKNOWN_QUEST_LABEL
}

function questNote(quest: TopQuest): string | null {
  if (quest.titleSource !== 'template') return 'removed'
  return quest.archived ? 'archived' : null
}

function TopQuestRow({ quest }: { quest: TopQuest }) {
  const note = questNote(quest)
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <p className="min-w-0 break-words">
        {questName(quest)}
        {note !== null && <span className="text-muted"> ({note})</span>}
      </p>
      <p className="shrink-0 text-right font-semibold tabular-nums">
        {quest.completions} <span className="font-normal text-muted">{quest.completions === 1 ? 'time' : 'times'}</span>
      </p>
    </li>
  )
}

export function QuestsSection({ profile }: { profile: PlayerProfile }) {
  const topCategoryExp = Math.max(0, ...profile.categories.map((entry) => entry.exp))
  return (
    <StatCard id="quests-heading" heading="QUESTS">
      <dl>
        <Row term="Completed quests">{profile.totalCompletions}</Row>
        <Row term="Quest EXP">{profile.questExp}</Row>
        <Row term="Active quests">{profile.activeQuestCount}</Row>
      </dl>

      <SectionLabel as="h3" className="mt-3">BY CATEGORY</SectionLabel>
      <ul aria-label="Category totals">
        {profile.categories.map((entry) => (
          <li key={entry.category} className="border-b border-border py-3 last:border-b-0">
            <div className="flex items-baseline justify-between gap-4">
              <p className="min-w-0">{categoryLabel(entry.category)}</p>
              <p className="shrink-0 text-right font-display font-semibold tabular-nums">
                {entry.exp} <span className="font-sans font-normal text-muted">EXP · {entry.completions}</span>
              </p>
            </div>
            {/* A purely visual share of the largest category; the numbers above carry the meaning. */}
            <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-[2px] bg-border/70">
              <div
                className="h-full bg-linear-to-r from-accent-strong to-accent"
                style={{ width: `${topCategoryExp > 0 ? (entry.exp / topCategoryExp) * 100 : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {profile.topQuests.length > 0 && (
        <>
          <SectionLabel as="h3" className="mt-3">MOST COMPLETED</SectionLabel>
          <ol aria-label="Most completed quests" className="mb-2">
            {profile.topQuests.map((quest) => (
              <TopQuestRow key={quest.templateId} quest={quest} />
            ))}
          </ol>
        </>
      )}
    </StatCard>
  )
}

export function WeeklySection({ weekly }: { weekly: PlayerProfile['weekly'] }) {
  return (
    <StatCard id="weekly-stats-heading" heading="WEEKLY GOAL CRUSHER">
      <dl>
        <Row term="Weeks completed">{weekly.finalizedBoards}</Row>
        <Row term="Perfect Weeks">{weekly.perfectWeeks}</Row>
        <Row term="Best score">{weekly.bestScore === null ? '—' : `${weekly.bestScore} / ${WEEKLY_BOARD_TOTAL_POINTS}`}</Row>
        <Row term="Average score">
          {weekly.averageScore === null ? '—' : `${averageScoreLabel(weekly.averageScore)} / ${WEEKLY_BOARD_TOTAL_POINTS}`}
        </Row>
        <Row term="Weekly bonus EXP">{weekly.totalBonusExp}</Row>
        <Row term="Rewards claimed">{weekly.rewardsClaimed}</Row>
      </dl>
      <CardLink to="/weekly/history">Weekly History</CardLink>
    </StatCard>
  )
}

export function AchievementsSection({ achievements }: { achievements: PlayerProfile['achievements'] }) {
  return (
    <StatCard id="achievements-heading" heading="ACHIEVEMENTS">
      <dl>
        <Row term="Unlocked">
          {achievements.unlockedCount} / {achievements.totalCount}
        </Row>
      </dl>

      {achievements.recent.length === 0 ? (
        <p className="py-3 text-sm text-muted">None yet. Complete a quest to earn the first.</p>
      ) : (
        <>
          <SectionLabel as="h3" className="mt-3">RECENT</SectionLabel>
          <ul aria-label="Recent achievements" className="mb-2">
            {achievements.recent.map(({ definition, unlock }) => (
              <li key={definition.id} className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
                <p className="min-w-0 break-words font-medium">{definition.title}</p>
                {unlock !== null && <p className="shrink-0 text-right text-sm text-muted">{formatDateKey(unlock.unlockedOn)}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
      <CardLink to="/achievements">View all achievements</CardLink>
    </StatCard>
  )
}
