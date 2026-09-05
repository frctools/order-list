# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Innovators Parts (`innovators-parts`) — a parts ordering app for FRC robotics teams, branded *Innovators Parts — Powered by FRCTools*. It's a fork of [FRCTools Orders](https://github.com/frctools/order-list) by Graham Howard (MIT; original copyright retained in `LICENSE`), diverged far enough that changes aren't sent upstream. Nuxt 4 app deployed to a **DigitalOcean droplet** (Nitro `node-server` preset, PM2 behind Caddy), backed by Postgres via Drizzle, with Better Auth for auth/organizations and Meilisearch for product search.

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

# Production build (Node server output in .output/)
bun run build
```

## Deployment

Runs on a single **DigitalOcean droplet** (Ubuntu 24.04, 1 vCPU / 2 GB), not
Cloudflare Workers. Caddy is the only process bound to a public port;
everything else listens on localhost:

| | |
| --- | --- |
| Caddy | `:80`/`:443` — TLS and reverse proxy, config in `deploy/Caddyfile` |
| Nuxt | `127.0.0.1:3000` — `.output/server/index.mjs` under PM2 |
| vendord | `127.0.0.1:3434` — the scraper, under PM2 |
| Postgres | `127.0.0.1:5433` — `docker compose up -d`, container `parts-db-1` |

`deploy/provision.sh` builds the box from scratch and is safe to re-run. The
app runs as the unprivileged `parts` user out of `/srv/parts`, not as root.

**Releases ship themselves.** `.github/workflows/deploy.yml` runs on every push
to `main` (and on `workflow_dispatch`): it builds both outputs in CI, checks
what migrations are pending, uploads over rsync, installs, migrates, verifies
the schema caught up, reloads PM2 and smoke-tests the result. It holds the
production deploy key and is deliberately never triggered by `pull_request` —
the repo is a public fork, so a PR from anyone must not be able to reach it.
`deploy/release.sh` does the same by hand from a workstation, for when CI
isn't an option.

**Build off the droplet** — in CI or locally — and ship `.output/`: a Nuxt build
wants more memory than a 2 GB box has spare, and an OOM mid-build takes the
running site with it. `bun install` is nearly as hungry: run it with nothing
else competing, and expect the box to be unresponsive for a minute if it
starts swapping. It answers ICMP throughout, so "ping works but SSH hangs"
is memory pressure, not the network.

Two things about that box that are easy to get wrong:

- **PM2 does not read `.env`.** Nitro only loads it in dev, and PM2 has no
  `env_file` option, so a process started without help comes up with no
  `DATABASE_URL` and fails on its first query. `ecosystem.config.cjs` parses
  the file itself and passes it to both processes — vendord included, whose
  routes import the app's own `server/utils/db`.
- **Docker publishes ports around ufw.** It writes its own iptables rules
  ahead of ufw's chain, so a bare `"5433:5432"` puts Postgres on the public
  internet while `ufw status` still reports the port as denied. The compose
  file pins the published address to `127.0.0.1` deliberately.

Shipping a release by hand:

```bash
./deploy/release.sh                 # build, upload, install, migrate, reload
SKIP_BUILD=1 ./deploy/release.sh    # ship what is already in .output/
```

That script migrates unconditionally and has none of the destructive-migration
gate the workflow applies, so read the pending SQL yourself before running it.

The droplet needs a **full** `bun install`, not `--production`: `.output` does
not vendor its dependencies (`better-sqlite3` is resolved from `node_modules`
at runtime, and `/docs` breaks without it), and `drizzle-kit` — which
`db:migrate` needs — is a devDependency.

**Never ship `.output/server/node_modules`.** Nitro traces a dependency copy in
there for whatever machine ran the build; from a Windows workstation its nested
directories arrive empty and the app crash-loops on `ENOENT reading
.../html-to-text/node_modules/htmlparser2`. Both `release.sh` and the
workflow's `rsync` exclude it so resolution walks up into the
natively-installed `node_modules` instead.

Migrations run **before** the reload, for the reason in the migrations note
below. Backups are `deploy/backup-db.sh` on a nightly cron, plus weekly droplet
snapshots; the script refuses to keep a dump that comes back suspiciously
small, and copies off-box when `RCLONE_REMOTE` is set.

Database migrations (Drizzle Kit reads `DATABASE_URL`):

```bash
bun run db:generate   # create a migration from schema changes
bun run db:migrate    # apply pending migrations in drizzle/
```

**A migration must land before the code that needs it.** Deploying code that queries a table its database doesn't have takes the site down, and nothing else notices: the build succeeds, static pages render, and only the queries touching the new schema fail. That is exactly how the receipts feature shipped against a database with no `order_receipts` table. Only additive migrations are safe to apply in either order; a rename or drop (like `unit_price_cents` → `unit_price_micros` in `0016`) is not.

The deploy workflow enforces that ordering rather than leaving it to discipline. `deploy/pending-migrations.mjs` reads the applied `created_at` values out of `drizzle.__drizzle_migrations`, diffs them against `drizzle/meta/_journal.json`, and runs **before the upload**, so a deploy that can't safely migrate stops while the server is still untouched. It regex-scans each pending file for `DROP` / `RENAME` / `TRUNCATE` / `ALTER COLUMN … TYPE` and refuses to continue on a hit — deliberately over-broad, since a false positive costs one ticked checkbox and a false negative discards a column with nobody watching. To apply one of those, re-run the workflow from `workflow_dispatch` with `run_migrations` ticked. Migration, then a re-check that nothing is still pending, then the reload.

Two caveats when writing one:

- **Hand-written migrations still need a snapshot.** `0013`–`0015` were written by hand without regenerating `drizzle/meta`, which left the snapshots four migrations behind the schema — `db:generate` then diffed from the wrong baseline and started prompting about unrelated tables. `0016_snapshot.json` re-baselines it. If you hand-write SQL again, regenerate the snapshot too, and check `db:generate` reports *"No schema changes"* on an unmodified schema before committing.
- **Drizzle Kit generates destructively for renames.** It emits DROP + ADD, which discards the column's data. Migration `0016` is the pattern to copy: add the new column, `UPDATE` across from the old one, then drop.

There is no test runner configured; "verification" means lint + typecheck + exercising the dev server. In production the nearest equivalent is the workflow's smoke test, which probes one URL per rendering path — prerendered `/`, SSR'd `/auth/login`, Nuxt Content `/docs/getting-started`, and `/api/orders` expecting a 401. Checking only `/` is how a sitewide docs 404 once shipped green, which is why the list is what it is.

## Environment

Dev config lives in `.env` (gitignored). Most server code reads `process.env.*` directly (not just Nuxt `runtimeConfig`):

- `DATABASE_URL` — local Postgres, e.g. `postgres://postgres:orderr@localhost:5433/postgres`
- `DATABASE_POOL_MAX` — optional; size of the connection pool, default 10
- `VENDORD_URL` — optional; where the scraper listens. Defaults to `http://localhost:3001` in dev and `http://localhost:3434` in production
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (`http://localhost:3000` in dev)
- `RESEND_KEY` — transactional email; optional in dev (only used when sending invites/notifications)
- `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MEILISEARCH_INDEX` — product search; optional. `docker compose up -d` runs one locally on `127.0.0.1:7700`, so dev is `http://127.0.0.1:7700` with the key from `MEILISEARCH_API_KEY` (default `devsearchkey`)
- `MEILISEARCH_EMBEDDER` — optional; the name of an embedder configured on the index. Set it to turn on hybrid (keyword + semantic) search, leave it unset for keyword only
- `DIGIKEY_CLIENT_ID`, `DIGIKEY_CLIENT_SECRET`, `DIGIKEY_API_BASE` — DigiKey Product Information API v4 (developer.digikey.com); optional. Sandbox and production are separate apps with separate credentials, so `DIGIKEY_API_BASE` has to match the pair in use — `https://sandbox-api.digikey.com` or `https://api.digikey.com`. Unset means DigiKey parts fall back to the URL-derived name and SKU.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — optional; enables "Continue with Google" on the auth pages. Both must be set or the provider is absent entirely and no button renders. The redirect URI to register with Google is `<origin>/api/auth/callback/google`. Signing in with Google does **not** bypass the invitation gate — Better Auth creates an OAuth user through the same `createWithHooks("user")` path, so the hook in `auth.ts` runs either way.
- `SIGNUP_BOOTSTRAP_EMAIL` — optional; restricts the one-time first-account signup to a single address (see *Signups are invitation-only* below). Unset means the first person to reach an empty instance claims it.
- `NUXT_PUBLIC_SENTRY_DSN` — optional

