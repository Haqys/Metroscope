import { getAccessToken } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Server-side calls to api.metroscope.id.
 *
 * For SERVER components only. It reads the HttpOnly cookie, which a client
 * component cannot. Client components go through `/api/bff/*` on this origin,
 * so the token never reaches browser JavaScript (doc 04 §0.4).
 *
 * Nothing here decides anything. The API authorises every request
 * independently and RLS filters again underneath it, so a 403 is an answer to
 * render, not a bug to route around.
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
    // Never cache an authorised response: it is scoped to one caller's grants.
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

// ── leads ────────────────────────────────────────────────────────────────

export interface LeadRow {
  id: string;
  childName: string;
  parentName: string | null;
  parentPhone: string;
  level: string;
  type: 'CONSULTATION' | 'DIRECT';
  status: LeadStatus;
  programName: string | null;
  source: string;
  followUpAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
}

export type LeadStatus = 'NEW' | 'CONSULTING' | 'NURTURING' | 'CONVERTED' | 'REJECTED' | 'LOST';

export interface LeadContact {
  id: string;
  note: string;
  actorName: string | null;
  createdAt: string;
}

export interface LeadDetail extends LeadRow {
  parentEmail: string | null;
  school: string | null;
  programId: string | null;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  landingPage: string | null;
  consultationOutcome: 'LANJUT' | 'PIKIR_DULU' | 'TIDAK_COCOK' | null;
  lossReason: 'PRICE' | 'SCHEDULE' | 'FIT' | 'OTHER' | null;
  followUpNote: string | null;
  rejectionReason: string | null;
  convertedStudentId: string | null;
  contacts: LeadContact[];
}

export function listLeads(params: {
  status?: LeadStatus;
  q?: string;
  dueBefore?: string;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return request<{ items: LeadRow[]; nextCursor: string | null }>(
    `/registrations${qs.size ? `?${qs}` : ''}`,
  );
}

export function leadCounts() {
  return request<Partial<Record<LeadStatus, number>>>('/registrations/counts');
}

export function getLead(id: string) {
  return request<LeadDetail>(`/registrations/${id}`);
}

// ── organisation settings ────────────────────────────────────────────────

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note: string | null;
  isActive: boolean;
  orderIndex: number;
}

/**
 * Destination accounts for manual transfer (FR-PAY-2).
 *
 * Readable by any signed-in caller, a guardian cannot pay without them. RLS
 * hides deactivated accounts from everyone but `settings.edit` holders, so
 * this one call serves both the pay page and the settings screen.
 */
export function listBankAccounts() {
  return request<BankAccount[]>('/settings/bank-accounts');
}

// ── billing ──────────────────────────────────────────────────────────────

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

export function listInvoices(
  params: { status?: InvoiceStatus; studentId?: string; limit?: number } = {},
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: Invoice[]; nextCursor: string | null }>(
    `/invoices${qs.size ? `?${qs}` : ''}`,
  );
}

// ── billing runs ─────────────────────────────────────────────────────────

export interface BillingRun {
  id: string;
  period: string;
  status: 'DRAFT' | 'ISSUED';
  invoiceCount: number;
  totalAmount: number;
  issuedAt: string | null;
  issuedByName: string | null;
  createdAt: string;
}

/** Monthly runs, newest first. RLS restricts these to Finance. */
export function listBillingRuns() {
  return request<BillingRun[]>('/billing-runs');
}

// ── inbox ────────────────────────────────────────────────────────────────

export type InboxType =
  | 'registration'
  | 'payment_proof'
  | 'overdue'
  | 'billing_run'
  | 'content'
  | 'reschedule'
  | 'unassessed';

export interface InboxItem {
  id: string;
  type: InboxType;
  title: string;
  subtitle: string | null;
  href: string;
  waitingSince: string;
  amount: number | null;
}

export interface InboxCounts {
  total: number;
  byType: Record<InboxType, number>;
}

/**
 * The unified queue, oldest first.
 *
 * Which items come back is decided entirely by the caller's grants, a
 * Secretary gets leads, Finance gets money. There is no client-side filtering
 * to do beyond the type tabs.
 */
export function listInbox(params: { type?: InboxType; limit?: number } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: InboxItem[] }>(`/inbox${qs.size ? `?${qs}` : ''}`);
}

/** Uncapped totals per type, the badge must be able to exceed the page. */
export function inboxCounts() {
  return request<InboxCounts>('/inbox/counts');
}

// ── roles & team (doc 14 Task 0.4) ───────────────────────────────────────

export interface RoleDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** Guardians, not team. Never offered as a staff assignment. */
  isCustomer: boolean;
  home: string;
  tone: string | null;
  pages: string[];
  actions: string[];
  memberCount: number;
}

export interface StaffMember {
  id: string;
  fullName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  status: string;
  roles: string[];
  primaryRole: string | null;
}

/**
 * Every role, from the database.
 *
 * Replaces `lib/roles-data.ts`. Readable by any signed-in account, because a
 * role row carries no secrets, who HOLDS one is the sensitive part, and that
 * is `listUsers`, which RLS gates separately.
 */
