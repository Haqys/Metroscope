import { NextResponse } from 'next/server';
import { job } from '@/lib/jobs/verify';
import { verifyBackup } from '@/modules/ops/backup-verify.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Weekly: check that what a restore would have to contain is actually there
 * (doc 08 §3, doc 14 Task 0.6).
 *
 * Returns 503 when a check fails, so an uptime monitor pointed at this URL
 * alerts on its own, the job does not depend on somebody reading logs.
 */
async function run() {
  const result = await verifyBackup();
  return NextResponse.json({ data: result }, { status: result.ok ? 200 : 503 });
}

export const GET = job(run);
export const POST = job(run);
