import {
  pgTable,
  pgEnum,
  text,
  uuid,
  integer,
  timestamp,
  boolean,
  jsonb,
  real,
  date,
  time,
  smallint,
  numeric,
  primaryKey,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Schema source of truth (doc 06 v2.0). Migrations are generated from here into
 * supabase/migrations/ and applied in CI.
 *
 * Covers the identity + authorisation core and the Phase 0/1 domain: the lead
 * funnel, enrolment, billing and notifications (doc 14 task 0.1). Academic,
 * CMS and gamification tables follow in Phases 2–3, port each one WITH its RLS
 * policy and an allow/deny test, never separately (doc 15 §6.1).
 *
 * Conventions: money is integer IDR, timestamps are UTC (rendered WITA),
 * business keys are UUID, and every FK that represents ownership cascades.
 */

// ── enums ──────────────────────────────────────────────────────────────
/** LIMITED = can sign in and pay; lessons locked until first payment clears. */
export const accountStatus = pgEnum('account_status', ['LIMITED', 'ACTIVE']);

export const studentStatus = pgEnum('student_status', ['ACTIVE', 'PAUSED', 'GRADUATED', 'CHURNED']);

export const invoiceStatus = pgEnum('invoice_status', [
  /**
   * Drafted by the monthly billing run, not yet issued (doc 14 §1.6).
   *
   * Invisible to parents and unpayable. The run generates a month of invoices in
   * one go and Finance reviews them before any of it reaches a family, without
   * a draft state the only options are issuing unreviewed invoices or building a
   * second staging table that duplicates every column.
   */
  'DRAFT',
  'UNPAID',
  'AWAITING_VERIFICATION', // ← the state the v1 payment flow pivots on (doc 06 §7.4)
  'PAID',
  'PARTIALLY_PAID',
  'INSTALLMENT',
  'OVERDUE',
  'VOID',
  'REFUNDED',
]);

export const invoiceType = pgEnum('invoice_type', [
  'REGISTRATION',
  'MONTHLY',
  'COMPETITION',
  'MATERIAL',
  'EXTRA',
]);

export const paymentMethod = pgEnum('payment_method', ['TRANSFER', 'CASH']);

export const registrationStatus = pgEnum('registration_status', [
  'NEW',
  'CONSULTING',
  'NURTURING',
  'CONVERTED',
  'REJECTED',
  'LOST',
]);

export const registrationType = pgEnum('registration_type', ['CONSULTATION', 'DIRECT']);

/** Mandatory when a consultation closes, free text does not aggregate (FR-LEAD-6). */
export const consultationOutcome = pgEnum('consultation_outcome', [
  'LANJUT',
  'PIKIR_DULU',
  'TIDAK_COCOK',
]);

export const lossReason = pgEnum('loss_reason', ['PRICE', 'SCHEDULE', 'FIT', 'OTHER']);

export const schoolLevel = pgEnum('school_level', ['SD', 'SMP', 'SMA']);

/**
 * The editorial state machine, shared by every content type.
 *
 * One enum rather than a status column per type: doc 13 §9.2 makes a single
 * pipeline the central design claim, and a second enum is where the second
 * pipeline starts.
 */
export const contentStatus = pgEnum('content_status', [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
]);

export const programCategory = pgEnum('program_category', ['ACADEMIC', 'NON_ACADEMIC', 'CREATIVE']);

/**
 * Email and in-app only. WhatsApp was removed from the product on 2026-07-29
 * (doc 08 §4). There is no phone-messaging channel.
 */
export const notificationChannel = pgEnum('notification_channel', ['EMAIL', 'IN_APP']);

export const enrollmentStatus = pgEnum('enrollment_status', ['ACTIVE', 'ENDED']);

// ── scheduling (doc 06 §2.3, doc 14 §3.1) ──────────────────────────────
export const sessionType = pgEnum('session_type', ['CONSULTATION', 'LESSON', 'ASSESSMENT']);

/** doc 06 also lists RESCHEDULED; it arrives with `reschedule_requests` in §3.2. */
export const sessionStatus = pgEnum('session_status', [
  'SCHEDULED',
  'DONE',
  'CANCELLED',
  'NO_SHOW',
]);

export const attendanceStatus = pgEnum('attendance_status', ['PRESENT', 'EXCUSED', 'ABSENT']);

export const seriesStatus = pgEnum('series_status', ['ACTIVE', 'ENDED']);

// ── identity ───────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // mirrors auth.users.id
  email: text('email').unique(),
  phone: text('phone').unique(),
  fullName: text('full_name').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  bio: text('bio'),
  primaryRoleId: uuid('primary_role_id').references(() => roles.id),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Roles are DATA, not an enum (doc 12 §10.1). As an enum, custom roles could
 * not persist and grant-aware RLS policies could not be written at all.
 */
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  /**
   * This role belongs to the CUSTOMER population (guardians), not the team.
   * Customer roles never satisfy app.is_staff(), see 0011_role_is_customer.sql
   * for why that had to stop being 'holds any role at all'.
   */
  isCustomer: boolean('is_customer').notNull().default(false),
  home: text('home').notNull(),
  tone: text('tone'),
});

