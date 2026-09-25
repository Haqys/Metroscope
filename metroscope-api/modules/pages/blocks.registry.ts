import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The block registry (doc 13 §9.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Adding a block type is one Zod schema + one React component + one registry
 * entry." This file is the first of those three, and the only one the API
 * needs: it decides which `type` values exist and what `props` each may hold.
 *
 * Closed by construction. `page_blocks.type` is a plain `text` column so that
 * adding a type is not a migration with a lock, which means THIS map is the
 * only thing standing between an editor and an arbitrary block type. A type
 * absent here cannot be created, and its props cannot be saved.
 *
 * Every schema is `.strict()`. A block's props are rendered by a component that
 * reads specific keys; an unknown key is either a typo that will silently do
 * nothing, or an attempt to smuggle state past the renderer.
 *
 * ── Media in props ──
 * Any prop that references the media library is named `mediaId` or lives in an
 * `items[].mediaId`. `pages.derive.ts` walks the saved props for exactly those
 * keys to write `media_usage`, so a new block type gets usage tracking by
 * naming its field consistently rather than by remembering to register it.
 */

const mediaId = z.string().uuid();

/** A link a block can point at. Site-relative or absolute http(s) only. */
const href = z
  .string()
  .max(500)
  .refine((v) => v.startsWith('/') || /^https?:\/\//i.test(v), {
    message: 'Tautan harus diawali / atau http(s)://',
  });

export interface BlockType {
  /** Stable key, stored in `page_blocks.type`. */
  key: string;
  /** Human label for the editor's "add block" menu. */
  label: string;
  /** What it is for, shown under the label. */
  hint: string;
  schema: z.ZodTypeAny;
}

/**
 * Fourteen of doc 13 §9.3's fifteen types.
 *
 * §2.6 built nine and deferred six for want of content. §2.7 supplied four of
 * those, `faq_accordion`, `testimonial_slider`, `mentor_grid` and
 * `contact_form`, and each cost exactly what §9.3 promised: one schema here,
 * one component in the renderer, one entry in the editor's field map. §3.4
 * added `competition_calendar` at the same price, once its table existed.
 *
 * `achievement_wall` is the one still absent, and it is NOT waiting on data any
 * more, `competition_targets.result = 'WINNER'` is exactly what it would draw.
 * It is waiting on consent. A wall naming children and their placings is the
 * same category of publication as a testimonial, which may not be published
 * without a recorded consent source (`assertTestimonialConsent`). doc 13 §9.4
 * routes it correctly: `/site/achievements` is a curated collection
 * "auto-drafted from CompetitionTarget wins", drafted from a win, published by
 * a human. That collection belongs to §3.7 with the auto-draft; reading raw
 * results into a public block would skip the step that asks the family.
 */
