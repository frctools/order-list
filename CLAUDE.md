# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Innovators Parts (`innovators-parts`) — a parts ordering app for FRC robotics teams, branded *Innovators Parts — Powered by FRCTools*. It's a fork of [FRCTools Orders](https://github.com/frctools/order-list) by Graham Howard (MIT; original copyright retained in `LICENSE`), diverged far enough that changes aren't sent upstream. Nuxt 4 app deployed to **Cloudflare Workers** (Nitro `cloudflare-module` preset), backed by Postgres via Drizzle, with Better Auth for auth/organizations and Meilisearch for product search.

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
bun run db:generate   # create a migration from schema changes
bun run db:migrate    # apply pending migrations in drizzle/
```

**Migrations do not run themselves.** Nothing in the build or the Workers deploy applies them, so a schema change ships in two steps: apply the migration against production Postgres, *then* deploy the Worker. Getting that order wrong takes the site down for as long as it takes to fix — the new code queries columns the old database doesn't have. Only additive migrations are safe to run in either order; a rename or drop (like `unit_price_cents` → `unit_price_micros` in `0016`) is not.

Two caveats when writing one:

- **Hand-written migrations still need a snapshot.** `0013`–`0015` were written by hand without regenerating `drizzle/meta`, which left the snapshots four migrations behind the schema — `db:generate` then diffed from the wrong baseline and started prompting about unrelated tables. `0016_snapshot.json` re-baselines it. If you hand-write SQL again, regenerate the snapshot too, and check `db:generate` reports *"No schema changes"* on an unmodified schema before committing.
- **Drizzle Kit generates destructively for renames.** It emits DROP + ADD, which discards the column's data. Migration `0016` is the pattern to copy: add the new column, `UPDATE` across from the old one, then drop.

There is no test runner configured; "verification" means lint + typecheck + exercising the dev server.

## Environment

Dev config lives in `.env` (gitignored). Most server code reads `process.env.*` directly (not just Nuxt `runtimeConfig`):

- `DATABASE_URL` — local Postgres, e.g. `postgres://postgres:orderr@localhost:5433/postgres`
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (`http://localhost:3000` in dev)
- `RESEND_KEY` — transactional email; optional in dev (only used when sending invites/notifications)
- `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MEILISEARCH_INDEX` — product search; optional
- `DIGIKEY_CLIENT_ID`, `DIGIKEY_CLIENT_SECRET`, `DIGIKEY_API_BASE` — DigiKey Product Information API v4 (developer.digikey.com); optional. Sandbox and production are separate apps with separate credentials, so `DIGIKEY_API_BASE` has to match the pair in use — `https://sandbox-api.digikey.com` or `https://api.digikey.com`. Unset means DigiKey parts fall back to the URL-derived name and SKU.
- `NUXT_PUBLIC_SENTRY_DSN` — optional

## Architecture

**Environment-dual database connection** — `server/utils/db.ts` is the single DB entry point (`useDB()`). In production it uses the Cloudflare **Hyperdrive** binding (`process.env.HYPERDRIVE.connectionString`); locally it falls back to `process.env.DATABASE_URL`. Same drizzle `node-postgres` driver either way. Always go through `useDB()`.

**Multi-tenancy via Better Auth organizations** — `server/utils/auth.ts` configures Better Auth with the `organization` plugin. Every app resource is scoped to an organization. The gate for authenticated API routes is `requireOrganizationContext(event)` in `server/utils/session.ts`: it returns `{ user, session, organizationId, membership }`, throwing **401** if unauthenticated and **400** if no active org is selected (`session.activeOrganizationId`). It resolves `membership` through a `getFullOrganization` call, so it costs an extra auth round-trip per request. New API handlers that touch org data should call it first and filter queries by `organizationId`.

**Schema is split in two** — `server/utils/auth-schema.ts` holds Better Auth tables (user, session, account, organization, member, invitation); `server/utils/schema.ts` holds app tables (vendors, tags, orders, orderItems, orderTags, orderPayments, productCache, notification\*). Both are registered in `drizzle.config.ts` and merged into the drizzle client. (Note: a second `auth-schema.ts` exists at the repo root from the Better Auth CLI — the one the DB actually imports is `server/utils/auth-schema.ts`.)