export const rolePages = pgTable(
  'role_pages',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    href: text('href').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.href] })],
);

export const roleActions = pgTable(
  'role_actions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.action] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

// ── observability ──────────────────────────────────────────────────────
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    meta: jsonb('meta'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_entity_idx').on(t.entity, t.entityId)],
);

export const activityEvent = pgTable(
  'activity_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    type: text('type').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    payload: jsonb('payload'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activity_entity_idx').on(t.entityType, t.entityId, t.at)],
);

// ── delivery guarantees ────────────────────────────────────────────────
/**
 * Intent to send something, written in the same breath as the state change that
 * caused it (doc 04 §7.2).
 *
 * status: PENDING → PROCESSING → SENT, or → FAILED once the attempts run out.
 * FAILED rows are kept, not deleted: an undeliverable invoice reminder is an
 * operational fact somebody has to act on, and a queue that quietly drops them
 * looks healthy while a parent never learns they owe money.
 */
export const outboxMessage = pgTable(
  'outbox_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    /** Why the last attempt failed. Without it, a FAILED row is undiagnosable. */
    lastError: text('last_error'),
    /**
     * Claim marker. Cron and QStash can both reach a message, and two workers
     * sending the same email is worse than sending it late.
     */
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('outbox_due_idx').on(t.status, t.nextAttemptAt)],
);

export const idempotencyKey = pgTable(
  'idempotency_key',
  {
    key: text('key').notNull(),
    scope: text('scope').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    status: integer('status').notNull(),
    response: jsonb('response'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.key, t.scope] })],
);

// ═══════════════════════════════════════════════════════════════════════════
//  DOMAIN. Phase 0/1: master data, lead funnel, enrolment, billing, comms
// ═══════════════════════════════════════════════════════════════════════════

// ── master data ────────────────────────────────────────────────────────
export const programs = pgTable('programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: programCategory('category').notNull(),
  /** Levels this program accepts, e.g. ['SMP','SMA']. */
  levels: text('levels').array().notNull(),
  durationMonths: integer('duration_months').notNull().default(3),
  cadence: text('cadence'),
  /** Integer IDR, never a float, never client-supplied. */
  priceMonthly: integer('price_monthly').notNull(),
  description: text('description'),

  // ── CMS (doc 14 Phase 2) ──
  /**
   * The single source of truth for visibility.
   *
   * `isPublished` below is a GENERATED column derived from this. It stays
   * because it is load-bearing, `programs_select_public` and the public
   * endpoint both read it, but nothing writes it, so the two can never
   * disagree the way two hand-maintained columns eventually do.
   */
  status: contentStatus('status').notNull().default('DRAFT'),
  /** Card copy. Distinct from `description`, which is the operational note. */
  summary: text('summary'),
  /** Long marketing body for the programme page. */
  body: text('body'),
  heroImageKey: text('hero_image_key'),
  publishAt: timestamp('publish_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  reviewedById: uuid('reviewed_by_id').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  version: integer('version').notNull().default(0),
  /** doc 13 §9.6, the column now, the translation UI much later. */
  locale: text('locale').notNull().default('id'),

  /** GENERATED ALWAYS AS (status = 'PUBLISHED'). Never write to this. */
  isPublished: boolean('is_published').generatedAlwaysAs(sql`status = 'PUBLISHED'`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const topics = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
  },
  (t) => [index('topics_program_idx').on(t.programId, t.orderIndex)],
);

// ── lead funnel ────────────────────────────────────────────────────────
/**
 * A lead, from public form submission to conversion or loss.
 *
 * Never hard-deleted: leads are CRM assets (doc 09 §3). The attribution columns
 * are what make "which channel produces paying students?" answerable at all,
 * without them marketing spend is unmeasurable (FR-LEAD-2).
 */
export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: registrationType('type').notNull(),
    status: registrationStatus('status').notNull().default('NEW'),

    // child + guardian
    childName: text('child_name').notNull(),
    dob: date('dob'),
    school: text('school'),
    level: schoolLevel('level').notNull(),
    parentName: text('parent_name'),
    /** Contact number. Staff call from /leads; there is no messaging channel. */
    parentPhone: text('parent_phone').notNull(),
    parentEmail: text('parent_email'),

    programId: uuid('program_id').references(() => programs.id),
    preferredSlot: text('preferred_slot'),

    // attribution (FR-LEAD-2)
    source: text('source').notNull().default('direct'),
    medium: text('medium'),
    campaign: text('campaign'),
    referrer: text('referrer'),
    landingPage: text('landing_page'),

    // consultation outcome, mandatory to close (FR-LEAD-6)
    consultationOutcome: consultationOutcome('consultation_outcome'),
    lossReason: lossReason('loss_reason'),
    followUpNote: text('follow_up_note'),
    followUpAt: timestamp('follow_up_at', { withTimezone: true }),
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),

    // decision audit
    reviewedById: uuid('reviewed_by_id').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    /** Set once at conversion; prevents converting the same lead twice. */
    convertedStudentId: uuid('converted_student_id').unique(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('registrations_status_idx').on(t.status, t.createdAt),
    index('registrations_source_idx').on(t.source),
    // Dedupe lookup on public submit (FR-LEAD-3).
    index('registrations_phone_idx').on(t.parentPhone),
  ],
);

