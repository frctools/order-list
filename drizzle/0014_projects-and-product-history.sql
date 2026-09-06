CREATE TABLE "product_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"price_cents" integer,
	"stock_quantity" integer,
	"currency" text,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "projects" (
	"id",
	"organization_id",
	"name",
	"slug",
	"description"
)
SELECT
	'project:' || "id",
	"id",
	'General',
	'general',
	'Orders that have not been assigned to a specific project.'
FROM "organization";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "project_id" text;--> statement-breakpoint
UPDATE "orders"
SET "project_id" = 'project:' || "organization_id";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_snapshots" ADD CONSTRAINT "product_snapshots_product_id_product_cache_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product_cache"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "product_snapshots" (
	"id",
	"product_id",
	"vendor_id",
	"captured_at"
)
SELECT
	'initial:' || "id",
	"id",
	"vendor_id",
	"updated_at"
FROM "product_cache";--> statement-breakpoint
CREATE INDEX "product_snapshots_productId_capturedAt_idx" ON "product_snapshots" USING btree ("product_id","captured_at");--> statement-breakpoint
CREATE INDEX "product_snapshots_vendorId_idx" ON "product_snapshots" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "projects_organizationId_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_organizationId_slug_unique" ON "projects" USING btree ("organization_id","slug");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_organizationId_projectId_idx" ON "orders" USING btree ("organization_id","project_id");
