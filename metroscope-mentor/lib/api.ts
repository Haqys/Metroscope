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
 * The mentor app had NO api client at all until §3.1: every page here was
 * rendering a fixture, so there was nothing to call. This is the first.
 *
 * Nothing here filters. `95_scheduling.sql` gives a mentor their own sessions
 * whether or not they hold `/schedule`, and a filter on this side would be a
 * second, weaker copy of that rule.
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

export interface SessionQuery {
  from?: string;
  /** §3.6, the student profile asks for one child's sessions. */
  studentId?: string;
  to?: string;
  scope?: 'all' | 'mine';
  status?: SessionStatus;
  includeCancelled?: boolean;
  limit?: number;
}

export function listSessions(params: SessionQuery = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: SessionRow[] }>(`/sessions${qs.size ? `?${qs}` : ''}`);
}

export interface AvailabilitySlot {
  id: string;
  mentorId: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export function getAvailability() {
  return request<{ mentorId: string; items: AvailabilitySlot[] }>('/availability');
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
}

export interface MaterialDetail extends MaterialRow {
  resources: MaterialResource[];
}

export interface StudentOption {
  id: string;
  name: string;
  slug: string;
  level: 'SD' | 'SMP' | 'SMA' | null;
  accountStatus: 'LIMITED' | 'ACTIVE';
  studentStatus: string;
}

export function listMaterials() {
  return request<{ items: MaterialRow[] }>('/materials');
}

export function listStudents() {
  return request<{ items: StudentOption[] }>('/students');
}

/** Published programmes, for the assignment picker. See the internal app's note. */
export function listProgramOptions() {
  return request<{ items: { id: string; slug: string; name: string; levels: string[] }[] }>(
    '/public/programs',
  );
}

export interface MaterialEngagementRow {
  studentId: string;
  studentName: string;
  level: string | null;
  status: MaterialProgressStatus;
  openedAt: string | null;
  completedAt: string | null;
}

export function materialEngagement(id: string) {
  return request<{
    items: MaterialEngagementRow[];
    counts: Record<MaterialProgressStatus, number>;
    entitled: number;
  }>(`/materials/${id}/engagement`);
}

// ── competitions (doc 14 §3.4) ───────────────────────────────────────────

export type CompetitionLevel = 'SCHOOL' | 'REGIONAL' | 'PROVINCIAL' | 'NATIONAL' | 'INTERNATIONAL';
export type CompetitionFormat = 'INDIVIDUAL' | 'TEAM' | 'BOTH';
export type CompetitionMode = 'ONLINE' | 'OFFLINE' | 'HYBRID';
export type CompetitionResult = 'PENDING' | 'WINNER' | 'FINALIST' | 'PARTICIPANT' | 'WITHDRAWN';
/** Derived from the clock by `app.competition_phase`, never stored. */
export type CompetitionPhase = 'OPEN' | 'UPCOMING' | 'CLOSED';

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
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  coverId: string | null;
  phase: CompetitionPhase;
  targetCount: number;
  /** NULL when nobody is entered, distinct from "everybody is at zero". */
  avgReadiness: number | null;
  winnerCount: number;
  teamCount: number;
  /** Present only when  was passed. This child's own entry (§3.4). */
  myTargetId: string | null;
  myReadiness: number | null;
  myResult: CompetitionResult | null;
  myAward: string | null;
}

export interface CompetitionParticipant {
  id: string;
  studentId: string;
  studentName: string;
  studentSlug: string;
  level: 'SD' | 'SMP' | 'SMA' | null;
  readinessPct: number;
  result: CompetitionResult;
  award: string | null;
  score: number | null;
  note: string | null;
  recordedAt: string | null;
  teamId: string | null;
  teamName: string | null;
  teamRole: 'LEADER' | 'MEMBER' | null;
}

export interface CompetitionTeam {
  id: string;
  name: string;
  note: string | null;
  mentorId: string | null;
  mentorName: string | null;
  members: { studentId: string; studentName: string; role: 'LEADER' | 'MEMBER' }[];
}

export interface ReadinessDistribution {
  b0: number;
  b25: number;
  b50: number;
  b75: number;
}

export interface CompetitionDetail {
  competition: CompetitionRow & { createdAt: string; updatedAt: string; version: number };
  participants: CompetitionParticipant[];
  teams: CompetitionTeam[];
  distribution: ReadinessDistribution;
}

export function listCompetitions(
  params: { q?: string; phase?: CompetitionPhase; schoolLevel?: string; studentId?: string } = {},
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: CompetitionRow[] }>(`/competitions${qs.size ? `?${qs}` : ''}`);
}

/** Accepts an id or a slug, the internal detail route is `/competitions/[slug]`. */
export function getCompetition(idOrSlug: string) {
  return request<CompetitionDetail>(`/competitions/${idOrSlug}`);
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

// ── the student directory (§3.1's endpoint, widened in §3.6) ─────────────

export type PayStatus = 'LUNAS' | 'BELUM_BAYAR' | 'CICILAN' | 'NUNGGAK';

export interface StudentDirectoryRow {
  id: string;
  name: string;
  slug: string;
  level: 'SD' | 'SMP' | 'SMA' | null;
  accountStatus: 'LIMITED' | 'ACTIVE';
  studentStatus: string;
  joinDate: string;
  school: string | null;
  parentName: string | null;
  programNames: string;
  outstanding: number;
  payStatus: PayStatus;
  progressUpdatedAt: string | null;
  progressStatus: ProgressStatus;
  progressDaysSince: number | null;
}

export function listStudentDirectory(q?: string) {
  const qs = new URLSearchParams({ view: 'directory' });
  if (q) qs.set('q', q);
  return request<{ items: StudentDirectoryRow[] }>(`/students?${qs}`);
}

// ── the caller's own account (doc 14 §3.9) ───────────────────────────────

/**
 * The signed-in staff member's own row, including `bio`, which
 * `GET /v1/auth/me` deliberately does not carry: that endpoint answers
 * "who is this and what may they do", and a public biography is neither.
 */
export interface OwnProfile {
  id: string;
  email: string | null;
  fullName: string;
  displayName: string | null;
  phone: string | null;
  photoUrl: string | null;
  bio: string | null;
  status: string;
  primaryRole: string | null;
}

export function getOwnProfile() {
  return request<OwnProfile>('/me/profile');
}
