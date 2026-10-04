import type { RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
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
      children: [
        { index: true, element: <HomePage /> },
        { path: 'quests', element: <QuestsPage /> },
        { path: 'quests/new', element: <CreateQuestPage /> },
        { path: 'quests/:templateId/edit', element: <EditQuestPage /> },
        { path: 'weekly', element: <WeeklyPage /> },
        { path: 'weekly/edit', element: <WeeklyEditPage /> },
        { path: 'weekly/history', element: <WeeklyHistoryPage /> },
        { path: 'report', element: <ReportPage /> },
        { path: 'status', element: <StatusPage /> },
        { path: 'status/history', element: <DailyHistoryPage /> },
        { path: 'achievements', element: <AchievementsPage /> },
        ...(dev ? DEV_ROUTES : []),
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ]
}

/** Route table, kept separate from the router instance so tests can reuse it. */
export const appRoutes: RouteObject[] = buildAppRoutes({ dev: import.meta.env.DEV })
