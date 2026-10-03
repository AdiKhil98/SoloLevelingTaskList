import { msUntilNextLocalMidnight } from '@/domain'
import { readClock, type Clock } from '../clock'

/**
 * How long until the device clock reaches the next local midnight. A hint for
 * scheduling a convenience wake-up only: correctness never depends on it
 * (reconciliation on startup, resume and before every change is authoritative).
 */
export function msUntilMidnight(clock: Clock): number {
  return msUntilNextLocalMidnight(readClock(clock))
}
