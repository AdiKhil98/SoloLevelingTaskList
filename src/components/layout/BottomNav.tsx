import { House, ScrollText, Target, User, type LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'

interface Destination {
  to: string
  label: string
  Icon: LucideIcon
  end?: boolean
  /** Other routes that belong to this destination (so its tab stays highlighted there). */
  alsoFor?: readonly string[]
}

// Only destinations that exist. Later phases extend this list.
const DESTINATIONS: readonly Destination[] = [
  { to: '/', label: 'Home', Icon: House, end: true },
  { to: '/quests', label: 'Quests', Icon: ScrollText },
  { to: '/weekly', label: 'Weekly', Icon: Target },
  { to: '/status', label: 'Status', Icon: User, alsoFor: ['/achievements'] },
]

/**
 * Bottom navigation for portrait phones: large touch targets, safe-area aware,
 * constrained to the same column as the page content on wide screens.
 */
export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-1/2 z-10 w-full max-w-md -translate-x-1/2 border-t border-border-strong bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <ul className="flex">
        {DESTINATIONS.map(({ to, label, Icon, end, alsoFor }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex h-(--nav-height) flex-col items-center justify-center gap-0.5 font-display text-[0.6875rem] font-semibold tracking-[0.12em] uppercase focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                  isActive || (alsoFor?.some((path) => pathname.startsWith(path)) ?? false)
                    ? 'bg-accent/10 text-accent before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:bg-accent before:shadow-glow-soft'
                    : 'text-muted active:text-foreground',
                )
              }
            >
              <Icon aria-hidden="true" className="size-5" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
