# StatioPro ERP — Frontend

Production frontend for the **KJ Stationery Management System**. A clean, modern,
desktop-first SaaS console for a stationery & printing business: POS, inventory,
purchases, expenses, cash sessions, reporting, user management and audit logs.

Built to integrate directly with the NestJS API in the repository root
(`/api/v1`) and styled with the **Stitch design system** (Material-You token
palette, Inter + JetBrains Mono, Material Symbols).

## Tech stack

- **React 18 + TypeScript** (Vite)
- **Tailwind CSS** — Stitch design tokens as CSS variables with full light/dark mode
- **TanStack React Query** — server state, caching, mutations
- **React Router** — protected + role-gated routes
- **Axios** — API client with automatic JWT refresh-token rotation
- **Recharts** — sales/expense/profit visualizations

## Getting started

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The dev server proxies `/api` and `/uploads` to the backend on
`http://localhost:3000`, so run the NestJS API alongside it:

```bash
# from the repo root
npm run start:dev
npm run prisma:seed   # creates the default admin
```

**Default admin login** (from the backend seed):

- Email: `admin@kjstationery.co.tz`
- Password: `ChangeMe!Admin123`

### Configuration

`.env` (already provided):

```
VITE_API_BASE_URL=/api/v1     # use an absolute URL for a remote API
VITE_CURRENCY=TZS
```

## Scripts

| Script              | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the dev server                 |
| `npm run build`     | Type-check + production build        |
| `npm run preview`   | Preview the production build         |
| `npm run typecheck` | Type-check only                      |

## Screens

Login · Dashboard · POS · Products · Services · Inventory · Purchases ·
Expenses · Cash Management · Reports · Users · Activity Logs · Settings.

### Role behaviour

- **Staff**: POS, products/services (read), inventory, expenses, cash sessions, settings.
- **Admin**: everything plus Purchases, Reports, Users, Activity Logs, stock
  adjustments, catalog/category/supplier management and product CRUD.

Routes are guarded client-side (`ProtectedRoute` / `AdminRoute`) and enforced
server-side by the API.

## Architecture

```
src/
  lib/          api client (axios + refresh), tokenStore, utils, query client, constants
  providers/    Auth, Theme (light/dark), Toast, CashSession context
  hooks/        one React Query module per API domain
  components/
    ui/         design-system primitives (Button, Card, Table, Modal, …)
    layout/     Sidebar, Topbar, AppLayout
    charts/     Recharts wrappers
  features/     composite feature modules (e.g. product form)
  pages/        one component per screen
```

### Notable integrations

- **Cash-session aware POS** — the API requires an open cash session to record a
  sale; the topbar shows live session status and the POS guides you to open one.
- **Idempotent sales** — each sale sends an `Idempotency-Key` to prevent duplicates.
- **FIFO purchases & inventory** — purchases create batches; movements and
  valuation are surfaced in the Inventory screen.
- **CSV export** for every report category.

## Production build

`npm run build` outputs static assets to `dist/`, code-split into
`react-vendor`, `charts`, `query` and app chunks. Serve `dist/` from any static
host and point `VITE_API_BASE_URL` at your API origin.
