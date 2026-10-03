import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ACHIEVEMENT_CATALOG, evaluateAchievements } from '@/domain'
import { newFactory } from '@/application/test-utils/helpers'
import { playFirstDay } from '@/test/historyUi'
import { renderApp } from '@/test/renderApp'
import { AchievementItem } from './AchievementItem'

const ready = () => screen.findByRole('heading', { name: 'ACHIEVEMENTS' })
const item = (title: string) => screen.getByText(title, { selector: 'p' }).closest('li') as HTMLElement

describe('Achievements screen: a new player', () => {
  it('shows all 28 achievements locked, in the five groups, with 0 / 28 unlocked', async () => {
    renderApp({ path: '/achievements' })
    await ready()
    expect(await screen.findByText('0 / 28')).toBeInTheDocument()

    const groups = ['General', 'Daily', 'Streak', 'Weekly', 'Rank']
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(groups.map((group) => group.toUpperCase()))
    const sizes = groups.map((group) => within(screen.getByRole('list', { name: `${group} achievements` })).getAllByRole('listitem').length)
    expect(sizes).toEqual([6, 6, 4, 6, 6])
    expect(screen.getAllByText(/^Locked/)).toHaveLength(28)
    expect(screen.queryByText(/^Unlocked /)).not.toBeInTheDocument()
  })

  it('shows every title and description from the catalog', async () => {
    renderApp({ path: '/achievements' })
    await ready()
    await screen.findByText('0 / 28')
    for (const { title, description } of ACHIEVEMENT_CATALOG) {
      expect(screen.getAllByText(title, { selector: 'p' }).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(description, { selector: 'p' }).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('says achievements award no EXP', async () => {
    renderApp({ path: '/achievements' })
    expect(await screen.findByText(/award no EXP/)).toBeInTheDocument()
  })

  it('shows progress where it means something: a bar for multi-step targets, none for a single step', async () => {
    renderApp({ path: '/achievements' })
    await screen.findByText('0 / 28')

    expect(within(item('10 Quests')).getByText(/0 \/ 10 quests/)).toBeInTheDocument()
    expect(within(item('10 Quests')).getByRole('progressbar', { name: '10 Quests progress' })).toHaveAttribute('aria-valuenow', '0')
    expect(within(item('Reach D Rank')).getByText(/Level 1 \/ 10/)).toBeInTheDocument()
    expect(within(item('7 Day Streak')).getByText(/0 \/ 7 days/)).toBeInTheDocument()
    expect(within(item('3 Perfect Weeks')).getByText(/0 \/ 3 weeks/)).toBeInTheDocument()

    expect(within(item('First Quest')).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(item('First Perfect Day')).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('never names the Level 100+ rank: Level 100 is a plain level milestone', async () => {
    renderApp({ path: '/achievements' })
    await screen.findByText('0 / 28')
    expect(within(item('Level 100')).getByText('Reach Level 100.')).toBeInTheDocument()
    expect(screen.queryByText(/\?\?\?/)).not.toBeInTheDocument()
  })
})

describe('Achievements screen: after a finished day', () => {
  it('unlocks what the history earned, dated by the record, and leaves the rest locked with progress', async () => {
    const factory = newFactory()
    const clock = await playFirstDay(factory) // six of six on Oct 5, finalized Perfect
    renderApp({ path: '/achievements', factory, clock })
    await screen.findByText('4 / 28')

    for (const title of ['First Quest', 'First Completed Day', 'First Strong Day', 'First Perfect Day']) {
      expect(within(item(title)).getByText('Unlocked Oct 5, 2026')).toBeInTheDocument()
      expect(within(item(title)).queryByRole('progressbar')).not.toBeInTheDocument()
    }
    expect(within(item('10 Quests')).getByText(/Locked/)).toHaveTextContent('Locked · 6 / 10 quests')
    expect(within(item('10 Quests')).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '6')
    expect(within(item('3 Day Streak')).getByText(/Locked/)).toHaveTextContent('Locked · 1 / 3 days')
    expect(screen.getAllByText(/^Unlocked /)).toHaveLength(4)
    expect(screen.getAllByText(/^Locked/)).toHaveLength(24)
  })

  it('is reachable from Status and goes back to it', async () => {
    renderApp({ path: '/status' })
    fireEvent.click(await screen.findByRole('link', { name: 'View all achievements' }))
    await ready()
    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'STATUS' })).toBeInTheDocument()
  })

  it('keeps the Status tab highlighted while on the Achievements screen', async () => {
    renderApp({ path: '/achievements' })
    await ready()
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Status' }).className).toContain('text-accent')
    expect(within(nav).getByRole('link', { name: 'Home' }).className).not.toContain('text-accent')
  })
})

describe('AchievementItem', () => {
  const [firstQuest, quests10] = evaluateAchievements({ ledger: [], dailySummaries: [], weeklyBoards: [] }) as [ReturnType<typeof evaluateAchievements>[number], ReturnType<typeof evaluateAchievements>[number]]

  it('wraps long text: title and description may break and the card may shrink', () => {
    const longTitle = 'Supercalifragilisticexpialidocious achievement title with an unbroken run: ' + 'x'.repeat(60)
    render(
      <ul>
        <AchievementItem status={{ ...quests10, definition: { ...quests10.definition, title: longTitle, description: 'y'.repeat(120) } }} />
      </ul>,
    )
    const title = screen.getByText(longTitle)
    expect(title.className).toContain('break-words')
    expect(title.parentElement?.className).toContain('min-w-0')
    expect(screen.getByText('y'.repeat(120)).className).toContain('break-words')
  })

  it('shows an unlocked achievement with its date and no progress bar', () => {
    render(
      <ul>
        <AchievementItem
          status={{
            ...firstQuest,
            unlock: { unlockedAt: 1, unlockedOn: '2026-10-05' as never, evidence: { type: 'daily_summary', dateKey: '2026-10-05' as never } },
          }}
        />
      </ul>,
    )
    expect(screen.getByText('Unlocked Oct 5, 2026')).toBeInTheDocument()
    expect(screen.queryByText(/Locked/)).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
