import type { ClockStatus } from '@/application'

/**
 * Shown instead of the day's quests when the device date is earlier than the
 * last recorded day (OD-22). Nothing is changed or deleted; changes pause until
 * the device date reaches the recorded day again, which needs no action here.
 */
export function ClockBehindNotice({ clock }: { clock: Extract<ClockStatus, { status: 'behind' }> }) {
  return (
    <section role="alert" aria-labelledby="clock-behind-heading" className="flex flex-col gap-2 rounded-xl border border-amber-400/50 bg-amber-500/10 p-4">
      <h2 id="clock-behind-heading" className="font-semibold">
        Clock appears to have moved backwards
      </h2>
      <p className="text-sm">
        This device says it is {clock.localDate}, but the last recorded day is {clock.recordedDate}. Your progress is safe and
        nothing has been changed. Completing and editing quests is paused until the device date reaches {clock.recordedDate} again.
      </p>
    </section>
  )
}
