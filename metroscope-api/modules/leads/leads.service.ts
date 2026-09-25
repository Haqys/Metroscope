import type { RequestContext } from '@/lib/auth/context';
import { ApiError } from '@/lib/http/errors';
import { enqueue } from '@/lib/queue';
import { writeAuditLog } from '@/lib/audit';
import * as repo from './leads.repo';
import type {
  AddContactInput,
  ConsultationOutcomeInput,
  CreateLeadInput,
  ListLeadsQueryInput,
  UpdateLeadStatusInput,
} from './leads.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BUSINESS LOGIC LIVES HERE, and only here.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Framework-free by construction: no next/server import (lint-enforced), no
 * Request, no Response. That makes it unit-testable without HTTP and portable
 * if this domain is ever extracted into its own service (doc 04 §12.2).
 *
 * A frontend must never reimplement any rule below. If the UI needs one, it is
 * exposed through the API, never copied. Duplicated rules drift, and drifted
 * rules about money and minors are the expensive kind.
 */

export async function listLeads(ctx: RequestContext, query: ListLeadsQueryInput) {
  const items = await repo.findLeads(ctx, query);
  return {
    items,
    // Null when the page came back short. There is nothing after it.
    nextCursor: items.length === query.limit ? (items.at(-1)?.id ?? null) : null,
  };
}

export async function leadCounts(ctx: RequestContext) {
  return repo.countByStatus(ctx);
}

/** One lead with its contact history, what `/leads/:id` renders. */
export async function getLead(ctx: RequestContext, id: string) {
  const lead = await repo.findLeadById(ctx, id);
  // RLS returning no row and the row not existing are indistinguishable here,
  // and should stay that way: a 403 would confirm the lead exists.
  if (!lead) throw new ApiError(404, 'NOT_FOUND', 'Pendaftar tidak ditemukan.');

  const contacts = await repo.findContacts(ctx, id);
  return { ...lead, contacts };
}

/**
 * Log a contact attempt.
 *
 * Append-only by design (the RLS policy has no UPDATE or DELETE): the contact
 * log is what the follow-up queue reads and what any later dispute relies on,
 * and a log you can rewrite is not evidence of anything.
 */
export async function addContact(ctx: RequestContext, id: string, input: AddContactInput) {
  const lead = await repo.findLeadById(ctx, id);
  if (!lead) throw new ApiError(404, 'NOT_FOUND', 'Pendaftar tidak ditemukan.');

  await repo.appendNote(ctx, id, input.note);

  const touched = await repo.setFollowUp(ctx, id, input.followUpAt ?? null);
  // Zero rows means RLS refused the UPDATE even though the SELECT above
  // succeeded, the caller can see the lead but not work it. Reporting 201 here
  // would tell them the follow-up was scheduled when it was not.
  if (touched === 0) {
    throw new ApiError(403, 'FORBIDDEN', 'Kamu tidak berwenang mengubah pendaftar ini.');
  }

  await writeAuditLog({
    ctx,
    action: 'lead.contacted',
    entity: 'registration',
    entityId: id,
    meta: { followUpAt: input.followUpAt ?? null },
  });

  return { id, ok: true };
}

/**
 * Move a lead through the pipeline.
 *
 * REJECTED and LOST require a reason (enforced in the schema) because doc 13 §22
 * identified "we lost them, nobody knows why" as the single biggest hole in the
 * funnel. The reason is stored on the row, not just in the audit log, so it can
 * be aggregated.
 */
export async function updateStatus(ctx: RequestContext, id: string, input: UpdateLeadStatusInput) {
  const before = await repo.findLeadById(ctx, id);
  if (!before) throw new ApiError(404, 'NOT_FOUND', 'Pendaftar tidak ditemukan.');

  if (before.convertedStudentId) {
    throw new ApiError(
      409,
      'LEAD_ALREADY_CONVERTED',
      'Pendaftar ini sudah dikonversi menjadi siswa dan tidak bisa diubah lagi.',
    );
  }

  const updated = await repo.updateStatus(
    ctx,
    id,
    input.status,
    input.reason ?? null,
    input.followUpAt ?? null,
  );
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Pendaftar tidak ditemukan.');

  if (input.reason) {
    await repo.appendNote(ctx, id, `Status → ${input.status}: ${input.reason}`);
  }

  await writeAuditLog({
    ctx,
    action: `lead.${input.status.toLowerCase()}`,
    entity: 'registration',
    entityId: id,
    before: { status: before.status },
    after: { status: updated.status },
    meta: { reason: input.reason ?? null, followUpAt: input.followUpAt ?? null },
  });

  return updated;
}