/** Contact log, every attempt to reach a lead, for the follow-up queue. */
export const registrationContacts = pgTable(
  'registration_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id),
    note: text('note').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('registration_contacts_reg_idx').on(t.registrationId, t.createdAt)],
);

// ── students + enrolment ───────────────────────────────────────────────
export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * The GUARDIAN's account, and deliberately NOT unique.
     *
     * This column was UNIQUE, which silently made siblings impossible: a family
     * enrolling a second child hit a constraint violation on conversion. The
     * assumption behind it. One student, one account, is not how this business
     * works. `students.user_id` is the parent's user (doc 09: "ortu login &
     * bayar"), so one login legitimately owns several children, and forcing a
     * second account would split a family's invoices across two logins where
     * neither shows the whole picture.
     *
     * `app.owns_student()` already handles the one-to-many case, so RLS needed
     * no change, the constraint was the only thing preventing it.
     */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    dob: date('dob'),
    school: text('school'),
    level: schoolLevel('level'),
    parentName: text('parent_name'),
    parentPhone: text('parent_phone'),
    joinDate: date('join_date').notNull(),

    /** LIMITED until the registration invoice is verified (FR-ENR-4). */
    accountStatus: accountStatus('account_status').notNull().default('LIMITED'),
    studentStatus: studentStatus('student_status').notNull().default('ACTIVE'),

    /** Leaderboard privacy, default OFF (FR-SET-1). */
    showOnLeaderboard: boolean('show_on_leaderboard').notNull().default(false),

    /** Denormalised cache of sum(point_ledger.delta); recomputed by a job. */
    points: integer('points').notNull().default(0),

    /** The lead this student came from, closes the funnel→money seam. */
    registrationId: uuid('registration_id').references(() => registrations.id),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('students_status_idx').on(t.accountStatus, t.studentStatus)],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id),
    status: enrollmentStatus('status').notNull().default('ACTIVE'),
    startedAt: date('started_at').notNull(),
    endedAt: date('ended_at'),
    /**
     * Price captured at enrolment. Without it a later price change silently
     * rewrites billing history and issued invoices stop being verifiable.
     */
    priceMonthlySnapshot: integer('price_monthly_snapshot').notNull(),
  },
  (t) => [unique('enrollments_student_program_uq').on(t.studentId, t.programId)],
);

// ── billing ────────────────────────────────────────────────────────────
/**
 * One monthly invoicing run (doc 14 §1.6).
 *
 * Exists so "issue the month" is a single reviewable object rather than a
 * timestamp range somebody has to reconstruct. The cron drafts a run; Finance
 * reviews it; issuing stamps every invoice in it at once. If a run is wrong it
 * is discarded whole, which is far safer than hunting for the forty invoices
 * that came from it.
 */
export const billingRuns = pgTable(
  'billing_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Billing month as YYYY-MM, WITA. UNIQUE. One run per month, ever. */
    period: text('period').notNull().unique(),
    status: text('status').notNull().default('DRAFT'),
    /** Denormalised at draft time so the review screen needs no aggregate. */
    invoiceCount: integer('invoice_count').notNull().default(0),
    totalAmount: integer('total_amount').notNull().default(0),
    issuedById: uuid('issued_by_id').references(() => users.id),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('billing_runs_status_idx').on(t.status, t.period)],
);

