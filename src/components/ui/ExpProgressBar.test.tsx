import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExpProgressBar } from './ExpProgressBar'

const fill = () => screen.getByRole('progressbar').firstElementChild as HTMLElement

describe('ExpProgressBar', () => {
  it('shows current / required EXP with progress semantics', () => {
    render(<ExpProgressBar value={82} max={238} />)

    expect(screen.getByText('82 / 238')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: 'EXP progress in current level' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '238')
    expect(bar).toHaveAttribute('aria-valuenow', '82')
    expect(bar).toHaveAttribute('aria-valuetext', '82 of 238 EXP')
    expect(fill().style.width).toBe(`${(82 / 238) * 100}%`)
  })

  it('works at zero', () => {
    render(<ExpProgressBar value={0} max={100} />)

    expect(screen.getByText('0 / 100')).toBeInTheDocument()
    expect(fill().style.width).toBe('0%')
  })

  it('works one point below the level boundary', () => {
    render(<ExpProgressBar value={99} max={100} />)

    expect(fill().style.width).toBe('99%')
  })

  it('works far above Level 100', () => {
    render(<ExpProgressBar value={13_204} max={14_000} />)

    expect(screen.getByText('13204 / 14000')).toBeInTheDocument()
    expect(fill().style.width).toBe(`${(13_204 / 14_000) * 100}%`)
  })

  it('never draws outside the track', () => {
    const { rerender } = render(<ExpProgressBar value={150} max={100} />)
    expect(fill().style.width).toBe('100%')

    rerender(<ExpProgressBar value={5} max={0} />)
    expect(fill().style.width).toBe('0%')
  })
})

describe('ExpProgressBar motion', () => {
  /** The exact utility class (the base also carries motion-reduce:transition-none). */
  const snaps = () => fill().classList.contains('transition-none')

  it('fills toward a higher value, and SNAPS (no draining) when the value goes down because a new level started', () => {
    const { rerender } = render(<ExpProgressBar value={90} max={100} fx="normal" />)
    rerender(<ExpProgressBar value={95} max={100} fx="normal" />)
    expect(snaps()).toBe(false)
    expect(fill().classList.contains('duration-[600ms]')).toBe(true)

    rerender(<ExpProgressBar value={12} max={140} fx="normal" />) // level up: the bar must not run backwards
    expect(snaps()).toBe(true)
    expect(fill().style.width).toBe(`${(12 / 140) * 100}%`)

    rerender(<ExpProgressBar value={40} max={140} fx="normal" />) // and fills again afterwards
    expect(snaps()).toBe(false)
  })

  it('reduced effects change at once', () => {
    const { rerender } = render(<ExpProgressBar value={10} max={100} fx="reduced" />)
    rerender(<ExpProgressBar value={60} max={100} fx="reduced" />)
    expect(snaps()).toBe(true)
    expect(fill().style.width).toBe('60%')
  })

  it('without an fx setting it keeps the original plain 300 ms fill', () => {
    render(<ExpProgressBar value={10} max={100} />)
    expect(fill().classList.contains('duration-300')).toBe(true)
  })

  it('a bar that is merely shown shows its value at once (the count-up only answers a change)', () => {
    render(<ExpProgressBar value={82} max={238} fx="normal" countMs={5_000} />)
    expect(screen.getByText('82 / 238')).toBeInTheDocument()
  })

  it('counts the visible number up to a gain, while the progress semantics already hold the final value', async () => {
    const { rerender } = render(<ExpProgressBar value={10} max={100} fx="normal" countMs={80} />)
    rerender(<ExpProgressBar value={60} max={100} fx="normal" countMs={80} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
    await waitFor(() => expect(screen.getByText('60 / 100')).toBeInTheDocument())
  })

  it('shows a lower value at once instead of counting down', () => {
    const { rerender } = render(<ExpProgressBar value={90} max={100} fx="normal" countMs={5_000} />)
    rerender(<ExpProgressBar value={5} max={140} fx="normal" countMs={5_000} />)
    expect(screen.getByText('5 / 140')).toBeInTheDocument()
  })

  it('glows only while a gain is being shown', () => {
    const { rerender } = render(<ExpProgressBar value={10} max={100} fx="normal" />)
    expect(screen.getByRole('progressbar').className).not.toContain('system-fx-bar-gain')
    rerender(<ExpProgressBar value={20} max={100} fx="normal" gain />)
    expect(screen.getByRole('progressbar').className).toContain('system-fx-bar-gain')
  })
})