export function listRoles() {
  return request<RoleDetail[]>('/roles');
}

/** The team directory. RLS returns colleagues; customers need `user.manage`. */
export function listUsers(params: { scope?: 'staff' | 'all'; q?: string } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: StaffMember[] }>(`/users${qs.size ? `?${qs}` : ''}`);
}

// ── CMS (doc 14 Phase 2) ─────────────────────────────────────────────────

export type ContentStatus =
  'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export interface ContentItem {
  id: string;
  type: string;
  title: string;
  slug: string | null;
  status: ContentStatus;
  version: number;
  publishAt: string | null;
  publishedAt: string | null;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
}

export interface ContentVersion {
  version: number;
  note: string | null;
  createdAt: string;
  authorName: string | null;
}

/**
 * Everything across every content type, in one call.
 *
 * The CMS home answers "what is waiting on me?" across articles, programmes
 * and pages together, a caller that fans out per type will miss the next one.
 */
export function listContent(
  params: { type?: string; status?: ContentStatus; limit?: number } = {},
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: ContentItem[] }>(`/site/content${qs.size ? `?${qs}` : ''}`);
}

export function listContentVersions(type: string, id: string) {
  return request<{ items: ContentVersion[] }>(`/site/content/${type}/${id}/versions`);
}

export interface ContentSeo {
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogImageKey: string | null;
  /** Resolved by the API so the editor never builds a storage URL itself. */
  ogImageUrl: string | null;
  noindex: boolean;
  /** Where this row lives on the public site, or null if it has no URL. */
  publicPath: string | null;
}

export function getContentSeo(type: string, id: string) {
  return request<ContentSeo>(`/site/content/${type}/${id}/seo`);
}

// ── media library (doc 14 §2.2) ──────────────────────────────────────────

export interface MediaAsset {
  id: string;
  url: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  caption: string | null;
  title: string;
  folder: string | null;
  focalX: number;
  focalY: number;
  status: 'PENDING' | 'READY';
  /** Safe to place in published content, an image needs alt text first. */
  isReady: boolean;
  usageCount: number;
  uploadedByName: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface MediaUsageRow {
  entityType: string;
  entityId: string;
  field: string | null;
}

export interface MediaQuery {
  q?: string;
  folder?: string;
  kind?: 'image' | 'pdf';
  missingAlt?: boolean;
  deleted?: boolean;
  limit?: number;
}

export function listMedia(params: MediaQuery = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: MediaAsset[] }>(`/site/media${qs.size ? `?${qs}` : ''}`);
}

export function getMediaAsset(id: string) {
  return request<MediaAsset>(`/site/media/${id}`);
}

export function getMediaUsage(id: string) {
  return request<{ items: MediaUsageRow[] }>(`/site/media/${id}/usage`);
}

// ── articles (doc 14 §2.3) ───────────────────────────────────────────────

/** A TipTap / ProseMirror node. Structural, not exhaustive, see the API. */
export interface ProseNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface ArticleTag {
  id: string;
  name: string;
  slug: string;
}

export interface ArticleListItem {
  id: string;
  title: string;
  slug: string;
  locale: string;
  status: ContentStatus;
  version: number;
  excerpt: string | null;
  featured: boolean;
  pinnedRank: number | null;
  readingMin: number;
  viewCount: number;
  publishAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  categoryId: string | null;
  categoryName: string | null;
  authorId: string | null;
  authorName: string | null;
  coverId: string | null;
  coverKey: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  /** §3.7, non-null marks a draft a competition win created, not a person. */
  competitionTargetId: string | null;
  studentId: string | null;
  /** The recorded parental consent. Required before an article naming a child publishes. */
  consentSource: string | null;
  tags: ArticleTag[];
}

export interface Article extends ArticleListItem {
  subtitle: string | null;
  body: ProseNode;
  categorySlug: string | null;
  programId: string | null;
  reviewNote: string | null;
  competitionId: string | null;
  consentAt: string | null;
  /** Resolved names, so the editor can show what the article is about. */
  studentName: string | null;
  competitionName: string | null;
}

export interface ArticleQuery {
  status?: ContentStatus;
  categoryId?: string;
  tagId?: string;
  authorId?: string;
  featured?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listArticles(params: ArticleQuery = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== '') qs.set(k, String(v));
  return request<{ items: ArticleListItem[]; total: number }>(
    `/site/articles${qs.size ? `?${qs}` : ''}`,
  );
}

export function getArticle(id: string) {
  return request<Article>(`/site/articles/${id}`);
}

export interface ArticleCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  orderIndex: number;
  articleCount: number;
}

export function listArticleCategories() {
  return request<{ items: ArticleCategory[] }>('/site/categories');
}

export function listArticleTags() {
  return request<{ items: (ArticleTag & { articleCount: number })[] }>('/site/tags');
}

// ── programmes as CMS content (doc 14 §2.5) ──────────────────────────────

