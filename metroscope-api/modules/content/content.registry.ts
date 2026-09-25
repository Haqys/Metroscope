import { sql, type SQL } from 'drizzle-orm';
import type { ZodTypeAny } from 'zod';
import type { asUser } from '@/lib/db/rls';
import type { RequestContext } from '@/lib/auth/context';
import {
  ArticleDraftBody,
  assertArticleReady,
  syncArticleDerived,
} from '../articles/articles.derive';
import {
  assertTestimonialConsent,
  syncMentorDerived,
  syncTestimonialDerived,
} from '../surfaces/surfaces.derive';
import { FaqDraftBody, MentorDraftBody, TestimonialDraftBody } from '../surfaces/surfaces.schema';
import { syncProgramDerived } from '../programs/programs.derive';
import { syncPageDerived } from '../pages/pages.derive';
import { PageDraftBody } from '../pages/pages.schema';
import { CompetitionDraftBody } from '../competitions/competitions.schema';
import { ProgramDraftBody } from './content.schema';

/** The transaction handle the pipeline runs inside. Same one `asUser` yields. */
export type ContentTx = Parameters<Parameters<typeof asUser>[1]>[0];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The content type registry (doc 13 §9.2).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One editorial pipeline serves every content type. The pipeline itself knows
 * nothing about programmes, articles or pages. It knows how to move a row
 * through DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHED, snapshot it,
 * and tell the website what changed. Everything type-specific lives here.
 *
 * Adding a content type is one entry in this file plus its table. If adding a
 * type ever requires editing `content.service.ts`, the abstraction has failed
 * and the second pipeline has started, which is exactly what doc 13 §9.2 says
 * makes a CMS unmaintainable.
 *
 * The registry is deliberately a closed map rather than a dynamic lookup: an
 * `entityType` arriving from a URL must never be able to name an arbitrary
 * table. `resolveType()` is the only way in, and it throws on anything unknown.
 */

