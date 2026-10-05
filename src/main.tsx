import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { shellUpdates } from '@/platform/shellUpdates'
import '@/styles/globals.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root was not found in index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support (Phase 12). Production builds only: `vite dev` never has a service worker. It is optional
// infrastructure: it starts after the page has loaded and can never stop the app (it does not reject).
if (import.meta.env.PROD) void shellUpdates.start()