/**
 * The status a consultation outcome implies.
 *
 * Derived, never client-supplied, otherwise "TIDAK_COCOK with status
 * CONSULTING" is expressible, and a pipeline that can hold contradictions stops
 * being worth reporting on.
 */
const STATUS_FOR_OUTCOME: Record<ConsultationOutcomeInput['outcome'], string> = {
  LANJUT: 'CONSULTING', // ready to convert; 1.4 moves it to CONVERTED
  PIKIR_DULU: 'NURTURING',
  TIDAK_COCOK: 'LOST',
};

export async function recordConsultationOutcome(
  ctx: RequestContext,
  id: string,
  input: ConsultationOutcomeInput,
) {
  const before = await repo.findLeadById(ctx, id);
  if (!before) throw new ApiError(404, 'NOT_FOUND', 'Pendaftar tidak ditemukan.');

  if (before.convertedStudentId) {
    throw new ApiError(
      409,
      'LEAD_ALREADY_CONVERTED',
      'Pendaftar ini sudah dikonversi menjadi siswa.',
    );
  }
  if (before.type !== 'CONSULTATION') {
    throw new ApiError(
      422,
      'NOT_A_CONSULTATION',
      'Pendaftar ini mendaftar langsung, jadi tidak punya hasil konsultasi.',
    );
  }

  const status = STATUS_FOR_OUTCOME[input.outcome];
  const updated = await repo.recordConsultationOutcome(
    ctx,
    id,
    input.outcome,
    status,
    input.lossReason ?? null,
    input.note ?? null,
    input.followUpAt ?? null,
  );
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Pendaftar tidak ditemukan.');

  await repo.appendNote(
    ctx,
    id,
    `Hasil konsultasi: ${input.outcome}${input.lossReason ? ` (${input.lossReason})` : ''}` +
      (input.note ? `, ${input.note}` : ''),
  );

  await writeAuditLog({
    ctx,
    action: 'lead.consultation-outcome',
    entity: 'registration',
    entityId: id,
    before: { status: before.status, consultationOutcome: before.consultationOutcome },
    after: { status: updated.status, consultationOutcome: input.outcome },
    meta: { lossReason: input.lossReason ?? null },
  });

  return updated;
}

/**
 * Public registration submit, the top of the funnel.
 *
 * Rules that must not be duplicated in the landing site:
 *   1. honeypot rejection
 *   2. de-duplication by phone/email (a parent submitting twice used to create
 *      two leads, which corrupted every funnel metric downstream)
 *   3. autoresponder dispatch
 *   4. SLA clock start (the "1x24 jam" promise is only real if it is measured)
 */
export async function submitLead(ctx: RequestContext, input: CreateLeadInput) {
  if (input.website) {
    // Deliberately vague: never tell a bot which check it failed.
    throw new ApiError(400, 'SUBMISSION_REJECTED', 'Pengiriman ditolak.');
  }

  const duplicate = await repo.findDuplicate(ctx, input.parentPhone, input.parentEmail);
  if (duplicate) {
    await repo.appendNote(ctx, duplicate.id, 'Mendaftar ulang lewat formulir publik.');
    await writeAuditLog({
      ctx,
      action: 'lead.deduplicated',
      entity: 'registration',
      entityId: duplicate.id,
      meta: { source: input.source },
    });
    return { id: duplicate.id, deduplicated: true };
  }

  const lead = await repo.insertLead(ctx, input);

  // Outbox first, then dispatch: the intent survives a crash between the write
  // and the send, and consumers dedupe on delivery (doc 04 section 7.2).
  // Email only. WhatsApp was removed from the product on 2026-07-29 (doc 08 §4).
  await enqueue('notification.lead-received', {
    registrationId: lead.id,
    channels: ['EMAIL'],
  });

  await writeAuditLog({
    ctx,
    action: 'lead.created',
    entity: 'registration',
    entityId: lead.id,
    meta: { source: input.source, medium: input.medium, campaign: input.campaign },
  });

  return { id: lead.id, deduplicated: false };
}