### Order data model

Orders are **two-level**: an order is a per-vendor *purchase order header*, and the parts are line items under it.

- `orders` — vendor (`vendorId` for a known vendor row, else free-text `vendorName`), `status` (`to_order` → `ordered` → `arrived`), `orderedAt`/`arrivedAt`, and post-order fulfilment fields (`trackingCarrier`, `trackingNumber`, `shippingCents`, `taxCents`). The order advances as a unit — status lives here, not on parts.
- `orderItems` — one part per row (`partName`, `quantity`, `unitPriceMicros`, variant fields, `externalUrl`).
- `orderTags` — tags attach to **line items** (`orderItemId`), not to orders.
- `orderPayments` — split payment lines (`credit_card` / `voucher` / `coupon` / `other`), so one order can be part credit card, part Kit-of-Parts voucher, part coupon.

**Money units** — item unit prices are stored as **micro-dollars** (1e-6 USD) in `orderItems.unitPriceMicros`, because distributors quote sub-cent prices at quantity breaks (DigiKey goes to five decimals) and whole cents rounded them away. Everything else — shipping, tax, payments, and all order totals — stays in whole cents, which is what actually gets paid. `app/utils/money.ts` owns the conversions and the display rule: a unit price renders as plain money when it lands on whole cents (`$2.40`) and only spells out the extra digits when it genuinely carries them (`$0.231`). Line totals sum in micros and round to cents once, never per line.

Totals are derived in JS rather than stored: `totalCents` (items), `paidCents` (payments), `grandTotalCents` (items + shipping + tax).

**Grouping rule** — parts are added with a vendor, and `findOrCreatePendingOrder` drops each part into the org's open (`to_order`) order for that vendor, creating one if none exists. `vendorKey()` mirrors that grouping so moves can be validated: parts only combine within the same vendor, and only between `to_order` orders. Any source order left empty (by a split, a move, or an item delete) is deleted.

**Order write logic lives in `server/utils/order-service.ts`**, keeping route handlers thin: `addLineItem` / `addLineItemsBulk` / `addItemToOrder` (create), `updateLineItem` / `deleteLineItem`, `splitItemsToNewOrder` (move parts into a fresh order — "ship separately"), `moveItemsToOrder` (join parts into an existing open order), `updateOrderDetails` (tracking/shipping/tax plus replacing the payment set), and the Zod `createOrderSchema`. All reads go through the private `fetchOrders()`, which runs four queries (orders, payments, items, item tags) and assembles the full `OrderRecord`.

**API routes** — Nitro file-based routing under `server/api/` with method suffixes (`index.get.ts`, `[id].patch.ts`, etc.). Orders live at `/api/orders` (list/create), `/api/orders/[id]` (patch status/vendor, delete), `/api/orders/[id]/details`, `/api/orders/[id]/items[/itemId]`, plus `bulk`, `move`, `split`, and `payment-methods`.

**Vendors & product search** — three distinct systems:
- `server/api/vendors/search.get.ts` queries **Meilisearch** with hybrid (keyword + semantic) search over the product catalog.
- `server/api/vendors/index.get.ts` proxies to the external `vendord` scraper service — in production through the Cloudflare **VPC_SERVICE** Fetcher binding, in dev to `http://localhost:3001`. Vendors carry a `type` (`shopify`/`bigcommerce`/`amazon`) and `config`; fetched products are cached in the `productCache` table.
- `server/api/vendors/extract.get.ts` + `server/utils/part-extractor.ts` is a **self-contained in-Worker extractor** that needs no scraper service or DB: given a product URL it tries Shopify's `/products/{handle}.json`, then JSON-LD, then an Amazon-specific DOM read (their meta tags describe the storefront — `<meta name="title">` is `"Amazon.com: {name} : {category}"` and there's no price tag at all), then OpenGraph/meta. It is auth-gated and refuses loopback/private/link-local hosts so it can't be used as an SSRF proxy.

Three escape hatches exist for vendors the extractor can't read directly:

