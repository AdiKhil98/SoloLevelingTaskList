import { useEffect, useRef, useState } from 'react'
import { interpolateWhole } from './text'

/**
 * The whole number to show while `target` is being counted up to. It starts at
 * `startAt` (by default `target` itself, so a plain number on screen does not
 * animate when it mounts) and counts up whenever the target rises. With
 * `durationMs` 0 (reduced motion, tests) it is always `target`. A target that
 * goes DOWN (a new level started) snaps at once: only gains count. The
 * animation is one animation-frame loop that ends when the value arrives and is
 * cancelled if the component goes away.
 */
export function useCountUp(target: number, durationMs: number, startAt: number = target): number {
  const [shown, setShown] = useState(startAt)
  const [previousTarget, setPreviousTarget] = useState(target)
  const shownRef = useRef(startAt)

  // Derived during render (the supported pattern): a lower target, or no animation, shows the new value immediately.
  if (target !== previousTarget) {
    setPreviousTarget(target)
    if (target < shown || durationMs <= 0) setShown(target)
  }

  useEffect(() => {
    shownRef.current = shown
  }, [shown])

  useEffect(() => {
    if (durationMs <= 0) return
    const from = shownRef.current
    if (from >= target) return
    const startedAt = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      setShown(interpolateWhole(from, target, progress))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])

  return durationMs <= 0 ? target : shown
}
