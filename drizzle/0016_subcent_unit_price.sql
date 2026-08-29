-- Unit prices move from whole cents to micro-dollars (1e-6 USD).
--
-- Distributors quote sub-cent unit prices at quantity breaks — DigiKey goes to
-- five decimals ($0.14322) — and whole cents rounded that away, overstating a
-- line by a few percent. Existing values convert exactly: 1 cent = 10000
-- micro-dollars.
ALTER TABLE "order_items" ADD COLUMN "unit_price_micros" bigint;--> statement-breakpoint
UPDATE "order_items" SET "unit_price_micros" = "unit_price_cents" * 10000 WHERE "unit_price_cents" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "unit_price_cents";
