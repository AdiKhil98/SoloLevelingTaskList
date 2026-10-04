import { createElement, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** The element to render; a landmark `section` by default. */
  as?: 'section' | 'div' | 'li' | 'article'
  /** `accent` is the emphasised window (luminous border); use it once per screen at most. */
  tone?: 'default' | 'accent'
  /** HUD corner brackets. Reserved for the few windows that anchor a screen. */
  framed?: boolean
}

/**
 * A SYSTEM window: a thin-bordered, translucent dark panel. Static styling only
 * (the classes live in `globals.css`); it holds no state and no game rules.
 */
export function Panel({ as = 'section', tone = 'default', framed = false, className, ...rest }: PanelProps) {
  return createElement(as, {
    className: cn('system-panel', tone === 'accent' && 'system-panel-accent', framed && 'system-frame', className),
    ...rest,
  })
}
