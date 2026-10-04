import { Panel } from '@/components/ui/Panel'
import { SectionLabel } from '@/components/ui/SectionLabel'

/** The Daily Message: one calm line per local day. */
export function DailyMessageCard({ text }: { text: string }) {
  return (
    <Panel aria-labelledby="daily-message-heading" className="flex flex-col gap-2 border-l-2 border-l-accent-2 p-4">
      <SectionLabel id="daily-message-heading">DAILY MESSAGE</SectionLabel>
      <p className="text-base italic">“{text}”</p>
    </Panel>
  )
}