const TYPES: BlockType[] = [
  {
    key: 'hero',
    label: 'Hero',
    hint: 'Judul besar, sub-judul, tombol, dan gambar latar.',
    schema: z
      .object({
        heading: z.string().min(1).max(200),
        subheading: z.string().max(400).optional(),
        eyebrow: z.string().max(80).optional(),
        ctaLabel: z.string().max(60).optional(),
        ctaHref: href.optional(),
        mediaId: mediaId.optional(),
      })
      .strict(),
  },
  {
    key: 'rich_text',
    label: 'Teks',
    hint: 'Paragraf. Satu baris kosong memisahkan paragraf.',
    schema: z
      .object({
        heading: z.string().max(200).optional(),
        /**
         * Plain text, split on blank lines at render, not HTML and not an AST.
         * Articles get a TipTap document because they are long-form writing;
         * a marketing block is a few paragraphs, and giving it a second rich
         * editor would mean two body formats to render and sanitise forever.
         */
        text: z.string().min(1).max(20000),
      })
      .strict(),
  },
  {
    key: 'cta_banner',
    label: 'Ajakan (CTA)',
    hint: 'Panel ajakan bertindak dengan satu tombol.',
    schema: z
      .object({
        heading: z.string().min(1).max(200),
        text: z.string().max(600).optional(),
        ctaLabel: z.string().min(1).max(60),
        ctaHref: href,
      })
      .strict(),
  },
  {
    key: 'stat_row',
    label: 'Angka',
    hint: 'Deret angka pencapaian.',
    schema: z
      .object({
        heading: z.string().max(200).optional(),
        items: z
          .array(
            z
              .object({
                value: z.string().min(1).max(20),
                label: z.string().min(1).max(80),
              })
              .strict(),
          )
          .min(1)
          .max(6),
      })
      .strict(),
  },
  {
    key: 'proof_bar',
    label: 'Bukti',
    hint: 'Baris logo atau klaim singkat sebagai bukti sosial.',
    schema: z
      .object({
        items: z
          .array(
            z
              .object({
                label: z.string().min(1).max(120),
                mediaId: mediaId.optional(),
              })
              .strict(),
          )
          .min(1)
          .max(8),
      })
      .strict(),
  },
  {
    key: 'steps',
    label: 'Langkah',
    hint: 'Proses bernomor, misalnya cara mendaftar.',
    schema: z
      .object({
        heading: z.string().max(200).optional(),
        items: z
          .array(
            z
              .object({
                title: z.string().min(1).max(120),
                text: z.string().max(600).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(8),
      })
      .strict(),
  },
  {
    key: 'media',
    label: 'Gambar',
    hint: 'Satu gambar dari pustaka media, dengan keterangan.',
    schema: z
      .object({
        mediaId,
        caption: z.string().max(300).optional(),
        /** `wide` breaks the text column; `inline` stays within it. */
        width: z.enum(['inline', 'wide']).default('inline'),
      })
      .strict(),
  },
  {
    key: 'program_grid',
    label: 'Daftar Program',
    hint: 'Kartu program yang sedang terbit. Isinya ikut CMS program.',
    /**
     * Holds no content of its own. It names a query. The programmes it shows
     * come from the same published set `/programs` reads, so a programme
     * published tomorrow appears here without anyone editing this page. A block
     * that stored copies of programme names would be stale the first time a
     * price changed.
     */
    schema: z
      .object({
        heading: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(12).default(3),
      })
      .strict(),
  },
  {
    key: 'faq_accordion',
    label: 'FAQ',
    hint: 'Pertanyaan yang sering muncul, dari CMS FAQ.',
    /**
     * Holds a filter, not copy, the same decision `program_grid` made. The
     * entries come from the published FAQ set, so answering an objection once
     * updates `/faq` and every page carrying this block.
     */
    schema: z
      .object({
        heading: z.string().max(200).optional(),
        category: z.string().max(80).optional(),
        limit: z.number().int().min(1).max(20).default(6),
      })
      .strict(),
  },
  {
    key: 'testimonial_slider',
    label: 'Testimoni',
    hint: 'Kutipan orang tua yang sudah terbit.',
    schema: z
      .object({
        heading: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(12).default(3),
      })
      .strict(),
  },
  {
    key: 'mentor_grid',
    label: 'Mentor',
    hint: 'Profil mentor yang sudah terbit.',
    schema: z
      .object({
        heading: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(12).default(4),
      })
      .strict(),
  },
  {
    key: 'competition_calendar',
    label: 'Kalender Lomba',
    hint: 'Lomba terbit dengan deadline terdekat. Bisa disaring per jenjang.',
    /**
     * The fourteenth type, unblocked by §3.4's `competitions` table (doc 14 §2.7
     * deferred it rather than invent one to make a block look finished).
     *
     * Carries a filter and a count, never a list of competitions. An editor who
     * pinned three lomba into a block would have built the second source of
     * truth doc 13 §12.8 exists to remove, and it would keep showing them for a
     * year after their deadlines passed, because a block prop has no clock.
     */
    schema: z
      .object({
        heading: z.string().max(200).optional(),
        text: z.string().max(600).optional(),
        schoolLevel: z.enum(['SD', 'SMP', 'SMA']).optional(),
        level: z.enum(['SCHOOL', 'REGIONAL', 'PROVINCIAL', 'NATIONAL', 'INTERNATIONAL']).optional(),
        limit: z.number().int().min(1).max(12).default(6),
        ctaLabel: z.string().max(80).optional(),
      })
      .strict(),
  },
  {
    key: 'contact_form',
    label: 'Formulir Kontak',
    hint: 'Formulir pesan. Masuk ke kotak masuk /site/forms.',
    /**
     * Carries only its own copy. The form POSTs to `/v1/public/contact`, which
     * is rate limited and honeypotted server-side, a block prop could not
     * change any of that, and offering one would imply it could.
     */
    schema: z
      .object({
        heading: z.string().max(200).optional(),
        text: z.string().max(600).optional(),
      })
      .strict(),
  },
  {
    key: 'article_grid',
    label: 'Daftar Artikel',
    hint: 'Artikel terbaru, opsional disaring per kategori.',
    schema: z
      .object({
        heading: z.string().max(200).optional(),
        category: z.string().max(80).optional(),
        limit: z.number().int().min(1).max(12).default(3),
      })
      .strict(),
  },
];

const BY_KEY: Record<string, BlockType> = Object.fromEntries(TYPES.map((t) => [t.key, t]));

export function resolveBlockType(key: string): BlockType | null {
  return Object.prototype.hasOwnProperty.call(BY_KEY, key) ? BY_KEY[key]! : null;
}

export function allBlockTypes(): BlockType[] {
  return TYPES;
}

/**
 * Every media id a block's props reference.
 *
 * Structural, not per-type: it looks for `mediaId` anywhere in the props tree.
 * A per-type extractor would be a second place to update when a block gains an
 * image, and the one that gets forgotten is the one whose picture becomes
 * deletable while a live page still shows it.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mediaIdsIn(props: unknown, depth = 0): string[] {
  if (depth > 6 || props === null || typeof props !== 'object') return [];
  if (Array.isArray(props)) return props.flatMap((v) => mediaIdsIn(v, depth + 1));

  const found: string[] = [];
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (key === 'mediaId' && typeof value === 'string' && UUID_RE.test(value)) {
      found.push(value);
    } else if (typeof value === 'object') {
      found.push(...mediaIdsIn(value, depth + 1));
    }
  }
  return found;
}