export interface ProgramEditable {
  id: string;
  slug: string;
  name: string;
  category: 'ACADEMIC' | 'NON_ACADEMIC' | 'CREATIVE';
  levels: string[];
  summary: string | null;
  description: string | null;
  body: string | null;
  cadence: string | null;
  locale: string;
  durationMonths: number;
  priceMonthly: number;
  status: ContentStatus;
  version: number;
  publishAt: string | null;
  publishedAt: string | null;
  reviewNote: string | null;
  updatedAt: string;
  coverId: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
}

export function getProgramForEditor(id: string) {
  return request<ProgramEditable>(`/site/programs/${id}`);
}

// ── pages and blocks (doc 14 §2.6) ───────────────────────────────────────

export interface PageBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  orderIndex: number;
  visible: boolean;
  visibleFrom: string | null;
  visibleUntil: string | null;
}

export interface PageEditable {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  locale: string;
  status: ContentStatus;
  version: number;
  publishAt: string | null;
  publishedAt: string | null;
  reviewNote: string | null;
  updatedAt: string;
  blocks: PageBlock[];
}

export function getPageForEditor(id: string) {
  return request<PageEditable>(`/site/pages/${id}`);
}

// ── §2.7 collections and the contact inbox ───────────────────────────────

export function getSurfaceForEditor(type: string, id: string) {
  return request<Record<string, unknown> & { id: string; status: ContentStatus; version: number }>(
    `/site/surfaces/${type}/${id}`,
  );
}

export interface FormSubmission {
  id: string;
  kind: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  sourcePath: string | null;
  handled: boolean;
  handledAt: string | null;
  handledByName: string | null;
  createdAt: string;
}

export function listFormSubmissions(handled = false) {
  return request<{ items: FormSubmission[] }>(`/site/forms?handled=${handled}`);
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
  to?: string;
  scope?: 'all' | 'mine';
  studentId?: string;
  mentorId?: string;
  status?: SessionStatus;
  includeCancelled?: boolean;
  limit?: number;
}

export function listSessions(params: SessionQuery = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: SessionRow[] }>(`/sessions${qs.size ? `?${qs}` : ''}`);
}

export interface SeriesRow {
  id: string;
  studentId: string;
  mentorId: string;
  weekday: number;
  startTime: string;
  durationMin: number;
  startsOn: string;
  endsOn: string | null;
  status: 'ACTIVE' | 'ENDED';
  note: string | null;
  studentName: string;
  mentorName: string | null;
  programName: string | null;
  upcomingCount: number;
}

export function listSeries(studentId?: string) {
  return request<{ items: SeriesRow[] }>(
    `/session-series${studentId ? `?studentId=${studentId}` : ''}`,
  );
}

export interface StudentOption {
  id: string;
  name: string;
  slug: string;
  level: 'SD' | 'SMP' | 'SMA' | null;
  accountStatus: 'LIMITED' | 'ACTIVE';
  studentStatus: string;
}

export function listStudents(q?: string) {
  return request<{ items: StudentOption[] }>(`/students${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}

export interface AvailabilitySlot {
  id: string;
  mentorId: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export function getAvailability(mentorId?: string) {
  return request<{ mentorId: string; items: AvailabilitySlot[] }>(
    `/availability${mentorId ? `?mentorId=${mentorId}` : ''}`,
  );
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

export function listRescheduleRequests(params: { status?: RescheduleStatus; limit?: number } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return request<{ items: RescheduleRequest[] }>(`/reschedule-requests${qs.size ? `?${qs}` : ''}`);
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

export function listMaterials(params: { status?: MaterialStatus; q?: string } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== '') qs.set(k, String(v));
  return request<{ items: MaterialRow[] }>(`/materials${qs.size ? `?${qs}` : ''}`);
}

export function getMaterial(idOrSlug: string) {
  return request<MaterialDetail>(`/materials/${idOrSlug}`);
}

export interface MaterialAssignment {
  id: string;
  studentId: string | null;
  programId: string | null;
  level: 'SD' | 'SMP' | 'SMA' | null;
  studentName: string | null;
  programName: string | null;
  createdAt: string;
}

export function listMaterialAssignments(id: string) {
  return request<{ items: MaterialAssignment[] }>(`/materials/${id}/assignments`);
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

export interface TopicRow {
  id: string;
  name: string;
  programId: string | null;
  programName: string | null;
  orderIndex: number;
}

export function listTopics() {
  return request<{ items: TopicRow[] }>('/topics');
}

/**
 * Published programmes, for pickers.
 *
 * Reads the PUBLIC endpoint rather than `/site/content?type=program`, and that
 * is deliberate: the CMS queue is gated by the `/site` page grant, which a
 * MENTOR does not hold, and a mentor assigning a module to a programme is
 * exactly the case doc 13 §8.3 describes. A picker should also only ever offer
 * published programmes, which is what this endpoint returns.
 */
export function listProgramOptions() {
  return request<{ items: { id: string; slug: string; name: string; levels: string[] }[] }>(
    '/public/programs',
  );
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
