-- Post-order fulfilment details: tracking, shipping cost, and split payments.
ALTER TABLE "orders" ADD COLUMN "tracking_carrier" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_url" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_cents" integer;
--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "order_payments_orderId_idx" ON "order_payments" USING btree ("order_id");
