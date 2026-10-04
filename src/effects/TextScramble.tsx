import { useLayoutEffect, useRef } from 'react'
import { scrambleFrame } from './text'

interface TextScrambleProps {
  /** The final text. Assistive technology always reads exactly this, never the glyphs in between. */
  text: string
  /** Reduced effects (or no animation wanted): the text is simply there. */
  reduced: boolean
  durationMs?: number
  className?: string
}

const FRAME_MS = 33

/**
 * A SYSTEM heading that resolves from random glyphs into its text. It is for the
 * few earned headings (LEVEL UP, RANK ADVANCEMENT, PERFECT WEEK) and nothing
 * else. The complete text sits in a visually hidden node for screen readers; the
 * animated layer is `aria-hidden` and updated through a ref about 30 times a
 * second (no React re-render per frame), so assistive technology is never told
 * about the intermediate letters. Reduced effects render the text instantly.
 */
export function TextScramble({ text, reduced, durationMs = 700, className }: TextScrambleProps) {
  const visual = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const node = visual.current
    if (node === null) return
    if (reduced || durationMs <= 0) {
      node.textContent = text
      return
    }
    const startedAt = performance.now()
    let frame = 0
    let lastPaint = Number.NEGATIVE_INFINITY
    node.textContent = scrambleFrame(text, 0, Math.random) // before the first paint: no flash of the final text
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      if (progress >= 1) {
        node.textContent = text
        return
      }
      if (now - lastPaint >= FRAME_MS) {
        node.textContent = scrambleFrame(text, progress, Math.random)
        lastPaint = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      node.textContent = text
    }
  }, [text, reduced, durationMs])

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span ref={visual} aria-hidden="true">
        {text}
      </span>
    </span>
  )
}
