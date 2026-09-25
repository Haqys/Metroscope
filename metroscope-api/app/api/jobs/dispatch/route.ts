import { NextResponse } from 'next/server';
import { job } from '@/lib/jobs/verify';
import { drainOne } from '@/lib/notifications/dispatch';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * QStash's delivery target, `lib/queue.ts` publishes here on every enqueue.
 *
 * Handles exactly ONE message, the one QStash names. That keeps the invocation
 * short and predictable, which is what makes at-least-once delivery cheap: a
 * duplicate delivery costs one no-op, not a re-drain of the backlog.
 */
export const POST = job(async (_req, rawBody) => {
  let outboxId: string | undefined;
  try {
    outboxId = (JSON.parse(rawBody) as { outboxId?: string }).outboxId;
  } catch {
    // No body, or not ours. Fall through and take whatever is due.
  }

  const processed = await drainOne(outboxId);

  logger.info('job_dispatch', { outboxId: outboxId ?? null, processed });
  return NextResponse.json({ data: { processed } });
});
