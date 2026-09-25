CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_holder" text NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bank_accounts_active_idx" ON "bank_accounts" USING btree ("is_active","order_index");--> statement-breakpoint
-- RLS in the SAME migration that creates the table.
--
-- Supabase grants ALL on public to anon and authenticated by default, so a
-- table shipped without this is readable and writable by the anon key that
-- lives in every browser bundle, the hole 0001_enable_rls.sql was written to
-- close. A new table is exactly how that hole reopens, so it closes here rather
-- than in a follow-up nobody remembers to write.
--
-- The policies themselves live in supabase/policies/80_organization.sql and are
-- applied by `npm run db:policies`.
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;
