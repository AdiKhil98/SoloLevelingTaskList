# SoloLevelingTaskList — Foundation (Phase 01)

Facts about the Phase 01 toolchain that later phases need. Product rules live in [MASTER_SPEC.md](MASTER_SPEC.md); this file does not duplicate them.

## Toolchain

Node 24.18 / npm 11.5 (npm only; `package-lock.json` is committed).

| Package | Version | Note |
|---------|---------|------|
| React / React DOM | 19.3 | `StrictMode` in `src/main.tsx` |
| Vite | 8.3 | with `@vitejs/plugin-react` 6 |
| TypeScript | **~6.0.3** | Held below 7: `typescript-eslint` 8.71 declares `typescript >=4.8.4 <6.1.0`. Revisit when it supports 7. |
| Tailwind CSS | 4.3 (`@tailwindcss/vite`) | CSS-first config; no `tailwind.config.*` |
| React Router | 8.4 | data router; DOM provider imported from `react-router/dom` |
| Vitest | 5.0 + jsdom 30 + Testing Library | |
| ESLint | 10 (flat config) | typescript-eslint, react-hooks, react-refresh |

## Commands

```
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build
npm run typecheck  # tsc -b
npm run lint       # eslint .
npm run test       # vitest (watch)
npm run test:run   # vitest run (CI style)
```

## Source tree and entry points

```
src/main.tsx                 entry (StrictMode, imports styles)
src/app/App.tsx              RouterProvider
src/app/router.ts            createBrowserRouter(appRoutes)
src/app/routes.tsx           route table (also used by tests)
src/components/layout/       AppShell (layout route, <main>, <Outlet/>)
src/components/ui/           reserved for shadcn-style primitives
src/pages/                   NotFoundPage (the Phase 01 FoundationPage placeholder was replaced by Home in Phase 04)
src/features/                reserved for feature modules
src/lib/utils.ts             cn() = clsx + tailwind-merge
src/styles/globals.css       Tailwind import, placeholder tokens, base rules
src/test/setup.ts            jest-dom matchers + cleanup
```

- **Alias:** `@/*` → `src/*`, declared in `tsconfig.app.json` and `vite.config.ts` (Vitest reads the same Vite config).
- **shadcn:** `components.json` targets `src/styles/globals.css`, `@/components`, `@/components/ui`, `@/lib`, `@/hooks`. No components were generated.
- **Styling tokens:** `--background`, `--foreground`, `--surface`, `--border`, `--muted` in `globals.css`, exposed as Tailwind colors (`bg-background`, `text-muted`, …). These are placeholders; Phase 09 owns the real visual language.
- **Tests:** colocated `*.test.ts(x)` under `src/`.

## Layer boundaries (lint-enforced)

`eslint.config.js` encodes MASTER_SPEC §3.2 via `no-restricted-imports`, for directories that later phases create:

- `src/domain/**` may import from no other layer and not from React, React Router, or Lucide (the unused Framer Motion dependency was removed in Phase 14).
- `src/persistence/**` may import `domain` only (and no UI packages).
- `src/application/**` (added in Phase 04) may import `domain` and `persistence` only (and no UI packages); no lower layer may import it.
- `src/effects/**` may import `domain` only (plus UI/animation packages).
- `src/platform/**` may import no other layer.

These directories did not exist in Phase 01; the rules apply the moment files appear there (`src/domain/` arrived in Phase 02, `src/persistence/` in Phase 03, `src/application/` and `src/platform/` in Phase 04). If a phase finds a boundary too strict, report it and adjust `eslint.config.js` deliberately.

## Not in Phase 01

No game rules, persistence, service worker or manifest, onboarding, or visual effects. `index.html` carries only the viewport, `theme-color`, and description metadata; installability and offline use belong to Phase 12.
