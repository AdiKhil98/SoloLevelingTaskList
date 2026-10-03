import type { RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/features/home/HomePage'
import { StatusPage } from '@/features/status/StatusPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

/** Route table, kept separate from the router instance so tests can reuse it. */
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'status', element: <StatusPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
