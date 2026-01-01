CREATE TABLE "notification_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"recipient_email" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error_message" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"order_created" boolean DEFAULT true NOT NULL,
	"order_status_changed" boolean DEFAULT true NOT NULL,
	"order_deleted" boolean DEFAULT false NOT NULL,
	"invitation_received" boolean DEFAULT true NOT NULL,
	"member_joined" boolean DEFAULT true NOT NULL,
	"tag_created" boolean DEFAULT false NOT NULL,
	"tag_modified" boolean DEFAULT false NOT NULL,
	"daily_digest" boolean DEFAULT false NOT NULL,
	"digest_time" text DEFAULT '09:00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_log_userId_idx" ON "notification_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_log_organizationId_idx" ON "notification_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_log_type_idx" ON "notification_log" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notification_log_createdAt_idx" ON "notification_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_preferences_userId_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_preferences_organizationId_idx" ON "notification_preferences" USING btree ("organization_id");