ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "outbox_message" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "outbox_message" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox_message" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key");