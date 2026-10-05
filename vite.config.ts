import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { shellPrecachePlugin } from './tools/shell-precache/plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), shellPrecachePlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // The UI tests are CPU-bound (jsdom, React, a fake IndexedDB). Vitest's default is one worker per
    // core, which on a desktop machine oversubscribes the CPU: single UI steps then take seconds instead
    // of milliseconds and a few tests (Weekly page) timed out in nearly every full run. Half the cores
    // keeps each test near its unloaded speed; the whole suite was measured to finish no later.
    maxWorkers: '50%',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'],
    css: false,
  },
})
