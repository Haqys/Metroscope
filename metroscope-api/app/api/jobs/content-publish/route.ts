import { NextResponse } from 'next/server';
import { job } from '@/lib/jobs/verify';
import { publishScheduled } from '@/modules/content/scheduled-publish.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Publish anything whose scheduled time has passed (doc 13 §9.5).
 *
 * This cron path existed in vercel.json for weeks pointing at nothing. It was
 * removed in Task 0.6 along with two others, and returns now that there is
 * something behind it. The route guard fails CI if that stops being true.
 */
async function run() {
  return NextResponse.json({ data: await publishScheduled() });
}

export const GET = job(run);
export const POST = job(run);
