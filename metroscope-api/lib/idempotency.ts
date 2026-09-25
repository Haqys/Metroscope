import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';

/**
 * Idempotency for money-moving and message-sending endpoints.
 *
 * QStash delivers at-least-once and clients retry, so without this a retried
 * request charges a parent twice or sends the same invoice twice (doc 04 §7.2).
 *
 * The stored response is replayed verbatim on a repeat key.
 */
export async function withIdempotency(
  key: string | null,
  scope: string,
  ctx: RequestContext,
  fn: () => Promise<Response>,
): Promise<Response> {
  if (!key) {
    throw new ApiError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Header Idempotency-Key wajib untuk operasi ini.',
    );
  }

  const existing = await db.execute<{ response: unknown; status: number }>(sql`
    SELECT response, status FROM idempotency_key
    WHERE key = ${key} AND scope = ${scope}
    LIMIT 1
  `);

  const hit = existing.at(0);
  if (hit) {
    return new Response(JSON.stringify(hit.response), {
      status: hit.status,
      headers: { 'content-type': 'application/json', 'idempotent-replay': 'true' },
    });
  }

  const res = await fn();
  const cloned = res.clone();
  const payload = await cloned.json().catch(() => null);

  await db.execute(sql`
    INSERT INTO idempotency_key (key, scope, actor_id, status, response, created_at)
    VALUES (${key}, ${scope}, ${ctx.user?.id ?? null}, ${res.status},
            ${JSON.stringify(payload)}::jsonb, now())
    ON CONFLICT (key, scope) DO NOTHING
  `);

  return res;
}