## Architecture

**Database connection** — `server/utils/db.ts` is the single DB entry point (`useDB()`): a drizzle `node-postgres` client over one `pg.Pool` built from `DATABASE_URL`. Always go through `useDB()`.

The pool is **built once for the life of the process**, and that matters. It used to be rebuilt on every `useDB()` call, which was merely wasteful on Workers — isolates are short-lived and Hyperdrive pooled underneath — but exhausts Postgres on a long-running Node server instead: a single request touches `useDB()` several times, none of them are closed, and the server stops answering once `max_connections` is reached. `DATABASE_POOL_MAX` (default 10) sizes it, comfortably under Postgres' default of 100 so psql, backups and a second process still get in. `closeDB()` exists so shutdown doesn't wait on idle connections.

**Signups are invitation-only** — there is no open registration. `server/utils/signup-gate.ts` holds the rule and `auth.ts` enforces it in Better Auth's `databaseHooks.user.create.before`, which throws a `403 APIError`. It lives in the database hook rather than on the page or a route wrapper because Better Auth owns `/api/auth/**` — a check anywhere else is bypassed by posting to `sign-up/email` directly. An account can be created only when:

- a **pending, unexpired invitation** exists for that email (compared case-insensitively — Better Auth lowercases invitation addresses but not necessarily signup ones), or
- the instance has **no users at all**, the bootstrap window that lets the first owner in. That window is first-come on a public host, so `SIGNUP_BOOTSTRAP_EMAIL` narrows it to one address; it closes permanently once any user exists.

