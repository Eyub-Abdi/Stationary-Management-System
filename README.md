# KJ Stationery Management System — Backend

Production-grade backend for a real stationery & printing business: inventory,
sales, services, purchasing, cash operations, expenses, reporting and auditing.

**Stack:** NestJS · TypeScript · PostgreSQL · Prisma · JWT + RBAC · Redis ·
Swagger/OpenAPI · Docker · class-validator / class-transformer · decimal.js · argon2.

> Cash-only business. The system records **completed cash transactions** — no
> online/mobile/card payments, gateways or subscriptions exist anywhere.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Folder structure](#1-folder-structure)
3. [Module architecture](#2-module-architecture)
4. [Database / ERD](#3--4-database--erd)
5. [Entity relationships](#5-entity-relationships)
6. [DTO architecture](#6-dto-architecture)
7. [Controllers & Services](#7--8-controllers--services)
8. [Repository strategy](#9-repository-strategy)
9. [Authentication](#10-authentication-architecture)
10. [Authorization](#11-authorization-architecture)
11. [Validation](#12-validation-architecture)
12. [Error handling](#13-error-handling-architecture)
13. [Transaction management](#14-transaction-management-strategy)
14. [Audit logging](#15-audit-logging-strategy)
15. [Inventory FIFO](#16-inventory-fifo-architecture)
16. [Cash sessions](#17-cash-session-architecture)
17. [Reporting](#18-reporting-architecture)
18. [API standards](#19-api-design-standards)
19. [Security](#20-security-best-practices)
20. [Performance](#21-performance-optimization-strategy)
21. [Scalability](#22-scalability-considerations)

---

## Quick start

```bash
cp .env.example .env          # then set strong JWT secrets (>= 32 chars)

# Option A — full stack in Docker (Postgres + Redis + API + migrations)
docker compose up --build

# Option B — local dev
docker compose up -d postgres redis
npm install
npm run prisma:generate
npm run prisma:migrate         # creates the schema
npm run prisma:seed            # bootstrap admin + catalog
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`
- Health: `GET /api/v1/health`

Default admin (from `.env`): `admin@kjstationery.co.tz` / `ChangeMe!Admin123`
— **change immediately**.

---

## 1. Folder structure

Feature-first modular monolith. Each domain is a self-contained module
(`controller` → `service` → Prisma), with cross-cutting concerns in `common/`.

```
prisma/
  schema.prisma              # single source of truth for the data model
  seed.ts                    # bootstrap admin, categories, products, services
src/
  main.ts                    # bootstrap: helmet, CORS, versioning, swagger
  app.module.ts              # global providers (guards, pipe, filter, interceptor)
  config/
    configuration.ts         # typed config loader
    env.validation.ts        # fail-fast env validation
  common/
    constants.ts
    decorators/              # @Roles @Public @CurrentUser @Audit
    dto/                     # PaginationQueryDto, DateRangeDto
    filters/                 # AllExceptionsFilter (incl. Prisma mapping)
    guards/                  # RolesGuard
    interceptors/            # TransformInterceptor (envelope + Decimal->string)
    utils/                   # money.ts (Decimal helpers)
  prisma/
    prisma.module.ts
    prisma.service.ts        # client + runSerializable() retrying tx helper
  modules/
    shared/                  # SequenceService (gapless doc numbers)
    audit/                   # AuditService (append-only) + read API
    auth/                    # login/refresh/logout, JWT strategy, guards
    users/                   # staff/admin CRUD, activation, password reset
    categories/  products/  services/  suppliers/      # catalog
    purchases/               # stock IN + FIFO batch creation
    inventory/               # FIFO engine, movements ledger, adjustments
    sales/                   # snapshots + FIFO COGS + idempotency + void
    expenses/                # expenses (linked to cash session)
    cash/                    # cash sessions: open / movements / close / variance
    reports/                 # sales/financial/inventory/cash/user reports
    health/                  # liveness/readiness
```

---

## 2. Module architecture

| Module | Responsibility | Key guarantees |
|---|---|---|
| **auth** | Login, refresh-token rotation, logout | Argon2id, reuse detection |
| **users** | Staff/admin management | Never exposes `passwordHash` |
| **categories/products/services/suppliers** | Catalog CRUD | Price changes never touch history |
| **purchases** | Record purchases | Creates FIFO batches + stock-in in one tx |
| **inventory** | FIFO engine + ledger + adjustments | Stock can't drift from batches |
| **sales** | Cash sales (products + services) | Snapshots, FIFO COGS, idempotent, immutable |
| **expenses** | Operating expenses | Linked to open cash session |
| **cash** | Daily till sessions | Expected/actual/variance under row lock |
| **reports** | Analytics | Profit from historical COGS, not current cost |
| **audit** | Immutable activity log | Append-only |
| **shared** | Gapless document numbering | Concurrency-safe |

`PrismaModule`, `SharedModule` and `AuditModule` are `@Global` so any module can
inject `PrismaService`, `SequenceService` and `AuditService`.

---

## 3 & 4. Database / ERD

PostgreSQL via Prisma. All money is `Decimal(14,2)` (never floats). UUID PKs.

```
User ─┬─< RefreshToken
      ├─< Sale ─┬─< SaleItem ─< CogsAllocation >── InventoryBatch
      ├─< Purchase ─< PurchaseItem ─1─ InventoryBatch
      ├─< Expense
      ├─< CashSession ─< CashMovement
      ├─< InventoryMovement
      ├─< InventoryAdjustment
      └─< AuditLog

Category ─< Product ─┬─< SaleItem
                     ├─< PurchaseItem
                     ├─< InventoryBatch
                     ├─< InventoryMovement
                     └─< InventoryAdjustment
Service  ─< SaleItem
Supplier ─< Purchase
CashSession ─< Sale, Expense, CashMovement
DocumentSequence  (counters: INVOICE / TRANSACTION / PURCHASE per month)
```

Core tables: `users`, `refresh_tokens`, `categories`, `products`, `services`,
`suppliers`, `purchases`, `purchase_items`, `inventory_batches`, `sales`,
`sale_items`, `cogs_allocations`, `inventory_movements`, `inventory_adjustments`,
`expenses`, `cash_sessions`, `cash_movements`, `document_sequences`, `audit_logs`.

Indices are defined for every foreign key and common query path (status, dates,
`(productId, purchaseDate, createdAt)` for the FIFO scan, etc.).

---

## 5. Entity relationships

- **Sale → SaleItem**: a sale holds 1..n lines of `PRODUCT` or `SERVICE`.
- **SaleItem → CogsAllocation → InventoryBatch**: each sold product line records
  exactly which batches it drew from and at what historical cost.
- **PurchaseItem → InventoryBatch (1:1)**: each purchase line opens one FIFO batch.
- **CashSession → Sale / Expense / CashMovement**: everything that affects the
  till during a shift is attributed to the open session.
- Catalog entities (`Product`, `Service`) are **soft-deactivated**, never deleted —
  historical documents reference them. Transactional records are immutable.

---

## 6. DTO architecture

- **Input DTOs** per use case (`CreateSaleDto`, `CreatePurchaseDto`, …) decorated
  with `class-validator` + `@nestjs/swagger`. Nested DTOs validated with
  `@ValidateNested({ each: true })` + `@Type()`.
- **Reuse**: `PaginationQueryDto` / `DateRangeDto` extended by feature queries;
  `PartialType`/`OmitType` derive update DTOs and protect immutable fields
  (e.g. product `sku`, user `password`).
- **Output shaping**: services select explicit, safe projections (`SafeUser`
  omits `passwordHash`); the global interceptor serializes `Decimal`→string and
  `Date`→ISO so the API never leaks float rounding.

---

## 7 & 8. Controllers & Services

- **Controllers** are thin: routing, RBAC decorators, Swagger metadata, param
  validation (`ParseUUIDPipe`), and delegation. No business logic.
- **Services** own all business rules and database access. Financial/inventory
  services compose the FIFO engine + sequence + audit inside a single transaction.

---

## 9. Repository strategy

Prisma **is** the repository/data-mapper layer (typed, generated, composable).
Rather than wrapping every model in a hand-written repository (ceremony with no
payoff here), the strategy is:

- Domain services depend on `PrismaService` and shape their own queries.
- Reusable, transaction-aware **domain operations** that must be shared are
  centralized as injectable engines: `InventoryService` (FIFO consume/add/restore +
  movement ledger) and `SequenceService` (document numbers). These accept a
  `Prisma.TransactionClient` so callers compose them atomically.
- This keeps a clean seam: if a true repository abstraction is ever needed
  (e.g. to swap data sources), only the engines + services change, not controllers.

---

## 10. Authentication architecture

- **Argon2id** password hashing (memory-hard) via `argon2`.
- **Access token** (JWT, short-lived, default 15 min) — stateless, carries
  `sub`, `email`, `role`. Validated by `JwtStrategy`, which **re-checks the user
  is active on every request** so deactivation is effective immediately.
- **Refresh token** (JWT, default 7 days) — only its **SHA-256 hash** is stored
  (`refresh_tokens`). On `/auth/refresh` the token is **rotated**: the old row is
  revoked and chained to the new one. Presenting an already-rotated token is
  treated as **theft → the whole token family is revoked** (reuse detection).
- **Logout** revokes the presented refresh token; password reset revokes all
  sessions for the user.
- Login & refresh endpoints are additionally rate-limited (`@Throttle`).

---

## 11. Authorization architecture

- Two roles: `ADMIN`, `STAFF`.
- `JwtAuthGuard` (global) authenticates every route except those marked `@Public()`.
- `RolesGuard` (global) enforces `@Roles(...)` at controller or handler level.
- **STAFF** can: create sales, record services, view inventory, record expenses,
  open/close cash sessions. **ADMIN** additionally: users, products, services,
  suppliers, purchases, adjustments, sale voids, reports, cash/variance review,
  audit logs.

---

## 12. Validation architecture

- A single **global `ValidationPipe`** with `whitelist`, `forbidNonWhitelisted`
  and `transform` strips unknown fields, rejects extras, and coerces types from
  declared DTOs only.
- Money fields use `@IsNumber({ maxDecimalPlaces: 2 })`; dates use `@Type(() =>
  Date) @IsDate()`.
- **Business invariants** (discount ≤ line total, cash ≥ total, sufficient stock,
  one open session per user, per-page services require `pages`) are enforced in
  services, inside the transaction — validation that depends on DB state can't be
  done by DTOs alone.
- **Environment** is validated at boot (`env.validation.ts`); the process refuses
  to start with missing/weak secrets.

---

## 13. Error handling architecture

`AllExceptionsFilter` produces one consistent envelope and maps Prisma errors:

| Cause | HTTP | Notes |
|---|---|---|
| `HttpException` | as thrown | validation, not-found, forbidden, conflict |
| Prisma `P2002` | 409 | unique violation (reports offending field) |
| Prisma `P2025` | 404 | record not found |
| Prisma `P2003` | 400 | FK violation |
| `P2034` / serialization | 409 | write conflict, retry |
| anything else | 500 | generic message; full stack logged server-side only |

```json
{ "statusCode": 409, "error": "Conflict", "message": "...",
  "code": "P2002", "path": "/api/v1/products", "method": "POST",
  "timestamp": "2026-06-21T...", "requestId": "..." }
```

No SQL or stack traces are ever returned to clients.

---

## 14. Transaction management strategy

Every financial/inventory operation runs through
`PrismaService.runSerializable()`:

- **Serializable** isolation — the strongest level; prevents lost updates &
  phantom reads on stock and cash balances.
- **Automatic bounded retries** with jittered backoff on serialization failures
  (`40001`), deadlocks (`40P01`) and Prisma write conflicts (`P2034`).
- **Explicit row locks** (`SELECT ... FOR UPDATE`) on the product row before a
  stock change and on candidate FIFO batches before consumption — reduces
  contention and makes ordering deterministic.
- A sale therefore commits **atomically**: snapshots + FIFO consumption + stock
  movements + COGS allocations + invoice/transaction numbers + audit row, or
  nothing at all. **Inventory can never drift from batches.**

**Duplicate prevention:** sales accept an `Idempotency-Key` header; the key is a
unique column, checked both before and inside the transaction, so a retried POST
returns the original sale instead of creating a second one. Document numbers come
from an atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` counter, so no two
sales can ever share an invoice/transaction number.

---

## 15. Audit logging strategy

- `audit_logs` is **append-only**. `AuditService.recordTx()` writes the audit row
  **inside the same transaction** as the business mutation for financial actions
  (sales, purchases, adjustments, cash close), so audit and effect commit together.
- Lighter CRUD actions use `AuditService.record()`.
- Captured actions include: login/logout, refresh-reuse detection, user lifecycle,
  product/service create/update/deactivate, purchase, sale create/void, expense,
  inventory adjustment, cash session open/close, deposits/withdrawals.
- Each row stores actor, action, entity type/id, structured `metadata`
  (before/after where relevant), IP and user agent.
- **Immutability** should be enforced at the DB level in production by revoking
  `UPDATE`/`DELETE` on `audit_logs` from the application role (see Security).

---

## 16. Inventory FIFO architecture

Cost of Goods Sold uses **First-In-First-Out**, never current cost.

- Each purchase line creates an `InventoryBatch` with `quantity`,
  `remainingQuantity`, `unitCost`, `purchaseDate`.
- On sale, `InventoryService.consumeFifoTx()` locks candidate batches
  `ORDER BY purchaseDate ASC, createdAt ASC FOR UPDATE` and draws down
  `remainingQuantity`, producing `CogsAllocation` rows (batch, qty, unitCost, cost).
- The sale's `totalCogs` and each line's `lineCogs` are the **sum of allocations**.

Worked example (matches the brief):

```
Purchase #1: 100 Pens @ 500     Purchase #2: 100 Pens @ 700
Sell 50 Pens  ->  COGS = 50 × 500 = 25,000  (drawn from Purchase #1 first)
Sell 70 more  ->  COGS = 50 × 500 + 20 × 700 = 39,000
```

- **Adjustments**: positive adjustments add a costed batch; negative adjustments
  consume FIFO — so valuation stays correct either way.
- **Voids** call `restoreFifoTx()` to put the exact consumed quantities back into
  their original batches and write a `RETURN` movement.
- **Partial returns** (`POST /sales/:id/returns`) return specific quantities of
  specific lines: units are restocked into the exact FIFO batches they came from,
  the matching COGS is reversed (`CogsAllocation.returnedQuantity`), the net
  refund is paid from the till, and an immutable `SaleReturn` is recorded. The
  sale stays `COMPLETED`; a line may be returned across multiple returns up to its
  sold quantity (over-return rejected). Returns appear in the cash breakdown as
  `refunds` and net out of the financial report (revenue and COGS both reduced).
- `currentStock` is a denormalized cache kept in lockstep with batches inside the
  transaction; the `inventory_movements` ledger records before/after for every
  change (full audit trail).
- **DB-level immutability:** migration `immutable_ledgers` installs a trigger that
  blocks `UPDATE`/`DELETE` on `audit_logs` and `inventory_movements` — the ledgers
  are append-only even against direct SQL.

---

## 17. Cash session architecture

Daily till lifecycle, one open session per user:

```
Expected = Opening + Cash Sales + Deposits − Expenses − Withdrawals
Variance = Actual (counted) − Expected
```

- **Open**: staff enters opening float; only one `OPEN` session allowed.
- **During**: sales and expenses created by that user attach to the session;
  deposits/withdrawals recorded as `CashMovement`s.
- **Close**: under a `SELECT ... FOR UPDATE` row lock (so no sale slips in
  mid-calculation), the system computes expected cash, stores
  `expectedAmount / actualAmount / variance / notes`, and audits the close with
  the full breakdown.
- **Admin** reviews all sessions and a dedicated **variances** report.
- Sales require an open session — enforcing that all cash is accounted for.

---

## 18. Reporting architecture

Admin-only. Heavy aggregations use raw SQL (`date_trunc`, grouped sums) with
parameterized ranges; simpler ones use Prisma `aggregate`/`groupBy`.

- **Sales**: time series (daily/weekly/monthly/custom) — revenue, COGS, gross
  profit, count.
- **Financial**: revenue, COGS, **gross profit**, expenses, **net profit** for a
  range (`netProfit = revenue − COGS − expenses`). Profit always derives from
  historical FIFO COGS.
- **Inventory**: stock levels + valuation, low stock, movement ledger.
- **Cash**: open/closed sessions, variances.
- **User activity**: per-staff sales count & revenue.

Only `COMPLETED` sales count; `VOIDED` sales are excluded everywhere.

---

## 19. API design standards

- Versioned, prefixed routes: `/api/v1/...` (URI versioning).
- Consistent success envelope: `{ success, data, timestamp }`; lists add `meta`
  (`total, page, limit, totalPages, hasNextPage, hasPreviousPage`).
- Plural resource nouns, proper verbs/status codes, UUID path params validated.
- Full OpenAPI/Swagger with bearer auth and persisted authorization.
- Idempotency via `Idempotency-Key` header on sale creation.

---

## 20. Security best practices

- Argon2id hashing; JWT access/refresh split with rotation + reuse detection.
- Helmet security headers; configurable CORS allow-list.
- Global input validation with `forbidNonWhitelisted` (mass-assignment safe);
  immutable fields stripped from update DTOs.
- Rate limiting globally and tighter on auth endpoints.
- Least-privilege responses (no `passwordHash`, no SQL/stack leakage).
- **DB hardening (deploy):** run the app under a role that has **no `UPDATE`/
  `DELETE` on `audit_logs`** and ideally none on `sales`/`sale_items`/
  `inventory_movements`/`cogs_allocations` (append-only ledgers) beyond what the
  app needs — make tamper-resistance structural. Secrets via env/secret manager,
  never committed. Non-root Docker runtime user.

---

## 21. Performance optimization strategy

- Targeted indexes on every FK and hot path (FIFO scan composite index, sale
  dates/status, audit lookups).
- Decimal math in app; `Decimal(14,2)` storage — exact and index-friendly.
- Redis caching layer available (`@nestjs/cache-manager` + ioredis) for read-hot,
  rarely-changing data (catalog, reports) — cache-aside with short TTLs.
- Pagination capped (`limit ≤ 100`); count + page fetched in one `$transaction`.
- Connection pooling via Prisma (`connection_limit` on `DATABASE_URL`);
  PgBouncer-compatible.
- Aggregations pushed into SQL rather than loaded into the app.

---

## 22. Scalability considerations

- **Stateless API** (JWT, no server sessions) → scales horizontally behind a load
  balancer; refresh-token state and cache live in Postgres/Redis.
- Serializable + retry strategy keeps correctness under concurrency; row locks
  bound contention to per-product / per-session granularity.
- Append-only ledgers (`inventory_movements`, `audit_logs`, `cogs_allocations`)
  are partition-ready by month/range for multi-year, tens-of-thousands-of-tx
  growth; document-number counters are scoped per month.
- Reads can move to a Postgres read replica; reporting can be offloaded to
  materialized views without touching the write model.
- Clean module seams allow extracting a heavy domain (e.g. reporting) into its own
  service later with minimal change.

---

## Testing & operations

- `npm run test` — unit suites (mocked Prisma): FIFO engine, money utils, sale
  cash/credit settlement, dual-unit consumption, credit-applied returns, AR
  allocation & credit limit, purchase conversion, cash reconciliation.
- `npm run test:int` — **integration** suite against a real Postgres, gated on
  `TEST_DATABASE_URL` (a throwaway DB it migrates & truncates). Exercises the
  actual SQL/schema for the whole money flow (purchase → cash sale → credit sale
  → repayment → till reconciliation). Skipped when the env var is unset.
- `npm run prisma:studio` to inspect data; `npm run db:reset` for a clean dev DB.
- Health endpoint pings the database for readiness probes.
- Docker entrypoint runs `prisma migrate deploy` before boot (idempotent).

### Backups & restore

- `DATABASE_URL=… npm run db:backup` — compressed `pg_dump -Fc` to `$BACKUP_DIR`
  (default `./backups`), integrity-checked, pruning dumps older than
  `$RETENTION_DAYS` (default 14). Schedule daily via cron (see `scripts/backup.sh`).
- `DATABASE_URL=… npm run db:restore <dump>` — restore into the target DB.
  Always restore into a fresh/staging DB and verify before touching production.

### Error tracking & logs

- All 5xx responses are logged with a stack, `requestId`, and `userId` by the
  global exception filter.
- Optional Sentry: `npm install @sentry/node` and set `SENTRY_DSN` — 5xx errors
  are then shipped to Sentry automatically (no-op when unset). See
  `src/common/observability/error-reporter.ts`.
- Logs go to stdout; retention/rotation is delegated to the container/platform
  log driver (e.g. Docker `json-file` with `max-size`/`max-file`, or shipped to
  CloudWatch/Loki/Datadog).
```
