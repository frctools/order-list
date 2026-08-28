-- Add a tax amount to orders; drop the manual tracking URL (now derived from
-- carrier + tracking number on the client).
ALTER TABLE "orders" ADD COLUMN "tax_cents" integer;
--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "tracking_url";