Note that Better Auth's `acceptInvitation` refuses unless the session's email matches the invitation exactly, so an invited signup must use the invited address — `/api/signup-status` exists to tell the signup page which of its three states to render (`bootstrap` / `invitation` / `closed`) and hands back the invited address so the form can pin it. That endpoint is cosmetic; forging its answer gains nothing because the hook still runs. Deliberately *not* used: `emailAndPassword.disableSignUp`, which would also lock out invited users and break the invite flow entirely.

**Invitations turn into membership at sign-in**, not only when someone follows an `/accept-invitation/<id>` link. Being invited and being a member are separate things, and that link only ever arrives by email — so anyone signing in another way (straight to `/auth/login`, through Google, or at `/auth/signup` without the link) ended up with an account, no organization and an empty dashboard while the invitation sat pending. With no `RESEND_KEY` set no email goes out at all, and that is the only path there is. So `databaseHooks.session.create.before` in `auth.ts` calls `acceptPendingInvitations()`, keyed off the address the invitation was sent to — the same thing Better Auth's own `acceptInvitation` checks — and seeds `activeOrganizationId` from what it joined, falling back to `soleOrganizationOf()`. Without that seeding Better Auth leaves the field null on a new session and every API route refuses with a 400 while the dashboard still shows a team. It runs on every sign-in, so it also repairs accounts created before it existed. There are no transactions, so it is written to be re-runnable: a partial failure leaves the rest pending for the next sign-in.

**Multi-tenancy via Better Auth organizations** — `server/utils/auth.ts` configures Better Auth with the `organization` plugin. Every app resource is scoped to an organization. The gate for authenticated API routes is `requireOrganizationContext(event)` in `server/utils/session.ts`: it returns `{ user, session, organizationId, membership }`, throwing **401** if unauthenticated and **400** if no active org is selected (`session.activeOrganizationId`). It resolves `membership` through a `getFullOrganization` call, so it costs an extra auth round-trip per request. New API handlers that touch org data should call it first and filter queries by `organizationId`.

