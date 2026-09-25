import { z } from 'zod';
import { handler, ok } from '@/lib/http/handler';
import { CreateSeriesBody } from '@/modules/scheduling/scheduling.schema';
import { createSeries, listSeries } from '@/modules/scheduling/scheduling.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({ studentId: z.string().uuid().optional() });

export const GET = handler(
  {
    auth: 'required',
    query: Query,
    rateLimit: { key: 'sessions.list', limit: 240, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listSeries(ctx, query.studentId)),
);

/**
 * A weekly rule, materialised into sessions on creation.
 *
 * The response reports `created` AND `skipped`: a term of Wednesdays where one
 * Wednesday is already booked produces eleven lessons and a number, rather than
 * failing whole and leaving the family with no timetable at all.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'session.manage',
    body: CreateSeriesBody,
    audit: 'session.series.create',
    rateLimit: { key: 'sessions.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createSeries(ctx, body), { status: 201 }),
);
