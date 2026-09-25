import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAQ, testimonials and mentor profiles (doc 13 §9.2 Tier 2, doc 14 §2.7).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Three collections that share one shape: a handful of fields, an order index,
 * and the pipeline. They live in one module because separating them would give
 * each its own near-identical service, the duplication §2.5 removed from the
 * media-usage helper, arriving three times at once.
 *
 * What they do NOT share is a schema. Each has its own `.strict()` draft body,
 * because the registry resolves the schema per type and a shared loose one
 * would let a testimonial field save onto an FAQ entry.
 */

export const FaqDraftBody = z
  .object({
    question: z.string().min(3).max(300).optional(),
    answer: z.string().min(1).max(5000).optional(),
    category: z.string().max(80).nullable().optional(),
    orderIndex: z.number().int().min(0).max(9999).optional(),
    locale: z.enum(['id', 'en']).optional(),
  })
  .strict();

export const TestimonialDraftBody = z
  .object({
    quote: z.string().min(10).max(2000).optional(),
    authorName: z.string().min(2).max(120).optional(),
    authorRole: z.string().max(160).nullable().optional(),
    programId: z.string().uuid().nullable().optional(),
    photoId: z.string().uuid().nullable().optional(),
    /**
     * How permission was obtained, and when (doc 13 §10.2).
     *
     * Editable like any other field, but the pipeline refuses to PUBLISH
     * without it, see `assertConsent`. A quote from a named parent about a
     * named child is the one piece of content where "we can add that later"
     * means publishing something nobody can prove permission for.
     */
    consentSource: z.string().max(300).nullable().optional(),
    consentAt: z.coerce.date().nullable().optional(),
    featured: z.boolean().optional(),
    orderIndex: z.number().int().min(0).max(9999).optional(),
    locale: z.enum(['id', 'en']).optional(),
  })
  .strict();

export const MentorDraftBody = z
  .object({
    displayName: z.string().min(2).max(120).optional(),
    slug: z
      .string()
      .min(2)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka dan tanda hubung')
      .optional(),
    headline: z.string().max(200).nullable().optional(),
    bio: z.string().max(5000).nullable().optional(),
    photoId: z.string().uuid().nullable().optional(),
    specialisms: z.array(z.string().min(1).max(60)).max(8).optional(),
    orderIndex: z.number().int().min(0).max(9999).optional(),
    locale: z.enum(['id', 'en']).optional(),
  })
  .strict();

// ── creation ────────────────────────────────────────────────────────────

export const CreateFaqBody = z
  .object({
    question: z.string().min(3).max(300),
    answer: z.string().min(1).max(5000),
    category: z.string().max(80).optional(),
  })
  .strict();

export const CreateTestimonialBody = z
  .object({
    quote: z.string().min(10).max(2000),
    authorName: z.string().min(2).max(120),
    authorRole: z.string().max(160).optional(),
  })
  .strict();

export const CreateMentorBody = z
  .object({
    /** An existing staff account. A mentor profile is never a free-floating row. */
    userId: z.string().uuid(),
    displayName: z.string().min(2).max(120),
    headline: z.string().max(200).optional(),
  })
  .strict();

// ── the public contact form ─────────────────────────────────────────────

/**
 * doc 13 §9.4: "/site/forms · Contact/consultation submissions inbox".
 *
 * `website` is a honeypot, a field no human sees and every naive bot fills.
 * The same trick the registration form uses, and the reason it is in the schema
 * rather than checked ad hoc: a rejected submission should look exactly like an
 * accepted one to whatever sent it.
 */
export const ContactSubmissionBody = z
  .object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(200).optional(),
    phone: z.string().min(6).max(30).optional(),
    message: z.string().min(10).max(2000),
    sourcePath: z.string().max(300).optional(),
    website: z.string().max(200).optional(),
  })
  .strict()
  .refine((v) => v.email || v.phone, {
    message: 'Isi email atau nomor telepon supaya kami bisa membalas.',
    path: ['email'],
  });

export type FaqDraftInput = z.infer<typeof FaqDraftBody>;
export type TestimonialDraftInput = z.infer<typeof TestimonialDraftBody>;
export type MentorDraftInput = z.infer<typeof MentorDraftBody>;
export type CreateFaqInput = z.infer<typeof CreateFaqBody>;
export type CreateTestimonialInput = z.infer<typeof CreateTestimonialBody>;
export type CreateMentorInput = z.infer<typeof CreateMentorBody>;
export type ContactSubmissionInput = z.infer<typeof ContactSubmissionBody>;
