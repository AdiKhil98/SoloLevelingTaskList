import type { RouteObject } from 'react-router'
import { RouteErrorScreen } from '@/app/AppErrorBoundary'
import { AppShell } from '@/components/layout/AppShell'
import type { RouteHandle } from '@/components/layout/pageChrome'
import { AchievementsPage } from '@/features/achievements/AchievementsPage'
import { HomePage } from '@/features/home/HomePage'
import { CreateQuestPage } from '@/features/quests/CreateQuestPage'
import { EditQuestPage } from '@/features/quests/EditQuestPage'
import { QuestsPage } from '@/features/quests/QuestsPage'
import { ReportPage } from '@/features/report/ReportPage'
import { DailyHistoryPage } from '@/features/status/DailyHistoryPage'
import { StatusPage } from '@/features/status/StatusPage'
import { WeeklyEditPage } from '@/features/weekly/WeeklyEditPage'
import { WeeklyHistoryPage } from '@/features/weekly/WeeklyHistoryPage'
import { WeeklyPage } from '@/features/weekly/WeeklyPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

/** The route's screen name, shown in the page title (see `usePageChrome`). */
const titled = (title: string): RouteHandle => ({ title })

/**
 * The development-only effects lab. `import.meta.env.DEV` is a build-time constant:
 * in a production build this whole expression (the route and its dynamic import)
 * is removed, so the lab is neither routable nor shipped as a chunk. It only ever
 * injects synthetic presentation events; see `EffectsLab`.
 */
const DEV_ROUTES: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/effects',
        handle: titled('Effects Lab'),
        lazy: async () => ({ Component: (await import('@/features/presentation/dev/EffectsLab')).default }),
      },
    ]
  : []

/** The route table. `dev` adds the development-only routes; the app passes the build mode, tests pass either. */
export function buildAppRoutes({ dev }: { dev: boolean }): RouteObject[] {
  return [
    {
      path: '/',
      element: <AppShell />,
      // A screen that fails to render shows the SYSTEM crash screen, not the router's developer error page.
      errorElement: <RouteErrorScreen />,
      children: [
        { index: true, element: <HomePage />, handle: titled('Home') },
        { path: 'quests', element: <QuestsPage />, handle: titled('Quests') },
        { path: 'quests/new', element: <CreateQuestPage />, handle: titled('New Quest') },
        { path: 'quests/:templateId/edit', element: <EditQuestPage />, handle: titled('Edit Quest') },
        { path: 'weekly', element: <WeeklyPage />, handle: titled('Weekly') },
        { path: 'weekly/edit', element: <WeeklyEditPage />, handle: titled('Weekly Goals') },
        { path: 'weekly/history', element: <WeeklyHistoryPage />, handle: titled('Weekly History') },
        { path: 'report', element: <ReportPage />, handle: titled('Daily Report') },
        { path: 'status', element: <StatusPage />, handle: titled('Status') },
        { path: 'status/history', element: <DailyHistoryPage />, handle: titled('Daily History') },
        { path: 'achievements', element: <AchievementsPage />, handle: titled('Achievements') },
        ...(dev ? DEV_ROUTES : []),
        { path: '*', element: <NotFoundPage />, handle: titled('Page not found') },
      ],
    },
  ]
}

/** Route table, kept separate from the router instance so tests can reuse it. */
export const appRoutes: RouteObject[] = buildAppRoutes({ dev: import.meta.env.DEV })
