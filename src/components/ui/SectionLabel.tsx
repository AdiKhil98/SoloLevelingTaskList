import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionLabelProps {
  id?: string
  /** `h1` for the screen's own title, `h2` for a section heading, `h3` for a sub-heading. */
  as?: 'h1' | 'h2' | 'h3' | 'p'
  children: ReactNode
  className?: string
}

/**
 * A `[ SECTION LABEL ]` in the display font. The brackets are decoration only
 * (aria-hidden), so the accessible name is just the label text. Non-breaking
 * spaces keep each bracket attached to its word when a long label wraps.
 */
export function SectionLabel({ id, as: Tag = 'h2', children, className }: SectionLabelProps) {
  return (
    <Tag id={id} className={cn('system-label', className)}>
      <span aria-hidden="true" className="system-label-mark">
        [&nbsp;
      </span>
      <span>{children}</span>
      <span aria-hidden="true" className="system-label-mark">
        &nbsp;]
      </span>
    </Tag>
  )
}
