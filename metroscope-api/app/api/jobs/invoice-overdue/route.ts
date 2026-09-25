import { NextResponse } from 'next/server';
import { job } from '@/lib/jobs/verify';
import { sweepOverdue } from '@/modules/billing/billing-run.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Nightly: mark past-due invoices OVERDUE and recompute the denda (FR-PAY-4/6).
 *
 * The fee is written to the row rather than derived at render time, so the
 * parent's total and the total Finance checks against are the same number by
 * construction, not by two places agreeing to compute it the same way.
 */
async function run() {
  const result = await sweepOverdue();
  return NextResponse.json({ data: result });
}

export const GET = job(run);
export const POST = job(run);