/**
 * Where parents send money (FR-PAY-2).
 *
 * A table rather than an env var because Finance changes these without a
 * deploy, and because the pay page has to show them: an invoice with no
 * destination account is unpayable, which is the state the whole v1 manual
 * flow breaks on.
 *
 * Deliberately not encrypted. These are the business's own published details,
 * the same numbers that go on an invoice, not customer data.
 */
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bankName: text('bank_name').notNull(),
    accountNumber: text('account_number').notNull(),
    accountHolder: text('account_holder').notNull(),
    /** Optional branch/extra line shown under the number. */
    note: text('note'),
    /** Hidden from the pay page without losing the record. */
    isActive: boolean('is_active').notNull().default(true),
    /** Lowest first; lets Finance put the preferred account at the top. */
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bank_accounts_active_idx').on(t.isActive, t.orderIndex)],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),

    /** Integer IDR, server-authoritative, clients never send an amount. */
    amount: integer('amount').notNull(),
    period: text('period').notNull(),
    type: invoiceType('type').notNull(),
    status: invoiceStatus('status').notNull().default('UNPAID'),
    method: paymentMethod('method'),

    dueDate: date('due_date').notNull(),

    /**
     * Denda, in integer IDR (FR-PAY-6).
     *
     * STORED, not computed at render time. The deleted portal fixture worked it
     * out in the browser, which meant the parent saw one total and Finance
     * checked against another. They transfer amount + denda, the invoice says
     * amount, and verification either short-changes them or leaves a phantom
     * balance. The nightly sweep writes it so both sides read the same number.
     *
     * Total payable is always `amount + late_fee`.
     */
    lateFee: integer('late_fee').notNull().default(0),
    /** When the sweep last recomputed the fee, so a re-run mid-day is a no-op. */
    lateFeeAt: timestamp('late_fee_at', { withTimezone: true }),

    /** Storage key, not a public URL, proofs are PII (doc 04 §6.5). */
    proofKey: text('proof_key'),
    proofUploadedAt: timestamp('proof_uploaded_at', { withTimezone: true }),

    /**
     * The furthest reminder stage already sent, as a day offset from the due
     * date: -3, 0, +1, +7 (doc 14 §1.6).
     *
     * A single ordered column rather than four booleans or a join table. The job
     * sends a stage only when its offset is greater than what is recorded, so a
     * cron that fires twice, or catches up after an outage and matches several
     * stages at once, still sends each family at most one message, and the
     * newest one, not a burst of four.
     */
    lastReminderOffset: integer('last_reminder_offset'),

    /** The lead that produced this bill, when it is the registration invoice. */
    registrationId: uuid('registration_id').references(() => registrations.id),
    /** Groups one monthly billing run so it can be reviewed and issued together. */
    billingRunId: uuid('billing_run_id').references(() => billingRuns.id),

    issuedById: uuid('issued_by_id').references(() => users.id),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => [
    index('invoices_student_status_idx').on(t.studentId, t.status),
    index('invoices_status_due_idx').on(t.status, t.dueDate),
    index('invoices_billing_run_idx').on(t.billingRunId),
  ],
);

/**
 * A settlement against an invoice.
 *
 * Multiple rows per invoice = instalments; remaining is
 * invoice.amount − sum(payments) (FR-PAY-5). Finance's verification is the
 * source of truth in v1, every row records who verified it and when.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    grossAmount: integer('gross_amount').notNull(),
    method: paymentMethod('method').notNull().default('TRANSFER'),
    verifiedById: uuid('verified_by_id').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payments_invoice_idx').on(t.invoiceId)],
);

// ── notifications ──────────────────────────────────────────────────────
export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  channel: notificationChannel('channel').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * NULLABLE, deliberately.
     *
     * The first email the business ever sends goes to somebody who does not have
     * an account yet, the lead confirmation, before conversion creates a User.
     * Requiring a user id here would mean either not recording that send at all
     * (losing dedupe on the highest-volume outbound message) or provisioning an
     * account for every form submission, including bots.
     *
     * In-app notifications always have a user; email ones may only have an
     * address. The CHECK constraint in the migration enforces at least one.
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Address as sent to. Kept even when userId is set: people change email. */
    recipientEmail: text('recipient_email'),
    channel: notificationChannel('channel').notNull(),
    template: text('template').notNull(),
    payload: jsonb('payload'),
    status: text('status').notNull().default('PENDING'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** Without this, "mark as read" (FR-NTF-2) is unimplementable. */
    readAt: timestamp('read_at', { withTimezone: true }),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    actionUrl: text('action_url'),

    /**
     * `${outboxId}:${userId}:${channel}`. UNIQUE, and the reason a retried job
     * never double-sends.
     *
     * QStash delivers at-least-once and the cron sweeper can reach the same
     * message, so "send" WILL be attempted more than once. Deduping in the
     * worker with a status check is a race; a unique index is not. The insert
     * happens before the provider call, so a second attempt collides and stops
     * rather than sending a second copy.
     */
    dedupeKey: text('dedupe_key').unique(),
    /** Provider message id, for tracing a delivery complaint back to a send. */
    providerMessageId: text('provider_message_id'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannel('channel').notNull(),
    category: text('category').notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channel, t.category] })],
);

// ── content foundation (doc 13 §9, doc 14 Phase 2) ───────────────────────

/**
 * An immutable snapshot per publish, so a rollback is one click rather than a
 * database restore.
 *
 * `entityType` is text, not a foreign key: the point is that one table serves
 * programmes, articles and pages. Append-only and never joined for
 * correctness, so the missing referential integrity costs nothing.
 */
