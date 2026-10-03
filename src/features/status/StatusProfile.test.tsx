import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildTemplate, d, newFactory } from '@/application/test-utils/helpers'
import { levelStateOf, totalExpToReachLevel, type RankId } from '@/domain'
import { createTemplate, openDatabase } from '@/persistence'
import { letDaysPass, letNeutralDaysPass, playFirstDay } from '@/test/historyUi'
import { renderApp } from '@/test/renderApp'
import { PlayerSections } from './PlayerSections'

const section = (name: string) => screen.findByRole('region', { name })
const value = (container: HTMLElement, term: string) => within(container).getByText(term).nextElementSibling

describe('Status: statistics for a new player', () => {
  it('shows every section with honest zeros and no invented history', async () => {
    renderApp({ path: '/status' })

    const days = await section('DAYS')
    expect(value(days, 'Finalized days')).toHaveTextContent('0')
    expect(value(days, 'Completion rate')).toHaveTextContent('—')
    expect(within(days).queryByText('No Active Quests days')).not.toBeInTheDocument()

    const quests = await section('QUESTS')
    expect(value(quests, 'Completed quests')).toHaveTextContent('0')
    expect(value(quests, 'Quest EXP')).toHaveTextContent('0')
    expect(value(quests, 'Active quests')).toHaveTextContent('6')
    expect(within(quests).queryByRole('list', { name: 'Most completed quests' })).not.toBeInTheDocument()

    const weekly = await section('WEEKLY GOAL CRUSHER')
    expect(value(weekly, 'Weeks completed')).toHaveTextContent('0')
    expect(value(weekly, 'Best score')).toHaveTextContent('—')
    expect(value(weekly, 'Average score')).toHaveTextContent('—')

    const achievements = await section('ACHIEVEMENTS')
    expect(value(achievements, 'Unlocked')).toHaveTextContent('0 / 28')
    expect(within(achievements).getByText(/None yet/)).toBeInTheDocument()
  })

  it('lists all five categories, even with nothing earned', async () => {
    renderApp({ path: '/status' })
    const quests = await section('QUESTS')
    const rows = within(within(quests).getByRole('list', { name: 'Category totals' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Discipline0 EXP · 0',
      'Fitness0 EXP · 0',
      'Business0 EXP · 0',
      'Knowledge0 EXP · 0',
      'Trading0 EXP · 0',
    ])
  })
})

describe('Status: statistics from played history', () => {
  it('derives days, quests, categories and achievements from a finished perfect day', async () => {
    const factory = newFactory()
    const clock = await playFirstDay(factory) // 6 of 6 defaults on Oct 5; Oct 5 finalized Perfect
    renderApp({ path: '/status', factory, clock })

    const days = await section('DAYS')
    expect(value(days, 'Finalized days')).toHaveTextContent('1')
    expect(value(days, 'Completed days (70%+)')).toHaveTextContent('1')
    expect(value(days, 'Strong days (85%+)')).toHaveTextContent('1')
    expect(value(days, 'Perfect days (100%)')).toHaveTextContent('1')
    expect(value(days, 'Incomplete days')).toHaveTextContent('0')
    expect(value(days, 'Completion rate')).toHaveTextContent('100%')

    const quests = await section('QUESTS')
    expect(value(quests, 'Completed quests')).toHaveTextContent('6')
    expect(value(quests, 'Quest EXP')).toHaveTextContent('70') // five prayers at 10 and Sleep at 20
    const categories = within(within(quests).getByRole('list', { name: 'Category totals' })).getAllByRole('listitem')
    expect(categories[0]).toHaveTextContent('Discipline70 EXP · 6')
    expect(categories[1]).toHaveTextContent('Fitness0 EXP · 0')
    const top = within(within(quests).getByRole('list', { name: 'Most completed quests' })).getAllByRole('listitem')
    expect(top.map((row) => row.textContent)).toEqual(['Fajr1 time', 'Dhuhr1 time', 'Asr1 time']) // ties: completed first wins

    const streaks = screen.getByRole('region', { name: 'Streaks' })
    expect(value(streaks, 'Total Perfect Days')).toHaveTextContent('1')

    const achievements = await section('ACHIEVEMENTS')
    expect(value(achievements, 'Unlocked')).toHaveTextContent('4 / 28') // First Quest + the three day milestones
    const recent = within(within(achievements).getByRole('list', { name: 'Recent achievements' })).getAllByRole('listitem')
    expect(recent).toHaveLength(3)
    expect(recent[0]).toHaveTextContent('Oct 5, 2026')
  })

  it('counts days with no completions as Incomplete and reports a rate of 0%', async () => {
    const factory = newFactory()
    const clock = await letDaysPass(factory, 3)
    renderApp({ path: '/status', factory, clock })
    const days = await section('DAYS')
    expect(value(days, 'Finalized days')).toHaveTextContent('3')
    expect(value(days, 'Incomplete days')).toHaveTextContent('3')
    expect(value(days, 'Completion rate')).toHaveTextContent('0%')
    expect(value(await section('ACHIEVEMENTS'), 'Unlocked')).toHaveTextContent('0 / 28')
  })

  it('keeps No Active Quests days neutral: counted as finalized, shown apart, never in the rate or a streak', async () => {
    const factory = newFactory()
    const clock = await letNeutralDaysPass(factory, 3) // Oct 5 Incomplete (0 of 6), Oct 6 and 7 have no quests
    renderApp({ path: '/status', factory, clock })

    const days = await section('DAYS')
    expect(value(days, 'Finalized days')).toHaveTextContent('3')
    expect(value(days, 'Incomplete days')).toHaveTextContent('1')
    expect(value(days, 'No Active Quests days')).toHaveTextContent('2')
    expect(value(days, 'Completion rate')).toHaveTextContent('0%') // the one active day: 0 of 6
    const streaks = screen.getByRole('region', { name: 'Streaks' })
    expect(value(streaks, 'Daily Streak')).toHaveTextContent('0 days')
    expect(value(await section('ACHIEVEMENTS'), 'Unlocked')).toHaveTextContent('0 / 28')
  })

  it('wraps a very long quest name instead of overflowing, and keeps its count visible', async () => {
    const factory = newFactory()
    const database = await openDatabase({ factory })
    const longTitle = 'Review every single open position and rewrite the entire trading plan before the market opens tomorrow'
    await createTemplate(database, buildTemplate({ id: 'tpl_long', title: longTitle, difficulty: 'E', createdAt: 9, activeFrom: d('2026-10-05') }))
    database.close()
    renderApp({ path: '/', factory })
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^Complete ${longTitle.slice(0, 20)}`) }))
    await waitFor(() => expect(screen.getByText('10 / 100')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('link', { name: 'Status' }))
    const quests = await section('QUESTS')
    const row = (await within(quests).findByRole('list', { name: 'Most completed quests' })).firstElementChild as HTMLElement
    const name = within(row).getByText(longTitle)
    expect(name.className).toContain('break-words')
    expect(name.className).toContain('min-w-0')
    expect(row).toHaveTextContent('1 time')
  })

  it('links to the full achievements, the Daily History and the Weekly History', async () => {
    renderApp({ path: '/status' })
    expect(await within(await section('ACHIEVEMENTS')).findByRole('link', { name: 'View all achievements' })).toHaveAttribute('href', '/achievements')
    expect(within(await section('DAYS')).getByRole('link', { name: 'Daily History' })).toHaveAttribute('href', '/status/history')
    expect(within(await section('WEEKLY GOAL CRUSHER')).getByRole('link', { name: 'Weekly History' })).toHaveAttribute('href', '/weekly/history')
  })
})

describe('Status: when the statistics cannot be read', () => {
  /** A claim row that fails validation: only the statistics read every claim, so only they fail. */
  async function corruptClaim(factory: IDBFactory) {
    const database = await openDatabase({ factory })
    const transaction = database.openTransaction(['weeklyRewardClaims'], 'readwrite')
    transaction.objectStore('weeklyRewardClaims').put({ weekKey: '2026-09-28', garbage: true })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  }

  it('keeps the player sections, says the statistics failed and recovers on Retry', async () => {
    const factory = newFactory()
    await corruptClaim(factory)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderApp({ path: '/status', factory })

    expect(await screen.findByRole('alert')).toHaveTextContent('Your statistics could not be loaded.')
    expect(screen.getByRole('region', { name: 'Player status' })).toBeInTheDocument() // the snapshot part still shows
    expect(screen.queryByRole('region', { name: 'DAYS' })).not.toBeInTheDocument()
    expect(spy).toHaveBeenCalled()

    // repair the data, then retry
    const database = await openDatabase({ factory })
    const transaction = database.openTransaction(['weeklyRewardClaims'], 'readwrite')
    transaction.objectStore('weeklyRewardClaims').clear()
    await new Promise<void>((resolve) => {
      transaction.oncomplete = () => resolve()
    })
    database.close()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('region', { name: 'DAYS' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Player section: rank display at and beyond Level 100 (OD-01)', () => {
  const playerAt = (level: number) => {
    const totalExp = totalExpToReachLevel(level) + 5
    const state = levelStateOf(totalExp)
    return { totalExp, ...state }
  }

  function renderPlayer(level: number) {
    const { unmount } = render(<PlayerSections player={playerAt(level)} />)
    const sheet = screen.getByRole('region', { name: 'Player status' })
    const read = (term: string) => within(sheet).getByText(term).nextElementSibling?.textContent
    const result = { level: read('Level'), rank: read('Rank') }
    unmount()
    return result
  }

  const READS: Array<[number, string]> = [
    [1, 'E-RANK'],
    [9, 'E-RANK'],
    [10, 'D-RANK'],
    [35, 'B-RANK'],
    [75, 'S-RANK'],
    [99, 'S-RANK'],
    [100, '???'],
    [101, '???'],
    [137, '???'],
    [250, '???'],
  ]

  it.each(READS)('level %i reads %s', (level, label) => {
    expect(renderPlayer(level)).toEqual({ level: String(level), rank: label })
  })

  it('keeps raising the level past 100 and never shows the internal rank id', () => {
    const player = playerAt(137)
    expect(player.level).toBe(137)
    expect(player.rank satisfies RankId).toBe('special_100_plus')
    render(<PlayerSections player={player} />)
    expect(screen.queryByText(/special_100_plus|special/i)).not.toBeInTheDocument()
    expect(screen.getByText('???')).toBeInTheDocument()
  })

  it('still draws the current-level bar beyond Level 100', () => {
    render(<PlayerSections player={playerAt(120)} />)
    const bar = screen.getByRole('progressbar', { name: /EXP progress/ })
    expect(Number(bar.getAttribute('aria-valuenow'))).toBe(5)
    expect(Number(bar.getAttribute('aria-valuemax'))).toBeGreaterThan(5)
  })
})
