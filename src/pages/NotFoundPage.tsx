import { Link } from 'react-router'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { BUTTON_PRIMARY } from '@/components/ui/styles'
import { cn } from '@/lib/utils'

export function NotFoundPage() {
  return (
    <section className="flex flex-col gap-4">
      <SectionLabel as="h1" className="text-sm tracking-[0.3em] text-accent">
        Page not found
      </SectionLabel>
      <p className="text-muted">There is nothing at this address.</p>
      <Link to="/" className={cn(BUTTON_PRIMARY, 'w-fit')}>
        Back to start
      </Link>
    </section>
  )
}
