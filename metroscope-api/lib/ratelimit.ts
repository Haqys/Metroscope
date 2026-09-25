import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Sliding-window limits, keyed per endpoint class (doc 04 §5.4).
 *
 * Fails OPEN on a Redis outage: a rate limiter that takes the product down is
 * a worse failure than a brief absence of limiting. The outage is logged.
 */
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

const limiters = new Map<string, Ratelimit>();

function limiter(key: string, limit: number, window: `${number} ${'s' | 'm' | 'h'}`) {
  const id = `${key}:${limit}:${window}`;
  let existing = limiters.get(id);
  if (!existing) {
    existing = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `rl:${key}`,
      analytics: false,
    });
    limiters.set(id, existing);
  }
  return existing;
}

export async function checkRateLimit(
  key: string,
  identifier: string,
  limit: number,
  window: `${number} ${'s' | 'm' | 'h'}`,
): Promise<{ success: boolean; retryAfter?: number }> {
  try {
    const res = await limiter(key, limit, window).limit(identifier);
    return {
      success: res.success,
      retryAfter: res.success ? undefined : Math.ceil((res.reset - Date.now()) / 1000),
    };
  } catch (err) {
    logger.error('ratelimit_unavailable', {
      key,
      message: err instanceof Error ? err.message : String(err),
    });
    return { success: true };
  }
}
