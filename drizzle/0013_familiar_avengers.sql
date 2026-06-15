CREATE TABLE "kit_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kit_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"part_name" text NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer,
	"variant_id" text,
	"variant_title" text,
	"vendor_id" text,
	"vendor_name" text,
	"external_url" text,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kits" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"share_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kits_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kit_items_kitId_idx" ON "kit_items" USING btree ("kit_id");--> statement-breakpoint
CREATE INDEX "kit_items_vendorId_idx" ON "kit_items" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "kits_organizationId_idx" ON "kits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "kits_shareId_idx" ON "kits" USING btree ("share_id");