- **A vendor API** — `server/utils/digikey.ts` calls DigiKey's Product Information API v4, which `extract.get.ts` tries first for DigiKey links (`source: 'digikey'`). It beats the page even where the page were readable: description, stock, packaging variations, and quantity price breaks. Tokens live ~10 minutes and are cached per isolate. With no credentials set it returns `null` without making a request, and the URL fallback below takes over.

- **Delegation to vendord** — Online Metals answers a Worker's fetch with a bot-challenge interstitial, so `extract.get.ts` sends those hosts to vendord *first* via `server/utils/vendord.ts` (`DELEGATED_HOSTS`), mapping the scraper's reply back into the extractor's own result shape (`source: 'scraper'`). If vendord is down or blocked in turn, the extractor's own fallbacks still run.
- **URL-only vendors** (`URL_ONLY_VENDORS` in `part-extractor.ts`) — hosts whose pages a server can't usefully read at all. These are matched *before* any network call and parsed straight from the URL (`source: 'url'`), yielding a name and SKU but no price. Online Metals decodes `/buy/{category}/{slug}/pid/{pid}` plus the `?variant=` cut length; McMaster-Carr decodes the part number out of `/91290A115/`. **McMaster is never requested** — their pages render client-side, are marked `noindex, noarchive`, and robots.txt disallows the endpoints serving the data, so a fetch returns a shell whose only title is "McMaster-Carr". Don't add a scraping path for them.

**Vendor cart handoff** — `server/utils/cart-link.ts` turns a `to_order` order into a one-click cart on the vendor's own storefront, served by `GET /api/orders/:id/cart-link` and surfaced by `app/components/VendorCartButton.vue`. Two platforms: **Shopify** (`/cart/{variantId}:{qty},…?storefront=true`), which needs the numeric variant id — items usually store a SKU, so unresolved ones are looked up through the part extractor; **Amazon** (`/gp/aws/cart/add.html?AssociateTag=0&ASIN.n=…&Quantity.n=…`), which needs no lookups because the ASIN is in every product link; and **DigiKey** ([FastAdd](https://forum.digikey.com/t/digikey-fastadd-bulk-add-parts-into-a-digikey-cart-via-third-party-tooling-and-urls/61356), `/classic/ordering/fastadd.aspx?part1=…&qty1=…`), which needs DigiKey's own part number and so resolves the stored manufacturer part number through their API. Two vendors add one part at a time instead, and come back as `addLinks` — a link per part that the button lists in a popover, ticking each off as it's followed. Every row targets the same named window so the buyer walks through one tab, and adds accumulate in the vendor's session.

**Playing With Fusion** takes a `POST` to `/addtocart.php` with `qty=N` and `pdids[]=<id>`, so those rows carry `postFields` and the UI submits a form rather than following a link. The product id is right in the URL (`/products/118`), so no lookup is needed. The same request as a `GET` leaves the cart empty, and several `pdids[]` in one `POST` all land at the single `qty` (a `qty[]` array is ignored) — hence one request per part.