**Schema is split in two** — `server/utils/auth-schema.ts` holds Better Auth tables (user, session, account, organization, member, invitation); `server/utils/schema.ts` holds app tables (vendors, tags, orders, orderItems, orderTags, orderPayments, orderReceipts, productCache, notification\*). Both are registered in `drizzle.config.ts` and merged into the drizzle client. (Note: a second `auth-schema.ts` exists at the repo root from the Better Auth CLI — the one the DB actually imports is `server/utils/auth-schema.ts`.)

### Order data model

Orders are **two-level**: an order is a per-vendor *purchase order header*, and the parts are line items under it.

- `orders` — vendor (`vendorId` for a known vendor row, else free-text `vendorName`), `status` (`to_order` → `ordered` → `arrived`), `orderedAt`/`arrivedAt`, and post-order fulfilment fields (`trackingCarrier`, `trackingNumber`, `shippingCents`, `taxCents`). The order advances as a unit — status lives here, not on parts.
- `orderItems` — one part per row (`partName`, `quantity`, `unitPriceMicros`, variant fields, `externalUrl`).
- `orderTags` — tags attach to **line items** (`orderItemId`), not to orders.
- `orderPayments` — split payment lines (`credit_card` / `voucher` / `coupon` / `other`), so one order can be part credit card, part Kit-of-Parts voucher, part coupon.
- `orderReceipts` — uploaded invoices and packing slips, several per order. See *Receipts* below.

**Money units** — item unit prices are stored as **micro-dollars** (1e-6 USD) in `orderItems.unitPriceMicros`, because distributors quote sub-cent prices at quantity breaks (DigiKey goes to five decimals) and whole cents rounded them away. Everything else — shipping, tax, payments, and all order totals — stays in whole cents, which is what actually gets paid. `app/utils/money.ts` owns the conversions and the display rule: a unit price renders as plain money when it lands on whole cents (`$2.40`) and only spells out the extra digits when it genuinely carries them (`$0.231`). Line totals sum in micros and round to cents once, never per line.

Totals are derived in JS rather than stored: `totalCents` (items), `paidCents` (payments), `grandTotalCents` (items + shipping + tax).

**Grouping rule** — parts are added with a vendor, and `findOrCreatePendingOrder` drops each part into the org's open (`to_order`) order for that vendor, creating one if none exists. `vendorKey()` mirrors that grouping so moves can be validated: parts only combine within the same vendor, and only between `to_order` orders. Any source order left empty (by a split, a move, or an item delete) is deleted.

**Order write logic lives in `server/utils/order-service.ts`**, keeping route handlers thin: `addLineItem` / `addLineItemsBulk` / `addItemToOrder` (create), `updateLineItem` / `deleteLineItem`, `splitItemsToNewOrder` (move parts into a fresh order — "ship separately"), `moveItemsToOrder` (join parts into an existing open order), `updateOrderDetails` (tracking/shipping/tax plus replacing the payment set), and the Zod `createOrderSchema`. All reads go through the private `fetchOrders()`, which runs five queries (orders, payments, receipt metadata, items, item tags) and assembles the full `OrderRecord`.

### Receipts

Orders carry uploaded invoices and packing slips; several per order is normal — a vendor invoice plus a packing slip, or one per shipment when an order splits. `server/utils/receipt-service.ts` owns the logic, with routes under `server/api/orders/[id]/receipts/`.

