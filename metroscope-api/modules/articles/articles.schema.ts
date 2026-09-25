import { z } from 'zod';
import { queryBoolean } from '@/lib/http/query-boolean';
import { CONTENT_STATUSES } from '../content/content.schema';

/**
 * Article request contracts (doc 14 §2.3).
 *
 * `ArticleDraftBody`, the PATCH body, lives in `articles.derive.ts` instead,
 * because the registry imports it and the registry must not pull the whole
 * service graph in behind it.
 */

export const CreateArticleBody = z
  .object({
    title: z.string().min(3).max(200),
    /** Optional: the slug is derived from the title unless the editor sets one. */
    slug: z.string().min(2).max(160).optional(),
    locale: z.enum(['id', 'en']).optional(),
    categoryId: z.string().uuid().optional(),
    /** Only an editor reassigns the byline; it defaults to the caller. */
    authorId: z.string().uuid().optional(),
  })
  .strict();

export const ArticleListQuery = z.object({
  status: z.enum(CONTENT_STATUSES).optional(),
  categoryId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
  featured: queryBoolean.optional(),
  q: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const CategoryBody = z
  .object({
    name: z.string().min(2).max(80),
    slug: z.string().min(2).max(80).optional(),
    description: z.string().max(400).nullable().optional(),
    orderIndex: z.number().int().min(0).max(999).optional(),
  })
  .strict();

export const TagBody = z
  .object({
    name: z.string().min(1).max(60),
    slug: z.string().min(1).max(60).optional(),
  })
  .strict();

export type CreateArticleInput = z.infer<typeof CreateArticleBody>;
export type ArticleListQueryInput = z.infer<typeof ArticleListQuery>;
export type CategoryInput = z.infer<typeof CategoryBody>;
export type TagInput = z.infer<typeof TagBody>;

/**
 * The public listing query (doc 14 §2.4).
 *
 * `perPage` is capped at 24. Without a ceiling, `?perPage=100000` is a
 * one-request way to make the site render every article it has ever published.
 */
export const PublicArticleQuery = z.object({
  category: z.string().max(80).optional(),
  tag: z.string().max(60).optional(),
  q: z.string().min(1).max(120).optional(),
  featured: queryBoolean.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(24).default(9),
});

export type PublicArticleQueryInput = z.infer<typeof PublicArticleQuery>;
