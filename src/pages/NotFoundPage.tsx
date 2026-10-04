import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="font-display text-2xl font-semibold">Page not found</h1>
      <p className="text-muted">There is nothing at this address.</p>
      <Link
        to="/"
        className="mt-2 inline-flex min-h-11 w-fit items-center rounded-[3px] border border-border px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        Back to start
      </Link>
    </section>
  )
}