**The bytes live in Postgres** (`order_receipts.content`, a `bytea` declared through a drizzle `customType` since there's no built-in), not on disk. The nightly backup is a `pg_dump` and nothing else, so anything on the filesystem would be covered only by the weekly droplet snapshot — a receipt uploaded and lost inside the same week would be unrecoverable. Keeping it in the table gives receipts the same restore guarantee as the orders they document. `MAX_RECEIPT_BYTES` caps an upload at 10 MB so one file can't dominate the dump it rides along in.

Three things about the handling are deliberate:

- **The MIME type is sniffed from the bytes**, never trusted from the multipart headers the client controls — a declared `application/pdf` says nothing about what was actually sent. `detectMimeType()` matches magic bytes for PDF/JPEG/PNG/WebP, and the type it returns is what gets stored and later echoed back as the download's `Content-Type`.
- **Filenames are stripped** of control characters, quotes, backslashes and path separators, because they end up inside a quoted `Content-Disposition`.
- **Downloads are served defensively**: `X-Content-Type-Options: nosniff`, a `default-src 'none'; sandbox` CSP to neutralise anything active inside a PDF, and `Cache-Control: private, no-store` because these are organization data served from the app's own origin. `?download=1` switches the disposition from `inline` to `attachment`.

Every route calls `assertOrderInOrg()` first — a receipt id alone must never be enough to reach a file, or one organization could read another's audit trail. Neither `listReceipts()` nor `fetchOrders()` selects `content`, so listing orders never drags receipt bytes through memory; the download route is the one place it is read.

**API routes** — Nitro file-based routing under `server/api/` with method suffixes (`index.get.ts`, `[id].patch.ts`, etc.). Orders live at `/api/orders` (list/create), `/api/orders/[id]` (patch status/vendor, delete), `/api/orders/[id]/details`, `/api/orders/[id]/items[/itemId]`, `/api/orders/[id]/receipts[/receiptId]`, `/api/orders/[id]/cart-link`, plus `bulk`, `move`, `split`, and `payment-methods`.

**Vendors & product search** — three distinct systems:
- `server/api/vendors/search.get.ts` queries **Meilisearch** over the product catalog; `facets.get.ts` beside it returns facet values (default `vendorName`) for the search page's filters. Neither is auth-gated.

  **How the index gets filled.** Two Nitro tasks in vendord, chained: `scrape` walks every row of the `vendors` table — Shopify through `/products.json?limit=250&page=N`, BigCommerce through its storefront GraphQL — and upserts each product into `productCache`; it then runs `meilisearch:sync`, which joins `productCache` to `vendors` and pushes documents to the index. Trigger them at `GET /scrape` and `GET /sync` on vendord (dev: `localhost:3001`), and `scrape` is also on a nightly cron in `vendord/nitro.config.ts`. Both read `DATABASE_URL` and the `MEILISEARCH_*` vars, and vendord needs its own `bun install`.

  **The `vendors` table is the input, and it does not seed itself** — an empty table means an empty index, with both tasks reporting success. Five FRC vendors are reachable, and which platform a brand runs is not guessable:

  | vendor | `type` | hostname |
  | --- | --- | --- |
  | WestCoast Products | `shopify` | `wcproducts.com` |
  | AndyMark | `shopify` | `www.andymark.com` |
  | The Thrifty Bot | `shopify` | `www.thethriftybot.com` |
  | Cross the Road Electronics | `shopify` | `store.ctr-electronics.com` |
  | REV Robotics | `bigcommerce` | `www.revrobotics.com` |

  Three others are BigCommerce but **cannot** be scraped, and it is worth not re-deriving this: `getBigCommerceToken` lifts a storefront GraphQL token out of the homepage HTML, and **goBILDA, ServoCity and BaneBots don't publish one** — not on any template (home, cart, login, search), not at runtime (their storefronts are server-rendered Stencil and never call the GraphQL API), and their `/graphql` answers *"credentials were missing"* to an anonymous request. Reaching them would need a different scraper built on their product sitemap (`/xmlsitemap.php?type=products`) plus a page fetch each. Swyft Robotics is Shopify but has the JSON endpoint switched off, so it is out for the same practical reason.

  **Hybrid search is opt-in.** `search.get.ts` used to pass `hybrid: { embedder: "default" }` unconditionally, and Meilisearch rejects the whole request when no embedder is configured — *"Passing `hybrid` as a parameter requires enabling the `vector store` experimental feature"* — so every search failed on any instance without one, which is the default. It now sends `hybrid` only when `MEILISEARCH_EMBEDDER` names one, and otherwise runs keyword search over `title`/`description`/`vendorName`/`skus`.

  Two things the sync deliberately normalises, because Shopify's raw values break the features the index advertises: **prices are parsed to numbers** (Shopify quotes them as strings, and `price` is a declared sortable attribute — sorting strings put `119.99` between `11.00` and `12.00`, so `sort=price-asc` silently returned nonsense), and **`body_html` is flattened to text** (it is both indexed and rendered by the search page).
- `server/api/vendors/index.get.ts` proxies to the external `vendord` scraper service over localhost — `http://localhost:3434` in production, `http://localhost:3001` in dev, both overridden by `VENDORD_URL` (`server/utils/vendord.ts`). It forwards only what the scraper needs to look like a browser, never the caller's cookies. Vendors carry a `type` (`shopify`/`bigcommerce`/`amazon`) and `config`; fetched products are cached in the `productCache` table.
- `server/api/vendors/extract.get.ts` + `server/utils/part-extractor.ts` is a **self-contained in-process extractor** that needs no scraper service or DB: given a product URL it tries Shopify's `/products/{handle}.json`, then JSON-LD, then an Amazon-specific DOM read (their meta tags describe the storefront — `<meta name="title">` is `"Amazon.com: {name} : {category}"` and there's no price tag at all), then OpenGraph/meta. It is auth-gated and refuses loopback/private/link-local hosts so it can't be used as an SSRF proxy.

