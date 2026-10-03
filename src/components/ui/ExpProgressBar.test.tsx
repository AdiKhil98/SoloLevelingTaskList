import { render, screen } from '@testing-library/react'
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