export const contentVersions = pgTable(
  'content_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    authorId: uuid('author_id').references(() => users.id),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('content_versions_entity_version_key').on(t.entityType, t.entityId, t.version),
    index('content_versions_entity_idx').on(t.entityType, t.entityId),
  ],
);

/**
 * Per-entity SEO overrides, every field optional.
 *
 * The renderer derives title, description and image from the content itself
 * and consults this only where a value is set, so an editor who never opens
 * the SEO panel still ships correct metadata (doc 13 §10.7).
 */
export const seoMeta = pgTable(
  'seo_meta',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    title: text('title'),
    description: text('description'),
    canonical: text('canonical'),
    ogImageKey: text('og_image_key'),
    noindex: boolean('noindex').notNull().default(false),
    jsonLd: jsonb('json_ld'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('seo_meta_entity_key').on(t.entityType, t.entityId)],
);

/**
 * 301s, written automatically when a published slug changes (doc 13 §10.8).
 * Without them a rename silently discards whatever ranking the URL had earned.
 */
export const redirects = pgTable('redirects', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromPath: text('from_path').notNull().unique(),
  toPath: text('to_path').notNull(),
  statusCode: integer('status_code').notNull().default(301),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── media library (doc 13 §9.7, doc 14 §2.2) ─────────────────────────────

/**
 * Tier 3 of the content model, and the tier that knows nothing about the other
 * two. No column here names an article, a page or a programme, media is a
 * shared subsystem those types consume, not a feature of any of them.
 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Path inside the bucket. Server-chosen, never client-supplied. */
    storageKey: text('storage_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    /**
     * Nullable in the column, REQUIRED before an image may be placed. The gate
     * is computed (`isReady`) rather than stored, so it cannot go stale when
     * the alt text changes.
     */
    alt: text('alt'),
    caption: text('caption'),
    title: text('title').notNull(),
    folder: text('folder'),
    focalX: real('focal_x').notNull().default(0.5),
    focalY: real('focal_y').notNull().default(0.5),
    /** Content hash, so re-uploading the same file finds the existing asset. */
    checksum: text('checksum'),
    /**
     * PENDING until the bytes are confirmed to exist. The upload goes straight
     * to storage, so a row exists before its file does, and an interrupted
     * upload would otherwise sit in the library looking perfectly fine.
     */
    status: text('status').notNull().default('PENDING'),
    uploadedById: uuid('uploaded_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete. Hard removal happens only through the purge path. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('media_assets_browse_idx').on(t.deletedAt, t.createdAt),
    index('media_assets_folder_idx').on(t.folder),
  ],
);

/**
 * What points at an asset, "can I delete this?" answered with a list rather
 * than a guess. Generic by construction: nothing here references a content
 * table, so later content types register usage without a migration.
 */
export const mediaUsage = pgTable(
  'media_usage',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    field: text('field'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.assetId, t.entityType, t.entityId, t.field] }),
    index('media_usage_entity_idx').on(t.entityType, t.entityId),
  ],
);

// ── scheduling (doc 06 §2.3, doc 13 §12.6, doc 14 §3.1) ────────────────
/**
 * A weekly teaching slot. doc 06 §7.3 specifies an `rrule`; this is a weekday
 * plus a wall-clock time instead, migration 0018 carries the reasoning, and
 * the short version is that "Rabu 16.00 dan Sabtu 10.00" is two rows, is what
 * an editor manipulates one at a time, and needs no expander.
 */
export const sessionSeries = pgTable(
  'session_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    mentorId: uuid('mentor_id')
      .notNull()
      .references(() => users.id),
    programId: uuid('program_id').references(() => programs.id),

    /** 0 = Sunday, matching Postgres `EXTRACT(DOW)` and JS `getDay()`. */
    weekday: smallint('weekday').notNull(),
    /** Local WITA wall clock. Converted to an instant only in the generator. */
    startTime: time('start_time').notNull(),
    durationMin: integer('duration_min').notNull(),

    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    status: seriesStatus('status').notNull().default('ACTIVE'),

    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('session_series_student_idx').on(t.studentId, t.status),
    index('session_series_mentor_idx').on(t.mentorId, t.status),
  ],
);

/**
 * One class instance.
 *
 * `student_id` and `program_id` are carried directly rather than through
 * `enrollments`, per doc 06: a session outlives the enrolment it was arranged
 * under, and a consultation happens before any enrolment exists.
 *
 * Two EXCLUDE constraints, a mentor and a student may each hold only one
 * SCHEDULED-or-DONE session at a time, live in migration 0018 because Drizzle
 * cannot express them. They are the actual guarantee against double-booking;
 * `GET /v1/sessions/conflicts` only reports it earlier.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seriesId: uuid('series_id').references(() => sessionSeries.id, { onDelete: 'set null' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    mentorId: uuid('mentor_id')
      .notNull()
      .references(() => users.id),
    programId: uuid('program_id').references(() => programs.id),

    type: sessionType('type').notNull().default('LESSON'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: sessionStatus('status').notNull().default('SCHEDULED'),

    gcalEventId: text('gcal_event_id'),
    meetUrl: text('meet_url'),
    note: text('note'),
    /** Required by the API when cancelling, a cancellation with no reason is a mystery. */
    cancelReason: text('cancel_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_student_idx').on(t.studentId, t.startsAt),
    index('sessions_mentor_idx').on(t.mentorId, t.startsAt),
    index('sessions_status_idx').on(t.status, t.startsAt),
    index('sessions_series_idx').on(t.seriesId, t.startsAt),
  ],
);