Three escape hatches exist for vendors the extractor can't read directly:

- **A vendor API** — `server/utils/digikey.ts` calls DigiKey's Product Information API v4, which `extract.get.ts` tries first for DigiKey links (`source: 'digikey'`). It beats the page even where the page were readable: description, stock, packaging variations, and quantity price breaks. Tokens live ~10 minutes and are cached in module scope — one token for the whole process, now that it is a long-lived Node server rather than a Worker isolate. With no credentials set it returns `null` without making a request, and the URL fallback below takes over.

- **Delegation to vendord** — Online Metals answers the app's own fetch with a bot-challenge interstitial, so `extract.get.ts` sends those hosts to vendord *first* via `server/utils/vendord.ts` (`DELEGATED_HOSTS`), mapping the scraper's reply back into the extractor's own result shape (`source: 'scraper'`). If vendord is down or blocked in turn, the extractor's own fallbacks still run.
- **URL-only vendors** (`URL_ONLY_VENDORS` in `part-extractor.ts`) — hosts whose pages a server can't usefully read at all. These are matched *before* any network call and parsed straight from the URL (`source: 'url'`), and none of them yields a price. Online Metals decodes `/buy/{category}/{slug}/pid/{pid}` plus the `?variant=` cut length; McMaster-Carr decodes the part number out of `/91290A115/`; DigiKey lands here when no API credentials are set; Studica takes a name guessed from its flat slug and deliberately no SKU; VEX decodes the part number out of `/276-4810.html`, which is exactly what their own page reports as both `sku` and `mpn`. What the UI does with the result is uniform: `source === 'url'` with a null price raises the "this vendor blocks automated lookups" warning in `OrderEditorSlideover.vue`, so the buyer knows to check the name and type the price in.

  Three of these are blocked rather than merely unreadable, and the blocks differ. **McMaster is never requested** — their pages render client-side, are marked `noindex, noarchive`, and robots.txt disallows the endpoints serving the data, so a fetch returns a shell whose only title is "McMaster-Carr". Don't add a scraping path for them. **Studica and VEX are Cloudflare**, and neither is worth retrying from the server: both refuse curl, Node's `fetch` (so delegating to vendord achieves nothing — it makes the same kind of plain request) and headless Chrome. Studica's is a managed challenge that a headed browser clears; VEX's is a custom "Access Temporarily Blocked" page, and even a headed browser is re-blocked after roughly one navigation. Both publish complete schema.org Product data that the JSON-LD path would read perfectly, so if either ever allowlists the droplet, delete the entry and let ordinary extraction run.

  VEX accepts **only** the `NNN-NNNN.html` part-number shape. Their slug pages (`/wheels.html`, `/gears.html`) carry the same `.html` suffix and are marked up as a `Product` — named "Wheels", with a null price and nothing orderable behind them. Turning one into a line item is the same trap WCP's configurator pages set, so they get no extraction at all. Anchoring the digits is also what rejects `/123-kits.html` and `/393-motors.html`, which are slugs that merely begin with them.

