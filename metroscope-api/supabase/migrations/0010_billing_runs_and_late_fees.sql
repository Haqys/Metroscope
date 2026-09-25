-- Monthly billing runs and the FR-PAY-6 late fee.
--
-- ALTER TYPE ... ADD VALUE is safe here because nothing in this migration uses
-- the new label; Postgres only forbids using a value added in the same
-- transaction that created it.
ALTER TYPE "public"."invoice_status" ADD VALUE 'DRAFT' BEFORE 'UNPAID';--> statement-breakpoint
CREATE TABLE "billing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"invoice_count" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"issued_by_id" uuid,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_runs_period_unique" UNIQUE("period")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "late_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "late_fee_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "last_reminder_offset" integer;--> statement-breakpoint
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_runs_status_idx" ON "billing_runs" USING btree ("status","period");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_run_id_billing_runs_id_fk" FOREIGN KEY ("billing_run_id") REFERENCES "public"."billing_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- RLS in the SAME migration that creates the table.
--
-- Supabase grants ALL on public to anon and authenticated by default, so a
-- table shipped without this is readable and writable by the anon key that
-- ships in every browser bundle. Policies live in supabase/policies/60_billing.sql.
ALTER TABLE "billing_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- The nightly sweep reads (status, due_date) and writes late_fee; the reminder
-- job reads the same rows. Without this it is a sequential scan every night
-- over every invoice ever issued.
CREATE INDEX IF NOT EXISTS "invoices_due_sweep_idx"
  ON "invoices" USING btree ("status", "due_date", "last_reminder_offset");
