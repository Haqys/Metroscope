import { getAccessToken } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Server-side calls to api.metroscope.id.
 *
 * SERVER components only. It reads the HttpOnly cookie. Client components go
 * through `/api/bff/*` on this origin so no token reaches browser JavaScript
 * (doc 04 §0.4).
 *
 * Everything here is scoped by RLS to the signed-in family: `app.owns_student()`
 * decides what a guardian sees, so this client needs no filtering of its own and
 * must not add any, a filter here would be a second, weaker copy of the rule.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch(`${env.API_URL}/v1${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { code: string; message: string };
  } | null;

  if (!res.ok) {
    const code = body?.error?.code ?? 'REQUEST_FAILED';
    logger.warn('api_request_failed', { path, status: res.status, code });
    throw new ApiError(res.status, code, body?.error?.message ?? 'Permintaan gagal.');
  }

  return body?.data as T;
}

export type InvoiceStatus =
  /** Drafted by the billing run; RLS hides these from guardians. */
  | 'DRAFT'
  | 'UNPAID'
  | 'AWAITING_VERIFICATION'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'INSTALLMENT'
  | 'OVERDUE'
  | 'VOID'
  | 'REFUNDED';

export interface Invoice {
  id: string;
  number: string;
  studentId: string;
  studentName: string;
  amount: number;
  /** Sum of VERIFIED payments. Drives the remaining balance on an instalment. */
  paidAmount: number;
  period: string;
  type: string;
  status: InvoiceStatus;
  dueDate: string;
  proofKey: string | null;
  proofUploadedAt: string | null;
  issuedAt: string;
  paidAt: string | null;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note: string | null;
  isActive: boolean;
  orderIndex: number;
}

export function listInvoices(params: { status?: InvoiceStatus; limit?: number } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: Invoice[]; nextCursor: string | null }>(
    `/invoices${qs.size ? `?${qs}` : ''}`,
  );
}

export function getInvoice(id: string) {
  return request<Invoice>(`/invoices/${id}`);
}

/** Active destination accounts. RLS hides deactivated ones from guardians. */
export function listBankAccounts() {
  return request<BankAccount[]>('/settings/bank-accounts');
}

// ── scheduling (doc 14 §3.1) ─────────────────────────────────────────────

export type SessionStatus =
  | 'SCHEDULED'
  | 'DONE'
  | 'CANCELLED'
  | 'NO_SHOW'
  /** Moved by an approved reschedule request; `newSessionId` holds the replacement. */
  | 'RESCHEDULED';
export type SessionKind = 'CONSULTATION' | 'LESSON' | 'ASSESSMENT';
export type AttendanceStatus = 'PRESENT' | 'EXCUSED' | 'ABSENT';

export type CalendarSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED' | 'DISABLED';

export interface SessionRow {
  id: string;
  seriesId: string | null;
  studentId: string;
  mentorId: string;
  programId: string | null;
  type: SessionKind;
  status: SessionStatus;
  startsAt: string;
  endsAt: string;
  meetUrl: string | null;
  note: string | null;
  cancelReason: string | null;
  studentName: string;
  studentSlug: string;
  mentorName: string | null;
  programName: string | null;
  attendanceStatus: AttendanceStatus | null;
  attendanceNote: string | null;
  attendanceMarkedAt: string | null;
  /**
   * Sync state of the shared business calendar event (doc 07 §6), and the
   * one-click link for the family's OWN calendar. The two are different
   * things and the UI must not present them as one: the first is already
   * done for them, the second puts it in their personal calendar.
   */
  calendarSyncStatus: CalendarSyncStatus | null;
  calendarSyncedAt: string | null;
  addToCalendarUrl: string;
}

/**
 * The family's timetable.
 *
 * Scoped entirely by `app.owns_student()`, a guardian passes no student id and
 * gets their own children, including siblings, which is exactly what the page
 * should show. Adding a filter here would be a second, weaker copy of the rule.
 */
export function listSessions(
  params: {
    from?: string;
    to?: string;
    status?: SessionStatus;
    includeCancelled?: boolean;
    limit?: number;
  } = {},
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: SessionRow[] }>(`/sessions${qs.size ? `?${qs}` : ''}`);
}

// ── reschedule requests (doc 14 §3.2) ────────────────────────────────────

export type RescheduleStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

export interface RescheduleRequest {
  id: string;
  sessionId: string;
  status: RescheduleStatus;
  reason: string;
  note: string | null;
  preferredStartsAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  newSessionId: string | null;
  createdAt: string;
  sessionStartsAt: string;
  sessionEndsAt: string;
  sessionStatus: string;
  studentName: string;
  studentSlug: string;
  mentorName: string | null;
  newStartsAt: string | null;
}

/**
 * The family's own requests. Scoped by `reschedule_requests_select`, which
 * reaches through the session to `app.owns_student()`, so this returns their
 * children's requests and nobody else's, with no filter on this side.
 */
export function listRescheduleRequests(limit = 50) {
  return request<{ items: RescheduleRequest[] }>(`/reschedule-requests?limit=${limit}`);
}

// ── learning materials (doc 14 §3.3) ─────────────────────────────────────

export type MaterialKind = 'YOUTUBE' | 'PDF' | 'GDRIVE';
export type MaterialStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type MaterialProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';

export interface MaterialResource {
  id: string;
  kind: MaterialKind;
  title: string;
  url: string;
  durationMin: number | null;
  orderIndex: number;
}

export interface MaterialRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  orderIndex: number;
  status: MaterialStatus;
  publishedAt: string | null;
  topicId: string | null;
  topicName: string | null;
  createdAt: string;
  updatedAt: string;
  resourceCount: number;
  assignmentCount: number;
  progressStatus: MaterialProgressStatus | null;
  openedAt: string | null;
  completedAt: string | null;
}

export interface MaterialDetail extends MaterialRow {
  resources: MaterialResource[];
}

/**
 * The modules this child may study.
 *
 * `studentId` is required for the progress join to mean anything, a family
 * with two children has two answers, and merging them would show one child's
 * "Selesai" against the other's module. RLS still decides what comes back:
 * PUBLISHED and entitled, nothing else.
 */
export function listMaterials(studentId: string) {
  return request<{ items: MaterialRow[] }>(`/materials?studentId=${studentId}`);
}

export function getMaterial(slug: string, studentId: string) {
  return request<MaterialDetail>(`/materials/${slug}?studentId=${studentId}`);
}

export interface StudentOption {
  id: string;
  name: string;
  slug: string;
  level: 'SD' | 'SMP' | 'SMA' | null;
  accountStatus: 'LIMITED' | 'ACTIVE';
}

/**
 * The caller's OWN children. Every page in this app means this by "students".
 *
 * It used to call `GET /v1/students`, on the reasoning that
 * `students_select` scopes the list by ownership. It does not, quite:
 * the policy is `user_id = app.current_user_id() OR app.has_page('/students')`,
 * and the second clause is held by every staff role. So a mentor opening the
 * portal got all 43 children, and each page took `students[0]`, which is how
 * the summary came to greet a mentor with "Ringkasan Ajuba Yasser Barahakim
 * Harahap", a real student, correctly fetched, and none of their business.
 *
 * `/v1/me/profile` asks the narrower question, `s.user_id = me`, so a staff
 * account gets an empty list and the pages render their own "no student" state.
 * `/v1/students` is still the right endpoint for the surfaces that DO list
 * other people's children; this app is not one of them.
 */
export async function listStudents(): Promise<{ items: StudentOption[] }> {
  const profile = await getMyProfile();
  return {
    items: profile.students.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      level: s.level,
      accountStatus: s.accountStatus,
    })),
  };
}

// ── competitions (doc 14 §3.4) ───────────────────────────────────────────

export type CompetitionLevel = 'SCHOOL' | 'REGIONAL' | 'PROVINCIAL' | 'NATIONAL' | 'INTERNATIONAL';
export type CompetitionFormat = 'INDIVIDUAL' | 'TEAM' | 'BOTH';
export type CompetitionMode = 'ONLINE' | 'OFFLINE' | 'HYBRID';
export type CompetitionResult = 'PENDING' | 'WINNER' | 'FINALIST' | 'PARTICIPANT' | 'WITHDRAWN';
export type CompetitionPhase = 'OPEN' | 'UPCOMING' | 'CLOSED';

/**
 * The SAME row the internal database and the public marketing calendar read.
 *
 * doc 13 §P7 priced the alternative: "adding a lomba in the admin changes
 * nothing for students". `components/portal/competition-data.ts`, three
 * hardcoded lomba that no admin screen could reach, is deleted.
 */
export interface CompetitionRow {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  organizer: string | null;
  venue: string | null;
  level: CompetitionLevel;
  format: CompetitionFormat;
  mode: CompetitionMode;
  categories: string[];
  levels: ('SD' | 'SMP' | 'SMA')[];
  registrationFee: number | null;
  feeNote: string | null;
  registrationUrl: string | null;
  guidebookUrl: string | null;
  registrationOpensAt: string | null;
  registrationDeadline: string;
  eventStart: string | null;
  eventEnd: string | null;
  status: string;
  phase: CompetitionPhase;
  targetCount: number;
  avgReadiness: number | null;
  winnerCount: number;
  teamCount: number;
  /** Present only when `studentId` was passed. This child's own entry. */
  myTargetId: string | null;
  myReadiness: number | null;
  myResult: CompetitionResult | null;
  myAward: string | null;
}

/**
 * `studentId` narrows to one child's entries, the "Lomba Saya" tab.
 *
 * Not a security boundary. `competition_targets_select` already decides which
 * targets exist for this caller, so passing somebody else's id returns an empty
 * list rather than somebody else's children.
 */
export function listCompetitions(
  params: { studentId?: string; phase?: CompetitionPhase; schoolLevel?: string } = {},
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: CompetitionRow[] }>(`/competitions${qs.size ? `?${qs}` : ''}`);
}

// ── assessments (doc 14 §3.5) ────────────────────────────────────────────

export type AssessmentCategory = 'SANGAT_BAIK' | 'BAIK' | 'CUKUP' | 'PERLU_PERHATIAN';
export type CriterionKey = 'UNDERSTANDING' | 'PARTICIPATION' | 'DISCIPLINE' | 'READINESS';
export type AssessmentReaction = 'HELPFUL' | 'MOTIVATING' | 'THANKS';

/** One row of the coverage matrix: a student × a period (FR-ASN-1). */
export interface CoverageRow {
  studentId: string;
  studentName: string;
  studentSlug: string;
  level: 'SD' | 'SMP' | 'SMA' | null;
  accountStatus: 'LIMITED' | 'ACTIVE';
  programNames: string;
  status: 'PENDING' | 'DONE';
  /** Present only when this period is DONE. */
  assessmentId: string | null;
  avgScore: number | null;
  category: AssessmentCategory | null;
  assessedAt: string | null;
  assessorName: string | null;
  /** The most recent period with an assessment, at or before this one. */
  lastPeriod: string | null;
  /** 0 when assessed this period, null when never assessed at all. */
  monthsSinceLastAssessment: number | null;
  claimedById: string | null;
  claimedByName: string | null;
  claimExpiresAt: string | null;
}

export interface CoverageSummary {
  total: number;
  done: number;
  pending: number;
  /** null on an empty roll, 100% of nothing would be a lie. */
  coveragePct: number | null;
}

export interface AssessmentRecord {
  id: string;
  period: string;
  avgScore: number;
  category: AssessmentCategory;
  note: string | null;
  pointsAwarded: number;
  mentorId: string;
  assessorName: string | null;
  createdAt: string;
  updatedAt: string;
  reaction: AssessmentReaction | null;
  scores: Partial<Record<CriterionKey, number>>;
}

export interface StudentAssessments {
  student: {
    id: string;
    name: string;
    slug: string;
    level: 'SD' | 'SMP' | 'SMA' | null;
    accountStatus: 'LIMITED' | 'ACTIVE';
    studentStatus: string;
    programNames: string;
  };
  period: string;
  /** The assessment for `period`, if it exists. */
  current: AssessmentRecord | null;
  /** The most recent one BEFORE it, context beside the form. */
  previous: AssessmentRecord | null;
  items: AssessmentRecord[];
  claim: { claimedById: string; claimedByName: string | null; claimExpiresAt: string } | null;
}

export function listCoverage(
  params: { period?: string; status?: 'all' | 'pending' | 'done'; q?: string } = {},
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ period: string; items: CoverageRow[]; summary: CoverageSummary }>(
    `/assessments${qs.size ? `?${qs}` : ''}`,
  );
}

/** Accepts an id or a slug, the mentor's route is `/assessments/[slug]`. */
export function getStudentAssessments(idOrSlug: string, period?: string) {
  const qs = period ? `?period=${period}` : '';
  return request<StudentAssessments>(`/students/${idOrSlug}/assessments${qs}`);
}

// ── progress (doc 03 FR-UPD-1/2, doc 14 §3.6) ────────────────────────────

/** FR-UPD-1's three states. Derived by `app.progress_status()`, never by the UI. */
export type ProgressStatus = 'NEVER' | 'STALE' | 'CURRENT';

export interface ProgressBoardRow {
  studentId: string;
  studentName: string;
  studentSlug: string;
  level: 'SD' | 'SMP' | 'SMA' | null;
  accountStatus: 'LIMITED' | 'ACTIVE';
  programNames: string;
  status: ProgressStatus;
  /** null when never updated, the database returns no day count for no row. */
  lastUpdatedAt: string | null;
  daysSinceUpdate: number | null;
  lastUpdatedBy: string | null;
  overallPercent: number | null;
  topicsTracked: number;
  topicsAvailable: number;
}

export interface ProgressSummary {
  total: number;
  never: number;
  stale: number;
  current: number;
}

export interface ProgressTopic {
  topicId: string;
  topicName: string;
  orderIndex: number;
  programName: string;
  /** null means "not yet recorded", which is not the same as 0. */
  percent: number | null;
  updatedAt: string | null;
}

export interface StudentProgress {
  student: {
    id: string;
    name: string;
    slug: string;
    level: 'SD' | 'SMP' | 'SMA' | null;
    accountStatus: 'LIMITED' | 'ACTIVE';
    studentStatus: string;
    programNames: string;
  };
  /** From `app.progress_stale_days()`, the UI states the rule, never sets it. */
  staleAfterDays: number;
  state: {
    lastUpdatedAt: string | null;
    status: ProgressStatus;
    daysSinceUpdate: number | null;
    overallPercent: number | null;
    lastUpdatedBy: string | null;
  } | null;
  topics: ProgressTopic[];
  /** The latest assessment note, progress has no note of its own on purpose. */
  mentorNote: { note: string; period: string; author: string | null } | null;
}

export function listProgressBoard(
  params: { status?: 'all' | 'never' | 'stale' | 'current'; q?: string } = {},
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{
    staleAfterDays: number;
    items: ProgressBoardRow[];
    summary: ProgressSummary;
  }>(`/progress${qs.size ? `?${qs}` : ''}`);
}

/** Accepts an id or a slug, the route is `/progress/[studentId]` by slug. */
export function getStudentProgress(idOrSlug: string) {
  return request<StudentProgress>(`/students/${idOrSlug}/progress`);
}

// ── the caller's own account (doc 14 §3.9) ───────────────────────────────

export interface MyStudent {
  id: string;
  name: string;
  slug: string;
  level: 'SD' | 'SMP' | 'SMA' | null;
  accountStatus: 'LIMITED' | 'ACTIVE';
  points: number;
  showOnLeaderboard: boolean;
  school: string | null;
  dob: string | null;
  joinDate: string;
  parentName: string | null;
  parentPhone: string | null;
  /** Comma-joined ACTIVE enrolments. Null when the family has none yet. */
  programNames: string | null;
}

export interface NotificationPreference {
  channel: 'EMAIL' | 'IN_APP';
  category: string;
  enabled: boolean;
}

export interface MyProfile {
  id: string;
  email: string | null;
  fullName: string;
  displayName: string | null;
  phone: string | null;
  photoUrl: string | null;
  bio: string | null;
  status: string;
  primaryRole: string | null;
  preferences: NotificationPreference[];
  /** Empty for staff. Roles are a staff concept; guardians have children. */
  students: MyStudent[];
}

export function getMyProfile() {
  return request<MyProfile>('/me/profile');
}

export interface LeaderboardEntry {
  rank: number;
  points: number;
  isYou: boolean;
  /** "Siswa lain" when that family has not opted in (FR-SET-1). */
  name: string;
}

export interface Badge {
  code: string;
  label: string;
  earned: boolean;
}

export interface Achievements {
  /** Null for an account with no student: staff, or a lead not yet converted. */
  student: { id: string; name: string; level: string | null; points: number } | null;
  rank: number | null;
  total: number;
  leaderboard: LeaderboardEntry[];
  badges: Badge[];
  counts?: { entries?: number; wins?: number; attended?: number; assessments?: number };
}

/** `student` is optional: a guardian with one child needs no argument. */
export function getAchievements(student?: string) {
  return request<Achievements>(`/me/achievements${student ? `?student=${student}` : ''}`);
}

export interface NotificationItem {
  id: string;
  template: string;
  channel: 'EMAIL' | 'IN_APP';
  status: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
  subject: string | null;
  /** The rendered subject when there is one, a template label otherwise. */
  title: string;
  category: string;
  /** A portal-relative route, derived server-side from the template. */
  href: string;
}

export function listNotifications(params: { limit?: number; unreadOnly?: boolean } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: NotificationItem[]; unread: number }>(
    `/me/notifications${qs.size ? `?${qs}` : ''}`,
  );
}