export interface ContentType {
  /** Stable key, used in URLs, `content_versions.entity_type` and audit rows. */
  key: string;
  /** Physical table. Never interpolated from user input, see above. */
  table: string;
  /** Human label for audit messages and the UI. */
  label: string;
  /** Column holding the URL slug, if this type has a public URL. */
  slugColumn: string | null;
  /**
   * Column shown as the row's name in the editorial list.
   *
   * Programmes call it `name`, articles call it `title`. The list used to
   * hardcode `c.name AS title`, which meant the second content type would
   * either have to be named like the first or the query had to grow a branch.
   */
  titleColumn: string;
  /**
   * API field → physical column, for `PATCH /site/content/:type/:id`.
   *
   * An allowlist, not a mapper: a field absent from here cannot reach an UPDATE
   * even if the schema were loosened, so `status`, `version` and `published_at`
   * stay unreachable from the draft editor by construction. Only the pipeline
   * moves those.
   */
  editableColumns: Record<string, string>;
  /** Zod body for that PATCH. Resolved per type, the route holds no schema. */
  draftSchema: ZodTypeAny;
  /**
   * Column stamped on every draft edit, and read by the editorial list.
   *
   * Declared rather than assumed. `programs` had only `created_at` until 2.5,
   * and the two consequences were both silent: hardcoding `updated_at = now()`
   * made every programme edit a 500, and `listContent` compensated by showing
   * `created_at` under a column headed "diperbarui", a real date answering the
   * wrong question. Types without one fall back to `created_at` explicitly.
   */
  updatedAtColumn: string | null;
  /**
   * Optional: derive state that must never be client-supplied, and keep related
   * rows in step, inside the SAME transaction as the draft edit.
   *
   * Returns extra column assignments to merge into the UPDATE. Articles use it
   * for reading time (computed from the body, never trusted from the browser),
   * tag membership, and `media_usage`, none of which the pipeline should know
   * about, and all of which must be atomic with the edit that caused them.
   */
  onDraftUpdate?: (
    tx: ContentTx,
    ctx: RequestContext,
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  /**
   * Optional: refuse a transition that would release incomplete content.
   *
   * Runs inside the pipeline's transaction, after the row is locked and the
   * state machine has accepted the move, but BEFORE the status is written, so
   * a refusal leaves nothing half-done. It also covers the scheduled-publish
   * cron, which is the case a check in a route handler would miss entirely.
   *
   * Two real consumers, which is why it exists at all: a testimonial may not
   * be PUBLISHED without a recorded consent source (doc 13 §9.4. These are
   * quotes from named parents about named children), and an article may not be
   * submitted for review without an excerpt, which migration 0014 said the
   * pipeline would enforce at SUBMIT and nothing ever did.
   */
  beforeTransition?: (
    tx: ContentTx,
    id: string,
    action: string,
    nextStatus: string,
  ) => Promise<void>;
  /**
   * Columns copied into a version snapshot. Explicit rather than `SELECT *`:
   * a snapshot is a restore target, and silently capturing a column added
   * later (a view counter, a computed cache) would restore it too.
   */
  snapshotColumns: string[];
  /** Public URL for a given slug, used to write a 301 when a slug changes. */
  publicPath: ((slug: string) => string) | null;
  /**
   * Cache tags this type's publish invalidates. Kept narrow on purpose:
   * revalidating everything on every publish turns ISR into no cache at all.
   */
  revalidateTags: (row: Record<string, unknown>) => string[];
}

const PROGRAM: ContentType = {
  key: 'program',
  table: 'programs',
  label: 'Program',
  slugColumn: 'slug',
  titleColumn: 'name',
  editableColumns: {
    name: 'name',
    slug: 'slug',
    summary: 'summary',
    description: 'description',
    body: 'body',
    category: 'category',
    levels: 'levels',
    durationMonths: 'duration_months',
    cadence: 'cadence',
    priceMonthly: 'price_monthly',
    coverId: 'cover_id',
  },
  draftSchema: ProgramDraftBody,
  onDraftUpdate: syncProgramDerived,
  updatedAtColumn: 'updated_at',
  snapshotColumns: [
    'slug',
    'name',
    'category',
    'levels',
    'duration_months',
    'cadence',
    'price_monthly',
    'description',
    'summary',
    'body',
    'cover_id',
    'locale',
  ],
  publicPath: (slug) => `/programs/${slug}`,
  revalidateTags: (row) => ['programs', `program:${String(row.slug)}`],
};

/**
 * Articles (doc 13 §10, doc 14 §2.3).
 *
 * The whole of the article's editorial life, submit, approve, schedule,
 * publish, unpublish, archive, version, restore, 301 on rename, is this entry.
 * Not one line of `content.service.ts` changed to add it, which is the property
 * 2.1 was built to have.
 */
const ARTICLE: ContentType = {
  key: 'article',
  table: 'articles',
  label: 'Artikel',
  slugColumn: 'slug',
  titleColumn: 'title',
  editableColumns: {
    title: 'title',
    slug: 'slug',
    subtitle: 'subtitle',
    excerpt: 'excerpt',
    body: 'body',
    coverId: 'cover_id',
    categoryId: 'category_id',
    authorId: 'author_id',
    featured: 'featured',
    pinnedRank: 'pinned_rank',
    studentId: 'student_id',
    programId: 'program_id',
    /**
     * §3.7. `competition_id` is the foreign key 0014's own comment predicted
     * ("`competitions` has no table until Phase 3"); the consent pair is what
     * `assertArticleReady` requires before an article naming a child may be
     * published, mirroring the testimonial rule below.
     */
    competitionId: 'competition_id',
    consentSource: 'consent_source',
    consentAt: 'consent_at',
    locale: 'locale',
  },
  draftSchema: ArticleDraftBody,
  onDraftUpdate: syncArticleDerived,
  beforeTransition: assertArticleReady,
  updatedAtColumn: 'updated_at',
  snapshotColumns: [
    'slug',
    'locale',
    'title',
    'subtitle',
    'excerpt',
    'body',
    'cover_id',
    'category_id',
    'author_id',
    'featured',
    'pinned_rank',
    'reading_min',
    'student_id',
    'program_id',
    'competition_id',
    /**
     * The consent record is snapshotted with the version, so restoring an old
     * version cannot restore it into a state that was publishable without one.
     */
    'consent_source',
    'consent_at',
  ],
  /**
   * `/articles/:slug`, per doc 13 §19.1 and doc 02 §1.2, not `/artikel/`.
   *
   * 2.3 wrote the Indonesian form. It never reached production and no public
   * page existed to disagree with it, but it is the path baked into every 301 a
   * rename writes, so a redirect created before this fix would point at a URL
   * the site does not serve. Doc 02 §1.4 also retires `/porto/*` to `/articles/*`,
   * and two spellings of the same surface is how a redirect chain starts.
   */
  publicPath: (slug) => `/articles/${slug}`,
  /**
   * The article's own page, plus every list it can appear in.
   *
   * `articles` deliberately covers the index AND the category listings rather
   * than tagging per category. A per-category tag would be marginally narrower
   * but needs the category's slug at publish time, a join inside the locking
   * read, to save revalidating list pages that genuinely did change: an
   * article moving between categories alters two listings, and the narrow tag
   * would purge neither correctly.
   */
  revalidateTags: (row) => ['articles', `article:${String(row.slug)}`],
};

/**
 * Pages (doc 13 §9.3, doc 14 §2.6).
 *
 * The thinnest registry entry of the three, and that is the point: a page's row
 * holds a title, a slug and a note, while everything a visitor reads lives in
 * `page_blocks`. The pipeline still versions, publishes, redirects and audits
 * it exactly as it does an article, the snapshot just captures less, because
 * the blocks are captured beside it by the derive hook's own reconciliation.
 */
const PAGE: ContentType = {
  key: 'page',
  table: 'pages',
  label: 'Halaman',
  slugColumn: 'slug',
  titleColumn: 'title',
  editableColumns: {
    title: 'title',
    slug: 'slug',
    description: 'description',
    locale: 'locale',
  },
  draftSchema: PageDraftBody,
  onDraftUpdate: syncPageDerived,
  updatedAtColumn: 'updated_at',
  snapshotColumns: ['slug', 'locale', 'title', 'description'],
  /**
   * `/${slug}`, the marketing site's catch-all. Static routes win over the
   * dynamic segment in Next, so a page slugged `programs` cannot shadow the
   * real `/programs`; it simply never renders, which is the safe direction.
   */
  publicPath: (slug) => `/${slug}`,
  revalidateTags: (row) => ['pages', `page:${String(row.slug)}`],
};

/**
 * FAQ (doc 13 §9.4, doc 14 §2.7).
 *
 * `publicPath: null`, an FAQ entry has no address of its own. It is rendered
 * inside `/faq` and inside a `faq_accordion` block, so a rename has no URL to
 * redirect and the pipeline correctly writes none. `slugColumn: null` for the
 * same reason, which the pipeline already handles.
 */
const FAQ: ContentType = {
  key: 'faq',
  table: 'faq_entries',
  label: 'FAQ',
  slugColumn: null,
  titleColumn: 'question',
  editableColumns: {
    question: 'question',
    answer: 'answer',
    category: 'category',
    orderIndex: 'order_index',
    locale: 'locale',
  },
  draftSchema: FaqDraftBody,
  updatedAtColumn: 'updated_at',
  snapshotColumns: ['question', 'answer', 'category', 'order_index', 'locale'],
  publicPath: null,
  revalidateTags: () => ['faq'],
};

/**
 * Testimonials (doc 13 §9.4, "Parent testimonials + **consent record**").
 *
 * The `beforeTransition` guard is the reason this type is not just another
 * collection: these are quotes from named parents, often about named children,
 * and publishing one without a recorded consent source is a permission problem
 * rather than a quality one.
 */
const TESTIMONIAL: ContentType = {
  key: 'testimonial',
  table: 'testimonials',
  label: 'Testimoni',
  slugColumn: null,
  titleColumn: 'author_name',
  editableColumns: {
    quote: 'quote',
    authorName: 'author_name',
    authorRole: 'author_role',
    programId: 'program_id',
    photoId: 'photo_id',
    consentSource: 'consent_source',
    consentAt: 'consent_at',
    featured: 'featured',
    orderIndex: 'order_index',
    locale: 'locale',
  },
  draftSchema: TestimonialDraftBody,
  onDraftUpdate: syncTestimonialDerived,
  beforeTransition: async (tx, id, _action, nextStatus) => {
    if (nextStatus === 'PUBLISHED') await assertTestimonialConsent(tx, id);
  },
  updatedAtColumn: 'updated_at',
  snapshotColumns: [
    'quote',
    'author_name',
    'author_role',
    'program_id',
    'photo_id',
    'consent_source',
    'consent_at',
    'featured',
    'order_index',
    'locale',
  ],
  publicPath: null,
  revalidateTags: () => ['testimonials'],
};

/**
 * Mentor profiles (doc 13 §9.4, "Public mentor profiles").
 *
 * The one §2.7 collection with a public URL of its own, so it is the one that
 * gets redirects when a slug changes. `display_name` is edited here rather than
 * read from `users.full_name`: the public page must not be a window onto the
 * accounts table, and a mentor may want a different public name than the one
 * on their payroll record.
 */
const MENTOR: ContentType = {
  key: 'mentor',
  table: 'mentor_profiles',
  label: 'Mentor',
  slugColumn: 'slug',
  titleColumn: 'display_name',
  editableColumns: {
    displayName: 'display_name',
    slug: 'slug',
    headline: 'headline',
    bio: 'bio',
    photoId: 'photo_id',
    specialisms: 'specialisms',
    orderIndex: 'order_index',
    locale: 'locale',
  },
  draftSchema: MentorDraftBody,
  onDraftUpdate: syncMentorDerived,
  updatedAtColumn: 'updated_at',
  snapshotColumns: [
    'slug',
    'display_name',
    'headline',
    'bio',
    'photo_id',
    'specialisms',
    'order_index',
    'locale',
  ],
  publicPath: (slug) => `/mentors/${slug}`,
  revalidateTags: (row) => ['mentors', `mentor:${String(row.slug)}`],
};

/**
 * Competitions (doc 13 §12.8, doc 14 §3.4).
 *
 * The seventh type, and the one that most obviously belongs here. doc 13 §9.4
 * describes `/site/competitions` as a collection that "mirrors `/competitions`,
 * adds marketing copy", but §12.8 names two sources of truth as the defect and
 * asks for **one** source feeding both the portal and the marketing calendar. A
 * mirror is two sources. So the marketing copy is columns on the operational
 * row, and registering that row here is what gives it the publish state, the
 * 301 on rename, the version history and the ISR invalidation the public page
 * needs.
 *
 * This is the opposite call to the one 0022 made for materials, for opposite
 * reasons: a material has no public URL, is read by entitlement, and is authored
 * by MENTOR, who holds no content verb. A competition has a public URL, is read
 * by anyone on the internet, and is published by whoever publishes the website.
 */
const COMPETITION: ContentType = {
  key: 'competition',
  table: 'competitions',
  label: 'Lomba',
  slugColumn: 'slug',
  titleColumn: 'name',
  editableColumns: {
    name: 'name',
    slug: 'slug',
    summary: 'summary',
    description: 'description',
    coverId: 'cover_id',
    organizer: 'organizer',
    venue: 'venue',
    level: 'level',
    format: 'format',
    mode: 'mode',
    categories: 'categories',
    levels: 'levels',
    registrationFee: 'registration_fee',
    feeNote: 'fee_note',
    registrationUrl: 'registration_url',
    guidebookUrl: 'guidebook_url',
    registrationOpensAt: 'registration_opens_at',
    registrationDeadline: 'registration_deadline',
    eventStart: 'event_start',
    eventEnd: 'event_end',
    locale: 'locale',
  },
  draftSchema: CompetitionDraftBody,
  updatedAtColumn: 'updated_at',
  snapshotColumns: [
    'slug',
    'name',
    'summary',
    'description',
    'cover_id',
    'organizer',
    'venue',
    'level',
    'format',
    'mode',
    'categories',
    'levels',
    'registration_fee',
    'fee_note',
    'registration_url',
    'guidebook_url',
    'registration_opens_at',
    'registration_deadline',
    'event_start',
    'event_end',
    'locale',
  ],
  publicPath: (slug) => `/competitions/${slug}`,
  /**
   * `competitions` covers the calendar hub and every block that draws it;
   * `competition:<slug>` covers the detail page. Not `sitemap`, `publishTags()`
   * adds that for every type with a `publicPath`, and adding it here too would
   * purge it twice.
   */
  revalidateTags: (row) => ['competitions', `competition:${String(row.slug)}`],
};

const TYPES: Record<string, ContentType> = {
  [PROGRAM.key]: PROGRAM,
  [ARTICLE.key]: ARTICLE,
  [PAGE.key]: PAGE,
  [FAQ.key]: FAQ,
  [TESTIMONIAL.key]: TESTIMONIAL,
  [MENTOR.key]: MENTOR,
  [COMPETITION.key]: COMPETITION,
};

export function resolveType(key: string): ContentType | null {
  return Object.prototype.hasOwnProperty.call(TYPES, key) ? TYPES[key]! : null;
}

/**
 * Cache tags to purge after a publish, unpublish or restore.
 *
 * `sitemap` is added here, once, for every type that HAS a public URL, rather
 * than pasted into six `revalidateTags` functions where the seventh would
 * forget it. The condition is the same declaration the pipeline already uses to
 * decide whether a rename needs a 301: a type with a `publicPath` contributes
 * URLs, so publishing one changes the list of URLs.
 *
 * `revalidateTags` stays per-type because what a publish invalidates on the
 * SITE is genuinely type-specific; what it invalidates in the sitemap is not.
 */
export function publishTags(type: ContentType, row: Record<string, unknown>): string[] {
  const tags = type.revalidateTags(row);
  return type.publicPath ? [...tags, 'sitemap'] : tags;
}

export function allTypes(): ContentType[] {
  return Object.values(TYPES);
}

/**
 * `identifier` quotes a registry-supplied name for interpolation.
 *
 * Every value passed here comes from the closed map above, never from a
 * request, but the wrapper exists so that stays true by construction rather
 * than by everyone remembering.
 */
export function identifier(name: string): SQL {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to interpolate unsafe identifier: ${name}`);
  }
  return sql.raw(`"${name}"`);
}
