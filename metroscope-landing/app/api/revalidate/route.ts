import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ISR purge hook. Called by the API service after a CMS publish so readers
 * never wait on an API round-trip (doc 04 §2.2).
 *
 * The only inbound route this site exposes. Secret-gated; a timing-safe compare
 * avoids leaking the secret through response timing.
 */
export async function POST(req: NextRequest) {
  /**
   * Standalone deploys have no API to forward to. Refusing here, before any
   * work, is what keeps the failure honest: the form tells the visitor that
   * online submission is not active yet and offers a real contact channel,
   * rather than reporting a generic outage for something that was never wired.
   */
  if (STANDALONE) {
    return NextResponse.json(
      {
        error: {
          code: 'STANDALONE_PREVIEW',
          message: 'Tidak ada CMS yang terhubung ke pratinjau ini.',
        },
      },
      { status: 503 },
    );
  }
  const provided = req.headers.get('x-revalidate-secret') ?? '';
  /**
   * Optional in the schema because a standalone deploy has no publisher to
   * authenticate. The refusal above covers that case, so an unset secret here
   * means a misconfigured non-standalone deploy, and the right answer is to
   * reject every caller rather than to compare against an empty string, which
   * an empty header would match.
   */
  const expected = env.REVALIDATE_SECRET;
  if (!expected) {
    logger.error('revalidate_secret_missing');
    return NextResponse.json({ error: { code: 'NOT_CONFIGURED' } }, { status: 503 });
  }

  const ok =
    provided.length === expected.length &&
    provided
      .split('')
      .reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0;

  if (!ok) {
    logger.warn('revalidate_rejected');
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { tags?: string[] } | null;
  const tags = body?.tags ?? [];
  if (!Array.isArray(tags) || tags.length === 0) {
    return NextResponse.json({ error: { code: 'TAGS_REQUIRED' } }, { status: 400 });
  }

  for (const tag of tags) revalidateTag(tag);
  logger.info('revalidated', { tags });

  return NextResponse.json({ data: { revalidated: tags } });
}
