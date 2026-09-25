import { sql } from 'drizzle-orm';
import { withElevatedPrivileges } from '@/lib/db/rls';
import { logger } from '@/lib/logger';
import { revalidate } from '@/lib/content/revalidate';
import type { RequestContext } from '@/lib/auth/context';
import { allTypes, identifier, publishTags } from './content.registry';

/**
 * Publish everything whose scheduled time has arrived (doc 13 §9.5).
 *
 * Runs as a cron with no caller, so it uses the enumerated privileged path,
 * there is no user whose RLS could gate it, and `content.publish` is a grant
 * held by people, not by the clock.
 *
 * The claim is a single `UPDATE … RETURNING` rather than select-then-update:
 * two overlapping ticks cannot both take the same row, so a scheduled page
 * cannot be published twice, versioned twice, or announced twice.
 */
const JOB_CTX: RequestContext = {
  requestId: 'job',
  ip: 'cron',
  userAgent: 'cron',
  user: null,
  roles: [],
  roleDetails: [],
  actions: [],
  pages: [],
  primaryRole: null,
  claims: null,
};

export interface ScheduledPublishResult {
  published: { type: string; id: string; slug: string | null }[];
}

export async function publishScheduled(): Promise<ScheduledPublishResult> {
  const published: ScheduledPublishResult['published'] = [];

  for (const type of allTypes()) {
    /**
     * Claim, snapshot and publish in one transaction per type.
     *
     * The snapshot is taken from the row as it stands at claim time, exactly
     * as the interactive path does, so a scheduled publish and a manual one
     * leave identical history.
     */
    const claimed = await withElevatedPrivileges(
      JOB_CTX,
      'job.content-publish',
      `publish scheduled ${type.key}`,
      async (tx) => {
        const rows = await tx.execute<{ id: string; version: number; slug: string | null }>(sql`
          UPDATE ${identifier(type.table)}
          SET status       = 'PUBLISHED'::content_status,
              version      = version + 1,
              published_at = now(),
              publish_at   = NULL
          WHERE status = 'SCHEDULED' AND publish_at <= now()
          RETURNING id, version
                 ${type.slugColumn ? sql`, ${identifier(type.slugColumn)} AS slug` : sql`, NULL AS slug`}
        `);

        const claimedRows = Array.from(rows) as {
          id: string;
          version: number;
          slug: string | null;
        }[];

        for (const row of claimedRows) {
          const cols = type.snapshotColumns.map((c) => sql`${sql.raw(`'${c}'`)}, ${identifier(c)}`);
          const snap = await tx.execute<{ snapshot: Record<string, unknown> }>(sql`
            SELECT jsonb_build_object(${sql.join(cols, sql`, `)}) AS snapshot
            FROM ${identifier(type.table)} WHERE id = ${row.id}
          `);
          const snapshot =
            (Array.from(snap) as { snapshot: Record<string, unknown> }[]).at(0)?.snapshot ?? {};

          await tx.execute(sql`
            INSERT INTO content_versions (entity_type, entity_id, version, snapshot, author_id, note)
            VALUES (${type.key}, ${row.id}, ${row.version}, ${JSON.stringify(snapshot)}::jsonb,
                    NULL, 'Terbit otomatis sesuai jadwal')
          `);

          await tx.execute(sql`
            INSERT INTO audit_log (actor_id, action, entity, entity_id, after, meta)
            VALUES (NULL, 'content.publish', ${type.key}, ${row.id},
                    ${JSON.stringify({ status: 'PUBLISHED', version: row.version })}::jsonb,
                    ${JSON.stringify({ scheduled: true })}::jsonb)
          `);
        }

        return claimedRows;
      },
    );

    // After commit, see lib/content/revalidate.ts for why this is best effort.
    for (const row of claimed) {
      published.push({ type: type.key, id: row.id, slug: row.slug });
      await revalidate(publishTags(type, { slug: row.slug }), 'job');
    }
  }

  if (published.length > 0) logger.info('scheduled_published', { count: published.length });
  return { published };
}
