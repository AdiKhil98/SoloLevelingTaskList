import { Component, type ReactNode } from 'react'

interface LazyLoadBoundaryProps {
  /** What to show instead of the screen if it (or its code) could not be loaded. */
  fallback: ReactNode
  children: ReactNode
}

/**
 * Catches a lazily loaded screen that fails to load (its chunk could not be fetched: offline before it was cached,
 * or a deployment replaced it) so the app shows a calm message instead of unmounting. It changes nothing else and
 * never retries or reloads by itself: the fallback decides, and the player presses a button, so it cannot loop.
 */
export class LazyLoadBoundary extends Component<LazyLoadBoundaryProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error('A screen could not be loaded', error)
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