/**
 * 1:1 with a session, the session id IS the primary key, so "marked twice" is
 * not representable. Its own table rather than columns on `sessions` because a
 * different person writes it at a different time under a different permission:
 * a Secretary schedules, a Mentor marks.
 */
export const sessionAttendance = pgTable('session_attendance', {
  sessionId: uuid('session_id')
    .primaryKey()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  status: attendanceStatus('status').notNull(),
  note: text('note'),
  markedById: uuid('marked_by_id').references(() => users.id),
  markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * When a mentor is willing to teach. Drives a SOFT warning only: overlapping
 * sessions are an error the database refuses, while teaching outside a declared
 * window is a preference a Secretary may knowingly override.
 */
export const mentorAvailability = pgTable(
  'mentor_availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mentorId: uuid('mentor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [
    unique('mentor_availability_uq').on(t.mentorId, t.weekday, t.startTime),
    index('mentor_availability_idx').on(t.mentorId, t.weekday),
  ],
);

// ── learning materials (doc 06 §2.3, doc 13 §12.7, doc 14 §3.3) ────────
export const materialKind = pgEnum('material_kind', ['YOUTUBE', 'PDF', 'GDRIVE']);

export const materialProgressStatus = pgEnum('material_progress_status', [
  'NOT_STARTED',
  'IN_PROGRESS',
  'DONE',
]);

/**
 * A study module.
 *
 * `status` reuses `content_status`, the vocabulary, not the CMS pipeline.
 * Migration 0022 carries the reasoning: a material has no public URL, is read
 * by entitlement, and is authored by MENTOR, who holds no content verb. Only
 * DRAFT, PUBLISHED and ARCHIVED are reachable through the API.
 */
export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    orderIndex: integer('order_index').notNull().default(0),
    status: contentStatus('status').notNull().default('DRAFT'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('materials_status_idx').on(t.status, t.orderIndex),
    index('materials_topic_idx').on(t.topicId, t.orderIndex),
  ],
);

/** doc 06: only a YouTube video, a PDF, or a Drive link. No self-hosted video. */
export const materialResources = pgTable(
  'material_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    kind: materialKind('kind').notNull(),
    title: text('title').notNull(),
    /** YouTube video id · PDF url · Drive share link. Validated per kind by Zod. */
    url: text('url').notNull(),
    durationMin: integer('duration_min'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('material_resources_idx').on(t.materialId, t.orderIndex)],
);

/**
 * ENTITLEMENT, who may SEE a module (doc 06, added by doc 11 §8.1).
 *
 * Exactly one of student / programme / level, enforced by a `num_nonnulls`
 * CHECK in migration 0022 that Drizzle cannot express. A programme-scoped row
 * reaches students through `enrollments`, which is why this is not a table of
 * (student, material) pairs.
 */
export const materialAssignments = pgTable(
  'material_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
    level: schoolLevel('level'),
    assignedById: uuid('assigned_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('material_assignments_material_idx').on(t.materialId),
    index('material_assignments_student_idx').on(t.studentId),
    index('material_assignments_program_idx').on(t.programId),
    index('material_assignments_level_idx').on(t.level),
  ],
);

/** CONSUMPTION, what one student DID with a module. Written by the family only. */
export const materialProgress = pgTable(
  'material_progress',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    status: materialProgressStatus('status').notNull().default('NOT_STARTED'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.materialId] }),
    index('material_progress_material_idx').on(t.materialId, t.status),
  ],
);

// ── competitions (doc 06 §7.3, doc 13 §12.8, doc 14 §3.4) ──────────────
export const competitionLevel = pgEnum('competition_level', [
  'SCHOOL',
  'REGIONAL',
  'PROVINCIAL',
  'NATIONAL',
  'INTERNATIONAL',
]);
export const competitionFormat = pgEnum('competition_format', ['INDIVIDUAL', 'TEAM', 'BOTH']);
export const competitionMode = pgEnum('competition_mode', ['ONLINE', 'OFFLINE', 'HYBRID']);
export const competitionResult = pgEnum('competition_result', [
  'PENDING',
  'WINNER',
  'FINALIST',
  'PARTICIPANT',
  'WITHDRAWN',
]);
export const teamRole = pgEnum('team_role', ['LEADER', 'MEMBER']);

