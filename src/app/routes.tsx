import type { RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { FoundationPage } from '@/pages/FoundationPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

/** Route table, kept separate from the router instance so tests can reuse it. */
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <FoundationPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
