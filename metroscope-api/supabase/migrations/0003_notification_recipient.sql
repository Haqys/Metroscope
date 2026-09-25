ALTER TABLE "notifications" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "recipient_email" text;--> statement-breakpoint
-- A notification with neither a user nor an address is undeliverable and
-- unattributable. Dropping NOT NULL from user_id opens that door; this closes it.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_has_recipient"
  CHECK ("user_id" IS NOT NULL OR "recipient_email" IS NOT NULL);--> statement-breakpoint
-- The RLS policy on notifications selects on user_id = current user. Rows with a
-- NULL user_id therefore match nobody, which is correct: an email to a prospect
-- who has no account is not something any signed-in user should read.
COMMENT ON COLUMN "notifications"."user_id" IS
  'NULL for sends to people without an account (e.g. lead confirmations).';
