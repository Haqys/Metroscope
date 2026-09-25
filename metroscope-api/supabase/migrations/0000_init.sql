CREATE TYPE "public"."account_status" AS ENUM('LIMITED', 'ACTIVE');--> statement-breakpoint
CREATE TYPE "public"."consultation_outcome" AS ENUM('LANJUT', 'PIKIR_DULU', 'TIDAK_COCOK');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('UNPAID', 'AWAITING_VERIFICATION', 'PAID', 'PARTIALLY_PAID', 'INSTALLMENT', 'OVERDUE', 'VOID', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('REGISTRATION', 'MONTHLY', 'COMPETITION', 'MATERIAL', 'EXTRA');--> statement-breakpoint
CREATE TYPE "public"."loss_reason" AS ENUM('PRICE', 'SCHEDULE', 'FIT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('EMAIL', 'IN_APP');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('TRANSFER', 'CASH');--> statement-breakpoint
CREATE TYPE "public"."program_category" AS ENUM('ACADEMIC', 'NON_ACADEMIC', 'CREATIVE');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('NEW', 'CONSULTING', 'NURTURING', 'CONVERTED', 'REJECTED', 'LOST');--> statement-breakpoint
CREATE TYPE "public"."registration_type" AS ENUM('CONSULTATION', 'DIRECT');--> statement-breakpoint
CREATE TYPE "public"."school_level" AS ENUM('SD', 'SMP', 'SMA');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('ACTIVE', 'PAUSED', 'GRADUATED', 'CHURNED');--> statement-breakpoint
CREATE TABLE "activity_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"payload" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"meta" jsonb,
	"ip" text,
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'ACTIVE' NOT NULL,
	"started_at" date NOT NULL,
	"ended_at" date,
	"price_monthly_snapshot" integer NOT NULL,
	CONSTRAINT "enrollments_student_program_uq" UNIQUE("student_id","program_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"actor_id" uuid,
	"status" integer NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_key_key_scope_pk" PRIMARY KEY("key","scope")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"period" text NOT NULL,
	"type" "invoice_type" NOT NULL,
	"status" "invoice_status" DEFAULT 'UNPAID' NOT NULL,
	"method" "payment_method",
	"due_date" date NOT NULL,
	"proof_key" text,
	"proof_uploaded_at" timestamp with time zone,
	"registration_id" uuid,
	"billing_run_id" uuid,
	"issued_by_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"category" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_preferences_user_id_channel_category_pk" PRIMARY KEY("user_id","channel","category")
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"entity_type" text,
	"entity_id" text,
	"action_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"gross_amount" integer NOT NULL,
	"method" "payment_method" DEFAULT 'TRANSFER' NOT NULL,
	"verified_by_id" uuid,
	"verified_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" "program_category" NOT NULL,
	"levels" text[] NOT NULL,
	"duration_months" integer DEFAULT 3 NOT NULL,
	"cadence" text,
	"price_monthly" integer NOT NULL,
	"description" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "registration_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"actor_id" uuid,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "registration_type" NOT NULL,
	"status" "registration_status" DEFAULT 'NEW' NOT NULL,
	"child_name" text NOT NULL,
	"dob" date,
	"school" text,
	"level" "school_level" NOT NULL,
	"parent_name" text,
	"parent_phone" text NOT NULL,
	"parent_email" text,
	"program_id" uuid,
	"preferred_slot" text,
	"source" text DEFAULT 'direct' NOT NULL,
	"medium" text,
	"campaign" text,
	"referrer" text,
	"landing_page" text,
	"consultation_outcome" "consultation_outcome",
	"loss_reason" "loss_reason",
	"follow_up_note" text,
	"follow_up_at" timestamp with time zone,
	"last_contacted_at" timestamp with time zone,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"converted_student_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_converted_student_id_unique" UNIQUE("converted_student_id")
);
--> statement-breakpoint
CREATE TABLE "role_actions" (
	"role_id" uuid NOT NULL,
	"action" text NOT NULL,
	CONSTRAINT "role_actions_role_id_action_pk" PRIMARY KEY("role_id","action")
);
--> statement-breakpoint
CREATE TABLE "role_pages" (
	"role_id" uuid NOT NULL,
	"href" text NOT NULL,
	CONSTRAINT "role_pages_role_id_href_pk" PRIMARY KEY("role_id","href")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"home" text NOT NULL,
	"tone" text,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"dob" date,
	"school" text,
	"level" "school_level",
	"parent_name" text,
	"parent_phone" text,
	"join_date" date NOT NULL,
	"account_status" "account_status" DEFAULT 'LIMITED' NOT NULL,
	"student_status" "student_status" DEFAULT 'ACTIVE' NOT NULL,
	"show_on_leaderboard" boolean DEFAULT false NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"registration_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "students_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"phone" text,
	"full_name" text NOT NULL,
	"display_name" text,
	"photo_url" text,
	"bio" text,
	"primary_role_id" uuid,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_contacts" ADD CONSTRAINT "registration_contacts_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_contacts" ADD CONSTRAINT "registration_contacts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_actions" ADD CONSTRAINT "role_actions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_pages" ADD CONSTRAINT "role_pages_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_primary_role_id_roles_id_fk" FOREIGN KEY ("primary_role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_entity_idx" ON "activity_event" USING btree ("entity_type","entity_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "invoices_student_status_idx" ON "invoices" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "invoices_status_due_idx" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_billing_run_idx" ON "invoices" USING btree ("billing_run_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "registration_contacts_reg_idx" ON "registration_contacts" USING btree ("registration_id","created_at");--> statement-breakpoint
CREATE INDEX "registrations_status_idx" ON "registrations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "registrations_source_idx" ON "registrations" USING btree ("source");--> statement-breakpoint
CREATE INDEX "registrations_phone_idx" ON "registrations" USING btree ("parent_phone");--> statement-breakpoint
CREATE INDEX "students_status_idx" ON "students" USING btree ("account_status","student_status");--> statement-breakpoint
CREATE INDEX "topics_program_idx" ON "topics" USING btree ("program_id","order_index");