/**
 * THE competition, catalogue and marketing copy on one row.
 *
 * doc 13 §12.8 asks for "**one** source feeding portal Info Lomba and the public
 * marketing calendar", and §9.4 describes /site/competitions as a collection
 * that "mirrors /competitions". A mirror is two sources, which is the defect;
 * the copy lives here, and this row is registered in the CMS pipeline.
 *
 * The fixture's `status` ('Ongoing' | 'Coming Soon' | 'Closed') is deliberately
 * NOT a column, see `app.competition_phase()` in migration 0023.
 */
export const competitions = pgTable(
  'competitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),

    summary: text('summary'),
    description: text('description'),
    coverId: uuid('cover_id').references(() => mediaAssets.id, { onDelete: 'set null' }),

    organizer: text('organizer'),
    venue: text('venue'),
    level: competitionLevel('level').notNull().default('NATIONAL'),
    format: competitionFormat('format').notNull().default('INDIVIDUAL'),
    mode: competitionMode('mode').notNull().default('OFFLINE'),
    /** The organiser's subject vocabulary, "Science Project", "Invention". */
    categories: text('categories').array().notNull().default([]),
    /**
     * Which school levels may enter. `text[]`, like `programs.levels`, and for
     * a reason: the CMS pipeline's generic patch binds every array through
     * `textArray()`, so an enum array would need a per-type cast the pipeline
     * does not have. `competitions_levels_valid` in migration 0023 recovers
     * what the enum would have enforced.
     */
    levels: text('levels').array().notNull().default([]),

    /** Integer IDR. `feeNote` carries tiered fees an integer cannot express. */
    registrationFee: integer('registration_fee'),
    feeNote: text('fee_note'),
    registrationUrl: text('registration_url'),
    guidebookUrl: text('guidebook_url'),

    registrationOpensAt: timestamp('registration_opens_at', { withTimezone: true }),
    registrationDeadline: timestamp('registration_deadline', { withTimezone: true }).notNull(),
    eventStart: date('event_start'),
    eventEnd: date('event_end'),

    // ── CMS pipeline contract ──
    status: contentStatus('status').notNull().default('DRAFT'),
    publishAt: timestamp('publish_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    reviewedById: uuid('reviewed_by_id').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    locale: text('locale').notNull().default('id'),

    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('competitions_deadline_idx').on(t.registrationDeadline),
    index('competitions_status_idx').on(t.status, t.registrationDeadline),
  ],
);

/**
 * One student entered in one competition (doc 06 COMPETITION_TARGET).
 *
 * `readinessPct` is the number `/schedule`'s sidebar printed from a fixture
 * since the beginning; that fixture's own comment admitted "there are no
 * competition targets, so nothing computes it". This is the table that does.
 */
export const competitionTargets = pgTable(
  'competition_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),

    readinessPct: integer('readiness_pct').notNull().default(0),
    result: competitionResult('result').notNull().default('PENDING'),
    /** "Juara 2", "Medali Perunggu", the organiser's words, not ours. */
    award: text('award'),
    score: integer('score'),
    certificateId: uuid('certificate_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    note: text('note'),

    addedById: uuid('added_by_id').references(() => users.id),
    /** Who recorded the RESULT. Distinct from who entered the student. */
    recordedById: uuid('recorded_by_id').references(() => users.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('competition_targets_student_uq').on(t.studentId, t.competitionId),
    index('competition_targets_competition_idx').on(t.competitionId, t.result),
    index('competition_targets_student_idx').on(t.studentId),
  ],
);

/**
 * doc 13 §12.8: "no team UI despite Team/TeamMember existing". They existed in
 * doc 06 only. The redundant UNIQUE (id, competitionId) is the target of the
 * composite FK in `teamMembers`, which is what makes "a team's members are
 * entered in that team's competition" structural rather than merely checked.
 */
export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** The mentor coaching this team. Optional, teams form before coaching does. */
    mentorId: uuid('mentor_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('teams_competition_name_uq').on(t.competitionId, t.name),
    unique('teams_id_competition_uq').on(t.id, t.competitionId),
    index('teams_competition_idx').on(t.competitionId),
    index('teams_mentor_idx').on(t.mentorId),
  ],
);

/**
 * Membership.
 *
 * The invariants that matter, two composite foreign keys, one team per student
 * per competition, one leader per team, are in migration 0023, because Drizzle
 * expresses neither a composite FK nor a partial unique index. This declaration
 * is the SHAPE only; do not read the constraints off it.
 */
export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id').notNull(),
    competitionId: uuid('competition_id').notNull(),
    studentId: uuid('student_id').notNull(),
    role: teamRole('role').notNull().default('MEMBER'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.studentId] }),
    index('team_members_student_idx').on(t.studentId),
  ],
);

