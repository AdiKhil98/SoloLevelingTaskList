import { Component, useEffect, type ReactNode } from 'react'
import { useRouteError } from 'react-router'
import { reloadPage } from '@/platform/page'
import { AppCrashScreen } from './StartupScreens'

/**
 * The last line of defence: a render error that nothing below caught would unmount the whole app and leave a blank
 * page (or React Router's developer error page, which shows a stack trace and no controls). Both of these show the
 * same calm SYSTEM screen instead. They change and retry nothing: the error is logged for the developer, and the
 * player chooses Reload or Home, so it cannot loop.
 */

/** The router's `errorElement` for the route tree: an error while a screen (or the shell) renders. */
export function RouteErrorScreen() {
  const error = useRouteError()
  useEffect(() => {
    console.error('A screen failed to render', error)
  }, [error])
  return <AppCrashScreen onReload={reloadPage} />
}

/** Wraps the whole application, for an error outside the route tree (the runtime provider, the router itself). */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error('The application failed to render', error)
  }

  override render(): ReactNode {
    return this.state.failed ? <AppCrashScreen onReload={reloadPage} /> : this.props.children
  }
}
