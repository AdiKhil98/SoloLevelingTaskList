import { useLayoutEffect, useRef } from 'react'
import { typedPrefix } from './text'

interface TypewriterProps {
  /** The full message. Assistive technology reads all of it at once, never the partial line. */
  text: string
  /** Reduced effects (or no animation wanted): the whole message is simply there. */
  reduced: boolean
  /** Total typing time. */
  durationMs?: number
  /** Wait before the first character. */
  delayMs?: number
  className?: string
}

const STEP_MS = 30

/**
 * A SYSTEM message typed out character by character. It is for a few major
 * SYSTEM lines (a rank reveal, a weekly result), never for ordinary text. Like
 * `TextScramble`, the complete text is in a visually hidden node and the typed
 * layer is `aria-hidden`, updated through a ref. A blinking caret (a CSS
 * pseudo-element, only while typing) is the one extra mark.
 */
export function Typewriter({ text, reduced, durationMs = 900, delayMs = 0, className }: TypewriterProps) {
  const visual = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const node = visual.current
    if (node === null) return
    if (reduced || durationMs <= 0) {
      node.textContent = text
      return
    }
    node.textContent = ''
    node.dataset.typing = 'true'
    const startedAt = performance.now() + delayMs
    let frame = 0
    let lastStep = Number.NEGATIVE_INFINITY
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs))
      if (progress >= 1) {
        node.textContent = text
        delete node.dataset.typing
        return
      }
      if (now - lastStep >= STEP_MS) {
        node.textContent = typedPrefix(text, progress)
        lastStep = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      node.textContent = text
      delete node.dataset.typing
    }
  }, [text, reduced, durationMs, delayMs])

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span ref={visual} aria-hidden="true" className="system-fx-caret">
        {text}
      </span>
    </span>
  )
}
