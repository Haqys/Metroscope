import { NextResponse } from 'next/server';
import { job } from '@/lib/jobs/verify';
import { drainOne } from '@/lib/notifications/dispatch';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The safety net. Cron calls this every two minutes (vercel.json); it drains
 * whatever QStash did not.
 *
 * Two paths reach the outbox and neither is sufficient alone. QStash is the fast
 * one, but `enqueue()` deliberately swallows a publish failure so a queue outage
 * never rolls back the business action that caused it. Those messages sit
 * PENDING and only this sweeper will ever pick them up. It also recovers
 * messages whose worker died mid-send, via the stale-lock rule in claimNext().
 *
 * Bounded per invocation, not "until empty": an unbounded loop over a backlog
 * times out halfway, and the work it did is indistinguishable from the work it
 * did not (doc 04 constraint 5). Cron runs again in two minutes.
 */
const MAX_PER_RUN = 10;
const TIME_BUDGET_MS = 20_000;

async function sweep() {
  const started = Date.now();
  let processed = 0;

  while (processed < MAX_PER_RUN) {
    // Stop with headroom rather than being killed mid-send holding a lock.
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const didWork = await drainOne();
    if (!didWork) break;
    processed++;
  }

  logger.info('job_outbox_sweep', { processed, durationMs: Date.now() - started });
  return NextResponse.json({ data: { processed } });
}

/** Cron sends GET; QStash sends POST. Same work either way. */
export const GET = job(sweep);
export const POST = job(sweep);
