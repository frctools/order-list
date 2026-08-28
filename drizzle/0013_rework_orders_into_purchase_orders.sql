-- Rework single-part orders into per-vendor purchase orders with line items.
-- Data-preserving: the existing `orders` rows become `order_items`, grouped
-- into new header `orders` by (organization, vendor, status).

-- 1. The existing per-part table becomes the line-items table.
ALTER TABLE "orders" RENAME TO "order_items";
--> statement-breakpoint
-- 2. Tags are attached to parts (line items) now.
ALTER TABLE "order_tags" RENAME COLUMN "order_id" TO "order_item_id";
--> statement-breakpoint
-- 3. New header table for the per-vendor purchase order.
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"vendor_id" text,
	"vendor_name" text,
	"status" "order_status" DEFAULT 'to_order' NOT NULL,
	"requested_by" text NOT NULL,
	"ordered_at" timestamp,
	"arrived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- 4. Link column (nullable during backfill).
ALTER TABLE "order_items" ADD COLUMN "order_id" text;
--> statement-breakpoint
-- 5. Create one header order per (organization, vendor, status) group.
INSERT INTO "orders" (
	"id", "organization_id", "vendor_id", "vendor_name", "status",
	"requested_by", "ordered_at", "arrived_at", "created_at", "updated_at"
)
SELECT
	gen_random_uuid()::text,
	grp."organization_id",
	grp."vendor_id",
	grp."vendor_name",
	grp."status",
	grp."requested_by",
	grp."ordered_at",
	grp."arrived_at",
	now(),
	now()
FROM (
	SELECT
		"organization_id",
		"vendor_id",
		"vendor_name",
		"status",
		(array_agg("requested_by" ORDER BY "created_at"))[1] AS "requested_by",
		max("ordered_at") AS "ordered_at",
		max("arrived_at") AS "arrived_at"
	FROM "order_items"
	GROUP BY "organization_id", "vendor_id", "vendor_name", "status"
) grp;
--> statement-breakpoint
-- 6. Point each line item at its header order.
UPDATE "order_items" oi
SET "order_id" = o."id"
FROM "orders" o
WHERE o."organization_id" = oi."organization_id"
	AND o."status" = oi."status"
	AND o."vendor_id" IS NOT DISTINCT FROM oi."vendor_id"
	AND o."vendor_name" IS NOT DISTINCT FROM oi."vendor_name";
--> statement-breakpoint
-- 7. Enforce the link and add the header foreign keys.
ALTER TABLE "order_items" ALTER COLUMN "order_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- 8. Columns that now live on the header order.
ALTER TABLE "order_items" DROP COLUMN "organization_id";
--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "status";
--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "vendor_id";
--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "vendor_name";
--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "ordered_at";
--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "arrived_at";
--> statement-breakpoint
-- 9. Indexes.
CREATE INDEX "orders_organizationId_idx" ON "orders" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "order_items_orderId_idx" ON "order_items" USING btree ("order_id");
