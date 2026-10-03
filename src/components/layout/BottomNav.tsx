import { House, User, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'

interface Destination {
  to: string
  label: string
  Icon: LucideIcon
  end?: boolean
}

// Only destinations that exist. Later phases extend this list.
const DESTINATIONS: readonly Destination[] = [
  { to: '/', label: 'Home', Icon: House, end: true },
  { to: '/status', label: 'Status', Icon: User },
]

/**
 * Bottom navigation for portrait phones: large touch targets, safe-area aware,
 * constrained to the same column as the page content on wide screens.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-1/2 z-10 w-full max-w-md -translate-x-1/2 border-t border-border bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <ul className="flex">
        {DESTINATIONS.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                  isActive ? 'text-accent' : 'text-muted active:text-foreground',
                )
              }
            >
              <Icon aria-hidden="true" className="size-6" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
