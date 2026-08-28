# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

FRCTools Orders (`orderr`) — an order-list app for FRC robotics teams. Nuxt 4 app deployed to **Cloudflare Workers** (Nitro `cloudflare-module` preset), backed by Postgres via Drizzle, with Better Auth for auth/organizations and Meilisearch for product search.

## Commands

```bash
# Dependencies (see Windows/native note below)
bun install

# Local Postgres (docker-compose, image pinned to postgres:17, host port 5433)
docker compose up -d

# Dev server -> http://localhost:3000
bun run dev

# Lint + typecheck (CI runs both on every push, see .github/workflows/ci.yml)
bun run lint
bun run typecheck

# Production build (Cloudflare)
bun run build
```

Database migrations (Drizzle Kit reads `DATABASE_URL`):

```bash
bun drizzle-kit generate   # create migration from schema changes
bun drizzle-kit migrate    # apply pending migrations in drizzle/
```

There is no test runner configured; "verification" means lint + typecheck + exercising the dev server.

## Environment

Dev config lives in `.env` (gitignored). Most server code reads `process.env.*` directly (not just Nuxt `runtimeConfig`):

- `DATABASE_URL` — local Postgres, e.g. `postgres://postgres:orderr@localhost:5433/postgres`
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (`http://localhost:3000` in dev)
- `RESEND_KEY` — transactional email; optional in dev (only used when sending invites/notifications)
- `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MEILISEARCH_INDEX` — product search; optional
- `NUXT_PUBLIC_SENTRY_DSN` — optional

## Architecture

**Environment-dual database connection** — `server/utils/db.ts` is the single DB entry point (`useDB()`). In production it uses the Cloudflare **Hyperdrive** binding (`process.env.HYPERDRIVE.connectionString`); locally it falls back to `process.env.DATABASE_URL`. Same drizzle `node-postgres` driver either way. Always go through `useDB()`.

**Multi-tenancy via Better Auth organizations** — `server/utils/auth.ts` configures Better Auth with the `organization` plugin. Every app resource is scoped to an organization. The gate for authenticated API routes is `requireOrganizationContext(event)` in `server/utils/session.ts`: it returns `{ user, session, organizationId, membership }`, throwing **401** if unauthenticated and **400** if no active org is selected (`session.activeOrganizationId`). New API handlers that touch org data should call it first and filter queries by `organizationId`.

**Schema is split in two** — `server/utils/auth-schema.ts` holds Better Auth tables (user, session, account, organization, member, invitation); `server/utils/schema.ts` holds app tables (vendors, tags, orders, orderTags, productCache, notification*). Both are registered in `drizzle.config.ts` and merged into the drizzle client. (Note: a second `auth-schema.ts` exists at the repo root from the Better Auth CLI — the one the DB actually imports is `server/utils/auth-schema.ts`.)

**API routes** — Nitro file-based routing under `server/api/` with method suffixes (`index.get.ts`, `[id].patch.ts`, etc.). Non-trivial write logic lives in service modules under `server/utils/` (e.g. `order-service.ts` owns `createOrder`/`createOrdersBulk` and the Zod `createOrderSchema`), keeping route handlers thin.

**Vendors & product search** — two distinct systems:
- `server/api/vendors/search.get.ts` queries **Meilisearch** with hybrid (keyword + semantic) search over the product catalog.
- `server/api/vendors/index.get.ts` proxies to an external scraper service — in production through the Cloudflare **VPC_SERVICE** Fetcher binding, in dev to `http://localhost:3001`. Vendors carry a `type` (`shopify`/`bigcommerce`/`amazon`) and `config`; fetched products are cached in the `productCache` table.

**Client data layer** — `app/` is the Nuxt srcDir. Client fetching uses **TanStack Vue Query** (`app/plugins/vue-query.ts`); composables in `app/composables/` wrap endpoints with stable query keys (e.g. `useOrdersQuery` / `ORDERS_QUERY_KEY`). Auth state is exposed via `app/composables/auth.ts` plus `app/plugins/auth.{client,server}.ts`.

**Routing & rendering** — landing `/` is prerendered (`routeRules`). The authenticated dashboard is `/app`, gated by `app/middleware/app.global.ts` (redirects unauthenticated users to `/auth/login`, and enforces admin/owner role for `/organization`). Marketing/docs use Nuxt Content: markdown in `content/`, config in `content.config.ts`, served at `/docs`. Layouts: `default` (marketing), `app`, `auth`, `docs`.

**Email/notifications** — Resend + Vue Email templates (`server/utils/*.vue`, rendered with `@vue-email/render`). Per-user, per-org preferences and an audit log live in `notificationPreferences` / `notificationLog`; helpers in `notification-helpers.ts` and `email-service.ts`.

**Cloudflare bindings** (declared in `nuxt.config.ts` under `nitro.cloudflare.wrangler`): `HYPERDRIVE` (Postgres), `KV`, `DB` (D1 — `@nuxt/content` switches to this in production), `VPC_SERVICE` (scraper), plus version metadata. The Nitro config externalizes `pg-native`/`canvas` and replaces `typeof window` with `undefined` for the Workers build.

## Gotchas

- **`better-sqlite3` is an unused dependency** whose native build fails on Windows without Visual Studio C++ build tools. Nothing in the codebase imports it. If `bun install` fails on its build step, run `bun install --ignore-scripts` then `bun run postinstall` (`nuxt prepare`).
- **`docker-compose.yml` pins `postgres:17`.** The unpinned `postgres` tag now resolves to PG18, which refuses to start with the volume mounted at the legacy `/var/lib/postgresql/data` path.
- The Cloudflare-specific bindings (Hyperdrive, VPC_SERVICE, D1) are only present at runtime on Workers; dev relies on the `DATABASE_URL` fallback and the localhost scraper, so some production code paths (`import.meta.dev` branches) differ locally.
