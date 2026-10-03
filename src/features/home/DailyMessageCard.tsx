/** The Daily Message: one calm line per local day. */
export function DailyMessageCard({ text }: { text: string }) {
  return (
    <section aria-labelledby="daily-message-heading" className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-4">
      <h2 id="daily-message-heading" className="text-xs tracking-[0.3em] text-muted">
        DAILY MESSAGE
      </h2>
      <p className="text-base italic">“{text}”</p>
    </section>
  )
}
