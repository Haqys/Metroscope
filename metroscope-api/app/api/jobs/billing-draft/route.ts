import { NextResponse } from 'next/server';
import { job } from '@/lib/jobs/verify';
import { draftBillingRun } from '@/modules/billing/billing-run.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Draft next month's invoices (cron, 25th WITA, vercel.json).
 *
 * Drafts only. Nothing reaches a family until Finance reviews the run and
 * issues it: a month of wrong invoices sent automatically is not something you
 * can apologise your way out of.
 *
 * Idempotent on the period, so a double fire returns the existing run.
 */
async function run() {
  const result = await draftBillingRun();
  return NextResponse.json({ data: result });
}

export const GET = job(run);
export const POST = job(run);
