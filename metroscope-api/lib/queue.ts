import { Client } from '@upstash/qstash';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

/**
 * Transactional outbox, then QStash.
 *
 * The intent is written to Postgres first so it survives a crash between the
 * state change and the dispatch. QStash delivers at-least-once, so consumers
 * dedupe on the outbox id (doc 04 section 7.2).
 */
const qstash = new Client({ token: process.env.QSTASH_TOKEN ?? '' });

export async function enqueue(topic: string, payload: Record<string, unknown>): Promise<void> {
  const rows = await db.execute<{ id: string }>(sql`
    INSERT INTO outbox_message (topic, payload)
    VALUES (${topic}, ${JSON.stringify(payload)}::jsonb)
    RETURNING id
  `);
  const outboxId = (Array.from(rows) as { id: string }[]).at(0)?.id;

  try {
    await qstash.publishJSON({
      url: `${process.env.API_PUBLIC_URL}/api/jobs/dispatch`,
      body: { outboxId, topic, payload },
      retries: 3,
    });
  } catch (err) {
    // Row stays PENDING; the outbox-dispatch cron retries it. Never lose the intent.
    logger.warn('enqueue_deferred_to_outbox', {
      topic,
      outboxId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
