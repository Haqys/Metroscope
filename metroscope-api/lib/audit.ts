import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import type { RequestContext } from '@/lib/auth/context';

/**
 * Audit log for every financial, destructive, and authorisation-relevant
 * action (doc 08 §5).
 *
 * before/after are what make it an audit log rather than an activity feed,
 * "who changed what, from what, to what".
 *
 * Never throws: an audit failure must not roll back the business action, but it
 * must be loud.
 */
export async function writeAuditLog(input: {
  ctx: RequestContext;
  action: string;
  entity: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO audit_log
        (actor_id, action, entity, entity_id, before, after, meta, ip, user_agent, request_id)
      VALUES (
        ${input.ctx.user?.id ?? null},
        ${input.action},
        ${input.entity},
        ${input.entityId},
        ${input.before === undefined ? null : JSON.stringify(input.before)}::jsonb,
        ${input.after === undefined ? null : JSON.stringify(input.after)}::jsonb,
        ${input.meta === undefined ? null : JSON.stringify(input.meta)}::jsonb,
        ${input.ctx.ip},
        ${input.ctx.userAgent},
        ${input.ctx.requestId}
      )
    `);
  } catch (err) {
    logger.error('audit_write_failed', {
      action: input.action,
      entity: input.entity,
      requestId: input.ctx.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