// ── assessments (doc 06 §2.5, doc 13 §12.9, doc 14 §3.5) ───────────────
/** The four criteria of FR-ASN-3, closed. A fifth is a migration. */
export const assessmentCriterion = pgEnum('assessment_criterion', [
  'UNDERSTANDING',
  'PARTICIPATION',
  'DISCIPLINE',
  'READINESS',
]);
export const assessmentCategory = pgEnum('assessment_category', [
  'SANGAT_BAIK',
  'BAIK',
  'CUKUP',
  'PERLU_PERHATIAN',
]);
export const assessmentReactionKind = pgEnum('assessment_reaction_kind', [
  'HELPFUL',
  'MOTIVATING',
  'THANKS',
]);

/**
 * One mentor's structured monthly evaluation (doc 06 §2.5).
 *
 * `UNIQUE (studentId, period)` is FR-ASN-1's coverage matrix as a constraint:
 * the queue is *student × period*, so a second assessment for the same month is
 * not a new record. It is the same one.
 *
 * `avgScore` is `numeric(3,1)` and not the `int` doc 06 shows. doc 03 FR-ASV-0
 * exists to settle exactly that: "one scale, /10, one decimal, star rating".
 * Neither it nor `category` is client-writable; migration 0025's trigger
 * recomputes both from `assessment_criteria`.
 */
export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** The author, pinned to the caller by `assessments_insert`'s WITH CHECK. */
    mentorId: uuid('mentor_id')
      .notNull()
      .references(() => users.id),

    /** `YYYY-MM`, WITA, the same shape `billing_runs.period` uses. */
    period: text('period').notNull(),
    /** DERIVED. Never write this from a service; the trigger owns it. */
    avgScore: numeric('avg_score', { precision: 3, scale: 1 }).notNull().default('0'),
    /** DERIVED, same trigger. */
    category: assessmentCategory('category').notNull().default('PERLU_PERHATIAN'),
    note: text('note'),
    /**
     * FR-ASV-5. Stored, not derived: `point_ledger` does not exist,
     * gamification is its own module, and `students.points` is deliberately
     * left alone because its own comment defines it as that ledger's sum.
     */
    pointsAwarded: integer('points_awarded').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('assessments_student_period_uq').on(t.studentId, t.period),
    index('assessments_student_idx').on(t.studentId, t.period),
    index('assessments_period_idx').on(t.period, t.createdAt),
    index('assessments_mentor_idx').on(t.mentorId, t.createdAt),
  ],
);

/** One score per criterion per assessment, the composite PK is that invariant. */
export const assessmentCriteria = pgTable(
  'assessment_criteria',
  {
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    criterion: assessmentCriterion('criterion').notNull(),
    score: integer('score').notNull(),
  },
  (t) => [primaryKey({ columns: [t.assessmentId, t.criterion] })],
);

/**
 * FR-ASN-2's soft lock: any mentor may claim an un-assessed student for 24h.
 *
 * Keyed on the same `(studentId, period)` slot the assessment is unique on,
 * because they lock the same cell of the coverage matrix. Expiry is a column
 * rather than a partial index, "unexpired" is a fact about now().
 */
export const assessmentClaims = pgTable(
  'assessment_claims',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    mentorId: uuid('mentor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.period] }),
    index('assessment_claims_mentor_idx').on(t.mentorId, t.expiresAt),
  ],
);

/** FR-ASV-4. One reaction per assessment, written by the family, read by staff. */
export const assessmentReactions = pgTable('assessment_reactions', {
  assessmentId: uuid('assessment_id')
    .primaryKey()
    .references(() => assessments.id, { onDelete: 'cascade' }),
  reaction: assessmentReactionKind('reaction').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── progress (doc 06 §2.4, doc 03 FR-UPD-1/2, doc 14 §3.6) ─────────────
/**
 * Student ↔ topic percent. CURRENT STATE, not history.
 *
 * doc 06 §2.4 is explicit: "Progress, student ↔ topic percent. Unique
 * `(studentId, topicId)`. `updatedById` = mentor." So the row is upserted and
 * `updatedAt` is the fact the whole staleness board is built on.
 *
 * No `note` column: the mentor's qualitative note already lives on
 * `assessments.note` (FR-ASN-4), and a second one here would be the same fact
 * with two edit paths. The staleness rule itself is `app.progress_status()` in
 * migration 0026. One definition, in the database, so the board, the detail
 * page, the portal and the tests cannot drift apart.
 */
export const progress = pgTable(
  'progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    percent: integer('percent').notNull().default(0),
    /** Who last moved the slider. Pinned to the caller by `progress_insert`. */
    updatedById: uuid('updated_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('progress_student_topic_uq').on(t.studentId, t.topicId),
    index('progress_student_idx').on(t.studentId, t.updatedAt),
    index('progress_topic_idx').on(t.topicId),
    index('progress_updated_idx').on(t.updatedAt),
  ],
);