**Vendor cart handoff** — `server/utils/cart-link.ts` turns a `to_order` order into a one-click cart on the vendor's own storefront, served by `GET /api/orders/:id/cart-link` and surfaced by `app/components/VendorCartButton.vue`. Two platforms: **Shopify** (`/cart/{variantId}:{qty},…?storefront=true`), which needs the numeric variant id — items usually store a SKU, so unresolved ones are looked up through the part extractor; **Amazon** (`/gp/aws/cart/add.html?AssociateTag=0&ASIN.n=…&Quantity.n=…`), which needs no lookups because the ASIN is in every product link; and **DigiKey** ([FastAdd](https://forum.digikey.com/t/digikey-fastadd-bulk-add-parts-into-a-digikey-cart-via-third-party-tooling-and-urls/61356), `/classic/ordering/fastadd.aspx?part1=…&qty1=…`), which needs DigiKey's own part number and so resolves the stored manufacturer part number through their API. Two vendors add one part at a time instead, and come back as `addLinks` — a link per part that the button lists in a popover, ticking each off as it's followed. Every row targets the same named window so the buyer walks through one tab, and adds accumulate in the vendor's session.

**Playing With Fusion** takes a `POST` to `/addtocart.php` with `qty=N` and `pdids[]=<id>`, so those rows carry `postFields` and the UI submits a form rather than following a link. The product id is right in the URL (`/products/118`), so no lookup is needed. The same request as a `GET` leaves the cart empty, and several `pdids[]` in one `POST` all land at the single `qty` (a `qty[]` array is ignored) — hence one request per part.

