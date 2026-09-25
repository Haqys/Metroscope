import { NextResponse } from 'next/server';
import { job } from '@/lib/jobs/verify';
import { sendDueReminders } from '@/modules/billing/billing-run.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daily: the H-3 / H / H+1 / H+7 reminders (doc 14 §1.6).
 *
 * At most one message per invoice per run, and only for a stage further along
 * than the last one sent, so a cron catching up after an outage sends the
 * newest relevant reminder rather than four at once.
 */
async function run() {
  const result = await sendDueReminders();
  return NextResponse.json({ data: result });
}

export const GET = job(run);
export const POST = job(run);
