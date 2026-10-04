import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MeterBar } from './MeterBar'
import { Panel } from './Panel'
import { RankBadge } from './RankBadge'
import { SectionLabel } from './SectionLabel'

describe('SectionLabel', () => {
  it('names a heading by its text alone: the decorative brackets are hidden from assistive technology', () => {
    render(<SectionLabel id="quests-heading">DAILY QUESTS</SectionLabel>)
    const heading = screen.getByRole('heading', { level: 2, name: 'DAILY QUESTS' })
    expect(heading).toHaveAttribute('id', 'quests-heading')
    const marks = heading.querySelectorAll('[aria-hidden="true"]')
    expect(marks).toHaveLength(2)
    expect([...marks].map((mark) => mark.textContent?.replace(/\s/g, ''))).toEqual(['[', ']'])
  })

  it('can be the screen title (h1) or a sub-heading (h3)', () => {
    render(
      <>
        <SectionLabel as="h1">QUESTS</SectionLabel>
        <SectionLabel as="h3">BY CATEGORY</SectionLabel>
      </>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'QUESTS' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'BY CATEGORY' })).toBeInTheDocument()
  })

  it('keeps each bracket glued to its word with a non-breaking space, so a wrapped label never strands one', () => {
    render(<SectionLabel>DAILY STREAK</SectionLabel>)
    const text = screen.getByRole('heading').textContent ?? ''
    expect(text).toBe('[ DAILY STREAK ]')
  })
})

describe('Panel', () => {
  it('is a labelled region when it is given a label', () => {
    render(
      <Panel aria-labelledby="player-heading">
        <SectionLabel id="player-heading">PLAYER</SectionLabel>
      </Panel>,
    )
    expect(screen.getByRole('region', { name: 'PLAYER' })).toBeInTheDocument()
  })

  it('renders the element it is asked to (a list item inside a list)', () => {
    render(
      <ul>
        <Panel as="li">one</Panel>
      </ul>,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent('one')
  })

  it('is plain content: it adds no role of its own and no interactivity', () => {
    render(<Panel as="div">content</Panel>)
    expect(screen.getByText('content').getAttribute('role')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('MeterBar', () => {
  it('is a progressbar that exposes its numbers and a spoken value', () => {
    render(<MeterBar value={3} max={10} label="10 Quests progress" valueText="3 / 10 quests" />)
    const bar = screen.getByRole('progressbar', { name: '10 Quests progress' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '10')
    expect(bar).toHaveAttribute('aria-valuenow', '3')
    expect(bar).toHaveAttribute('aria-valuetext', '3 / 10 quests')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('30%')
  })

  it('never draws or reports more than the track holds, and never less than empty', () => {
    const { rerender } = render(<MeterBar value={15} max={10} label="over" valueText="over" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10')
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('100%')
    rerender(<MeterBar value={-4} max={10} label="under" valueText="under" />)
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('0%')
  })

  it('an empty target draws an empty bar instead of dividing by zero', () => {
    render(<MeterBar value={0} max={0} label="none" valueText="none" />)
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('0%')
  })
})

describe('RankBadge', () => {
  it('shows the label it is given, including the Level 100+ placeholder', () => {
    const { rerender } = render(<RankBadge label="E-RANK" />)
    expect(screen.getByText('E-RANK')).toBeInTheDocument()
    rerender(<RankBadge label="???" />)
    expect(screen.getByText('???')).toBeInTheDocument()
  })
})
