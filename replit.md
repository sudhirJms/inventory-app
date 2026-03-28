# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Inventory Data Manager app — tracks parts/inventory with CSV import/export, image attachment, global announcements, admin dev mode, and dark mode. All data is stored in PostgreSQL and shared across all users in real-time.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **State management**: React Query (TanStack Query)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (API) + Vite (frontend)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (also serves frontend in production)
│   └── inventory-manager/  # React inventory management UI
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── render.yaml             # Render.com deployment config
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Deployment (Render / Production)

The app deploys as a **single service** — Express serves both the API (`/api/*`) and the built React app (static files).

### How to deploy on Render:
1. Push code to GitHub/GitLab
2. Create new Render web service from the repo
3. Render reads `render.yaml` automatically — it sets up the service + PostgreSQL database
4. Add `DATABASE_URL` env var (Render auto-injects from linked database)
5. Deploy!

### Manual build commands (for reference):
```bash
# Build API server (cleans dist/)
node artifacts/api-server/build.mjs

# Build React frontend (outputs to artifacts/api-server/dist/public/)
NODE_ENV=production pnpm --filter @workspace/inventory-manager run build

# Start server
NODE_ENV=production node --enable-source-maps artifacts/api-server/dist/index.mjs
```

### Required environment variables:
- `DATABASE_URL` — PostgreSQL connection string
- `NODE_ENV=production` — enables static file serving
- `PORT` — set automatically by Render

## Development

```bash
# Start API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Start React dev server (proxies /api → localhost:8080)
pnpm --filter @workspace/inventory-manager run dev
```

## Key Architecture Decisions

- **Search**: `searchInput` (typing) triggers instant suggestions via `useMemo`; `searchQuery` (actual filter) only updates on SEARCH click/Enter — prevents rendering lag with 1000+ parts.
- **Shared data**: All inventory state in PostgreSQL via singleton row (id=1) in `inventoryState` table. All users see the same data.
- **Announcements**: Saved to DB, shown globally to all users.
- **Admin auth**: Password checked client-side only (per-device), stored in localStorage. Passwords: "AS0511" (default) + hardcoded bypass.
- **Dark mode**: Persisted in localStorage (`inventory_darkmode`).
- **Images**: Stored as base64 in PostgreSQL JSON column. Body limit set to 50mb.
- **CSV export**: Downloads current inventory (including all additions) as `.csv`.

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. In production, also serves the built React app as static files.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App: `src/app.ts` — CORS, body parsing, `/api` routes, static file serving (production)
- Routes: `src/routes/inventory.ts` — full CRUD for inventory parts, announcements, reports
- Scripts:
  - `build` — esbuild bundle to `dist/`
  - `build:frontend` — Vite build of inventory-manager
  - `build:production` — build API then frontend (order matters — API build cleans dist/)
  - `start` — run production bundle

### `artifacts/inventory-manager` (`@workspace/inventory-manager`)

React + Vite SPA. Single component `InventoryManager.tsx` handles all UI.

- Build output: `artifacts/api-server/dist/public/` (served by Express in production)
- Dev proxy: `/api` → `http://localhost:8080`
- Replit plugins (cartographer, dev-banner, runtime-error-modal) only load in dev + Replit env

### `lib/db` (`@workspace/db`)

Drizzle ORM + PostgreSQL. Tables: `inventoryState` (singleton), `inventoryReports`.

- Push schema: `pnpm --filter @workspace/db run push`
- Config: `drizzle.config.ts` (requires `DATABASE_URL`)

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec + Orval codegen. Run: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from OpenAPI spec.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks from OpenAPI spec.

### `scripts` (`@workspace/scripts`)

Utility scripts. Run: `pnpm --filter @workspace/scripts run <script>`