**BigCommerce** (REV Robotics, BaneBots) is the other: it adds one product per URL and ignores every multi-item form — array parameters, redirect chaining, `action=addbulk` — so those orders come back as `addLinks`, a link per part that the button lists in a popover. Adds accumulate in the vendor's session, so following them in one tab builds the cart up. The id in those URLs is BigCommerce's internal product id, read off the add-to-cart form on each product page (`data-product-id` appears on every related-product tile too, so it's the wrong one to grab). Whether a bare add will actually land can't be predicted — a product with options and one that's out of stock both just bounce to their own page, and neither shows in the markup reliably — so no attempt is made to; the bounce lands the buyer where they need to be anyway.

Platform detection is the fiddly part. An order with no vendor row is identified by its parts' URLs, and `/products/` alone is far too weak a signal — DigiKey (`/en/products/detail/…`) and Playing With Fusion (`/products/118`) both use it without being Shopify. So DigiKey is matched by host first, and the Shopify path check requires the handle to be the last segment *and* contain a letter, since Shopify handles are slugs built from product titles. Anything that still slips through is caught server-side: if no lookup actually reached Shopify's product JSON, the result is `unsupported-platform` rather than blaming the parts for not matching. `AssociateTag` is mandatory — without it the endpoint takes the parameters but never fills the cart, and the failure is invisible to an unauthenticated check because a signed-out request bounces to sign-in either way. The value isn't validated; `0` is deliberate, since a real Associates tag would quietly earn commission on a team's purchases. Parts that can't be resolved are reported in `excluded` rather than silently dropped, and `app/utils/cart.ts` holds a deliberately optimistic client-side check for whether to show the button at all.

**Client data layer** — `app/` is the Nuxt srcDir. Client fetching uses **TanStack Vue Query** (`app/plugins/vue-query.ts`); composables in `app/composables/` wrap endpoints with stable query keys (e.g. `useOrdersQuery` / `ORDERS_QUERY_KEY`). Note that `app/pages/app.vue` copies the query result into a local `ordersState` ref and patches it optimistically (`upsertOrder`/`removeOrder`) from mutation responses rather than invalidating the query. Client order types are derived from the server via `InternalApi` in `app/types/orders.ts`, so changes to `OrderRecord` propagate to the UI automatically. Auth state is exposed via `app/composables/auth.ts` plus `app/plugins/auth.{client,server}.ts`.

**Dashboard interactions** — `/app` offers a board view and a table view. The board has three drag targets: dropping an order on a **column** changes its status, dropping a part on another **order card** moves it there (same vendor, both `to_order`), and dropping a part on the **To order column** splits it into its own order. The table view filters by date range, vendor, status and tag, and exports CSV.

**Routing & rendering** — landing `/` is prerendered (`routeRules`). The authenticated dashboard is `/app` (alongside `/search`, `/settings`, `/organization`), gated by `app/middleware/app.global.ts` (redirects unauthenticated users to `/auth/login`, and enforces admin/owner role for `/organization`). Marketing/docs use Nuxt Content: markdown in `content/`, config in `content.config.ts`, served at `/docs`. Layouts: `default` (marketing), `app`, `auth`, `docs`.

**Email/notifications** — Resend + Vue Email templates (`server/utils/*.vue`, rendered with `@vue-email/render`). Per-user, per-org preferences and an audit log live in `notificationPreferences` / `notificationLog`; helpers in `notification-helpers.ts` and `email-service.ts`. Route handlers fire notifications and forget them (`.catch(console.error)`), so a mail failure never fails the write.

**Nitro config** (`nuxt.config.ts`) — `preset: 'node-server'`; `experimental.asyncContext` enabled, which is what lets `auth.ts` call a bare `useEvent()` to derive its `baseUrl`; `pg-native` and `canvas` externalized; `typeof window` replaced with `undefined`; and `@vitejs/plugin-vue` added to the Rollup config so the Vue Email SFCs under `server/utils/` compile into the server build. The Cloudflare bindings that used to live here — `HYPERDRIVE`, `KV`, `DB` (D1), `VPC_SERVICE` — went with the preset; see git history if any of it is ever wanted back.

## Gotchas

- **Code style is inconsistent across the repo.** Some files use single quotes and no semicolons (the top half of `schema.ts`, `part-extractor.ts`, most of `app/composables/`), others double quotes with semicolons (`order-service.ts`, the notification tables, most API routes). Match the surrounding file rather than a repo-wide convention; ESLint stylistic config is in `nuxt.config.ts` (`commaDangle: never`, `braceStyle: 1tbs`).
- **There are no DB transactions.** Multi-step writes — split, move, and the details update that deletes and reinserts payment rows — are sequential statements, so a failure partway through can leave inconsistent state. Keep multi-step order mutations idempotent/re-runnable.
- **`findOrCreatePendingOrder` is check-then-insert**, so concurrent adds for the same vendor can produce two open orders. Harmless but user-visible; the parts can be merged back with `moveItemsToOrder`.
- **`better-sqlite3` is load-bearing now, and its native build fails on Windows** without Visual Studio C++ build tools. It used to be genuinely unused — on Workers, `@nuxt/content` stored its data in D1 — but the `node-server` preset stores it in SQLite instead, and the built output references the driver throughout. Removing the dependency breaks `/docs` in production. On Windows, if `bun install` fails on its build step, run `bun install --ignore-scripts` then `bun run postinstall` (`nuxt prepare`); the droplet is Linux and builds it without complaint.
- **The app runs under Node, not Bun** (`interpreter: 'node'` in `ecosystem.config.cjs`). Bun builds it, but `@nuxt/content` opens its SQLite through `better-sqlite3`, a Node native addon Bun cannot `dlopen`. Under Bun every content query throws and `/docs` returns 404 while the rest of the site looks perfectly healthy — which is exactly how it shipped green past a smoke test that only checked `/`. It survived a Windows-built `.output` (which bundled a different connector) and broke the first time CI built on Linux.
- **`docker-compose.yml` pins `postgres:17`.** The unpinned `postgres` tag now resolves to PG18, which refuses to start with the volume mounted at the legacy `/var/lib/postgresql/data` path.
- **Nothing Cloudflare-specific is left at runtime**, so dev and production now differ only in configuration — which was the main reason to move off Workers. Any Hyperdrive/KV/D1/`VPC_SERVICE` reference you find is stale documentation or dead code, not something still wired up.