**BigCommerce** (REV Robotics, BaneBots) is the other: it adds one product per URL and ignores every multi-item form — array parameters, redirect chaining, `action=addbulk` — so those orders come back as `addLinks`, a link per part that the button lists in a popover. Adds accumulate in the vendor's session, so following them in one tab builds the cart up. The id in those URLs is BigCommerce's internal product id, read off the add-to-cart form on each product page (`data-product-id` appears on every related-product tile too, so it's the wrong one to grab). Whether a bare add will actually land can't be predicted — a product with options and one that's out of stock both just bounce to their own page, and neither shows in the markup reliably — so no attempt is made to; the bounce lands the buyer where they need to be anyway.

Platform detection is the fiddly part. An order with no vendor row is identified by its parts' URLs, and `/products/` alone is far too weak a signal — DigiKey (`/en/products/detail/…`) and Playing With Fusion (`/products/118`) both use it without being Shopify. So DigiKey is matched by host first, and the Shopify path check requires the handle to be the last segment *and* contain a letter, since Shopify handles are slugs built from product titles. Anything that still slips through is caught server-side: if no lookup actually reached Shopify's product JSON, the result is `unsupported-platform` rather than blaming the parts for not matching. `AssociateTag` is mandatory — without it the endpoint takes the parameters but never fills the cart, and the failure is invisible to an unauthenticated check because a signed-out request bounces to sign-in either way. The value isn't validated; `0` is deliberate, since a real Associates tag would quietly earn commission on a team's purchases. Parts that can't be resolved are reported in `excluded` rather than silently dropped, and `app/utils/cart.ts` holds a deliberately optimistic client-side check for whether to show the button at all.

**Client data layer** — `app/` is the Nuxt srcDir. Client fetching uses **TanStack Vue Query** (`app/plugins/vue-query.ts`); composables in `app/composables/` wrap endpoints with stable query keys (e.g. `useOrdersQuery` / `ORDERS_QUERY_KEY`). Note that `app/pages/app.vue` copies the query result into a local `ordersState` ref and patches it optimistically (`upsertOrder`/`removeOrder`) from mutation responses rather than invalidating the query. Client order types are derived from the server via `InternalApi` in `app/types/orders.ts`, so changes to `OrderRecord` propagate to the UI automatically. Auth state is exposed via `app/composables/auth.ts` plus `app/plugins/auth.{client,server}.ts`.

**Dashboard interactions** — `/app` offers a board view and a table view. The board has three drag targets: dropping an order on a **column** changes its status, dropping a part on another **order card** moves it there (same vendor, both `to_order`), and dropping a part on the **To order column** splits it into its own order. The table view filters by date range, vendor, status and tag, and exports CSV.

**Routing & rendering** — landing `/` is prerendered (`routeRules`). The authenticated dashboard is `/app` (alongside `/search`, `/settings`, `/organization`), gated by `app/middleware/app.global.ts` (redirects unauthenticated users to `/auth/login`, and enforces admin/owner role for `/organization`). Marketing/docs use Nuxt Content: markdown in `content/`, config in `content.config.ts`, served at `/docs`. Layouts: `default` (marketing), `app`, `auth`, `docs`.

**Email/notifications** — Resend + Vue Email templates (`server/utils/*.vue`, rendered with `@vue-email/render`). Per-user, per-org preferences and an audit log live in `notificationPreferences` / `notificationLog`; helpers in `notification-helpers.ts` and `email-service.ts`. Route handlers fire notifications and forget them (`.catch(console.error)`), so a mail failure never fails the write.

**Cloudflare bindings** (declared in `nuxt.config.ts` under `nitro.cloudflare.wrangler`): `HYPERDRIVE` (Postgres), `KV`, `DB` (D1 — `@nuxt/content` switches to this in production), `VPC_SERVICE` (scraper), plus version metadata. The Nitro config externalizes `pg-native`/`canvas` and replaces `typeof window` with `undefined` for the Workers build.

## Gotchas

- **Code style is inconsistent across the repo.** Some files use single quotes and no semicolons (the top half of `schema.ts`, `part-extractor.ts`, most of `app/composables/`), others double quotes with semicolons (`order-service.ts`, the notification tables, most API routes). Match the surrounding file rather than a repo-wide convention; ESLint stylistic config is in `nuxt.config.ts` (`commaDangle: never`, `braceStyle: 1tbs`).
- **There are no DB transactions.** Multi-step writes — split, move, and the details update that deletes and reinserts payment rows — are sequential statements, so a failure partway through can leave inconsistent state. Keep multi-step order mutations idempotent/re-runnable.
- **`findOrCreatePendingOrder` is check-then-insert**, so concurrent adds for the same vendor can produce two open orders. Harmless but user-visible; the parts can be merged back with `moveItemsToOrder`.
- **`better-sqlite3` is an unused dependency** whose native build fails on Windows without Visual Studio C++ build tools. Nothing in the codebase imports it. If `bun install` fails on its build step, run `bun install --ignore-scripts` then `bun run postinstall` (`nuxt prepare`).
- **`docker-compose.yml` pins `postgres:17`.** The unpinned `postgres` tag now resolves to PG18, which refuses to start with the volume mounted at the legacy `/var/lib/postgresql/data` path.
- The Cloudflare-specific bindings (Hyperdrive, VPC_SERVICE, D1) are only present at runtime on Workers; dev relies on the `DATABASE_URL` fallback and the localhost scraper, so some production code paths (`import.meta.dev` branches) differ locally.
