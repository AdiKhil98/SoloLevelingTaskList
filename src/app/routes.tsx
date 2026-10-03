import type { RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/features/home/HomePage'
import { CreateQuestPage } from '@/features/quests/CreateQuestPage'
import { EditQuestPage } from '@/features/quests/EditQuestPage'
import { QuestsPage } from '@/features/quests/QuestsPage'
import { ReportPage } from '@/features/report/ReportPage'
import { StatusPage } from '@/features/status/StatusPage'
import { WeeklyEditPage } from '@/features/weekly/WeeklyEditPage'
import { WeeklyHistoryPage } from '@/features/weekly/WeeklyHistoryPage'
import { WeeklyPage } from '@/features/weekly/WeeklyPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

/** Route table, kept separate from the router instance so tests can reuse it. */
export const appRoutes: RouteObject[] = [
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
