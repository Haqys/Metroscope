import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Purge the website's ISR cache after a publish (doc 04 §2.2, doc 13 §9.5).
 *
 * The landing site exposes exactly one inbound route for this, secret-gated,
 * timing-safe compare, and it takes cache TAGS, not paths. Tags because one
 * publish affects several pages: a programme appears on `/programs`, on its own
 * page, and in the registration picker. Enumerating paths at the call site
 * means the day a fourth surface renders programmes, it silently serves stale
 * content until somebody remembers.
 *
 * **Best effort, by design.** This runs after the publishing transaction has
 * committed and never throws. The publish is already durable in Postgres; a
 * page that stays stale for a few minutes is a far smaller problem than telling
 * an editor their publish failed when it did not. They would publish again,
 * and again, each one a real state change.
 *
 * A failure is logged at `error`, which reaches Sentry (doc 08 §6a), so a
 * revalidation hook that has been broken for a week is visible rather than
 * inferred from complaints about stale prices.
 */
export async function revalidate(tags: string[], requestId: string): Promise<boolean> {
  if (tags.length === 0) return true;

  try {
    const res = await fetch(`${env.LANDING_URL}/api/revalidate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidate-secret': env.REVALIDATE_SECRET,
        'x-request-id': requestId,
      },
      body: JSON.stringify({ tags }),
      cache: 'no-store',
    });

    if (!res.ok) {
      logger.error('revalidate_rejected', { status: res.status, tags, requestId });
      return false;
    }

    logger.info('revalidated', { tags, requestId });
    return true;
  } catch (err) {
    logger.error('revalidate_unreachable', {
      tags,
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
