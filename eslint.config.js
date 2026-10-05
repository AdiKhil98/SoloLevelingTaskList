import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Layer import boundaries (MASTER_SPEC §3.2). The directories below are
 * introduced by later phases; the rules are in place now so the dependency
 * direction is enforced from the first line of code written there.
 *
 *   domain       -> nothing (no other layer, no React/animation/router)
 *   persistence  -> domain only
 *   application  -> domain + persistence only (framework-free use cases)
 *   effects      -> domain (event types) only
 *   platform     -> no game rules (not domain, not persistence)
 */
const LAYERS = [
  'domain',
  'persistence',
  'application',
  'app',
  'features',
  'components',
  'pages',
  'hooks',
  'effects',
  'platform',
]

const UI_PACKAGES = [
  'react',
  'react-dom',
  'react-dom/*',
  'react-router',
  'react-router/*',
  'framer-motion',
  'lucide-react',
]

function layerPatterns(layers) {
  return layers.flatMap((layer) => [
    `@/${layer}`,
    `@/${layer}/**`,
    `**/${layer}`,
    `**/${layer}/**`,
  ])
}

function boundary(files, forbiddenLayers, { forbidUiPackages = false } = {}) {
  const patterns = [
    {
      group: layerPatterns(forbiddenLayers),
      message: 'Import crosses a forbidden architecture layer boundary.',
    },
  ]
  if (forbidUiPackages) {
    patterns.push({
      group: UI_PACKAGES,
      message: 'This layer must not depend on React, routing, or animation.',
    })
  }
  return {
    files,
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  }
}

const without = (...keep) => LAYERS.filter((layer) => !keep.includes(layer))

export default defineConfig([
  globalIgnores(['dist', 'coverage', '_reference']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite(),
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js', 'tools/**/*.{ts,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Node scripts outside the application (the PWA output check): plain JavaScript, linted like the rest.
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.node },
  },
  {
    // The service worker (Phase 12) is its own tiny program. It may import nothing from the application, and it
    // must never reach player data: no IndexedDB, no storage, no persistence code. A name like these anywhere in
    // the worker's code (even `scope.indexedDB`) fails lint.
    files: ['src/sw/**'],
    ignores: ['src/sw/**/*.test.ts'], // the tests have to NAME these things in order to prove the worker never uses them
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/**', ...layerPatterns(LAYERS), ...UI_PACKAGES], message: 'The service worker imports nothing from the application.' },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Identifier[name=/^(indexedDB|IDB[A-Za-z]*|openDatabase|localStorage|sessionStorage)$/]',
          message: 'The service worker must never touch IndexedDB, storage or player data.',
        },
      ],
    },
  },
  boundary(['src/domain/**'], without('domain'), { forbidUiPackages: true }),
  boundary(['src/persistence/**'], without('domain', 'persistence'), {
    forbidUiPackages: true,
  }),
  boundary(['src/application/**'], without('domain', 'persistence', 'application'), {
    forbidUiPackages: true,
  }),
  boundary(['src/effects/**'], without('domain', 'effects')),
  boundary(['src/platform/**'], without('platform')),
])
