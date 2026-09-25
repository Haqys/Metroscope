import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { RegistrationDecision } from '@/components/internal/registration-decision';
import { PageHeader } from '@/components/portal/page-header';
import { cn } from '@/lib/utils';
import { ApiError, getLead } from '@/lib/api';
import {
  LEAD_STATUS_BADGE,
  LEAD_STATUS_LABEL,
  LEAD_TYPE_LABEL,
  LOSS_REASON_LABEL,
  OUTCOME_LABEL,
  timeAgo,
} from '@/lib/leads-display';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const lead = await getLead(id);
    return { title: `Pendaftar: ${lead.childName}` };
  } catch {
    return { title: 'Pendaftar' };
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.15em] text-neutral-400 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-neutral-800">{value}</dd>
    </div>
  );
}

/** Internal, review one lead and decide (doc 11 §5). */
export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;

  const lead = await getLead(id).catch((err: unknown) => {
    /**
     * 404 and 403 both land here as "not found", deliberately. RLS returns no
     * row to a caller without the /leads grant, and distinguishing the two would
     * confirm that a lead with this id exists.
     */
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  });

  const attribution = [lead.source, lead.medium, lead.campaign].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/leads"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Pendaftar
      </Link>

      <PageHeader
        className="mt-4"
        title={`Pendaftar: ${lead.childName}`}
        subtitle={`${lead.programName ?? 'Program belum dipilih'} · masuk ${timeAgo(lead.createdAt)}`}
        badge={
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              LEAD_STATUS_BADGE[lead.status],
            )}
          >
            {LEAD_STATUS_LABEL[lead.status]}
          </span>
        }
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {/* Submitted data */}
          <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900">
              Data dari Form Pendaftaran
            </h2>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Nama Anak" value={lead.childName} />
              <Field
                label="Sekolah"
                value={[lead.school, lead.level].filter(Boolean).join(' · ') || '-'}
              />
              <Field label="Orang Tua" value={lead.parentName ?? '-'} />
              <Field label="Telepon Ortu" value={lead.parentPhone} />
              <Field label="Email Ortu" value={lead.parentEmail ?? '-'} />
              <Field label="Program Diminta" value={lead.programName ?? '-'} />
              <Field label="Jalur" value={LEAD_TYPE_LABEL[lead.type]} />
              {/* Attribution is the whole reason marketing spend is measurable
                  at all (FR-LEAD-2), surface it rather than burying it. */}
              <Field label="Sumber" value={attribution || lead.source} />
            </dl>

            {lead.landingPage && (
              <p className="mt-4 text-xs text-neutral-400">
                Mendaftar dari <span className="font-mono">{lead.landingPage}</span>
              </p>
            )}
          </div>

          {/* Outcome, once a consultation has been closed */}
          {lead.consultationOutcome && (
            <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
              <h2 className="text-base font-semibold tracking-tight text-neutral-900">
                Hasil Konsultasi
              </h2>
              <p className="mt-2 text-sm text-neutral-700">
                {OUTCOME_LABEL[lead.consultationOutcome]}
                {lead.lossReason && `, ${LOSS_REASON_LABEL[lead.lossReason]}`}
              </p>
              {lead.followUpNote && (
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{lead.followUpNote}</p>
              )}
            </div>
          )}

          {/* Contact history */}
          <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900">
              Riwayat Kontak
            </h2>
            {lead.contacts.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400">
                Belum ada kontak yang tercatat.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {lead.contacts.map((c) => (
                  <li
                    key={c.id}
                    className="border-navy/30 rounded-xl border-l-2 bg-neutral-50/70 px-4 py-3"
                  >
                    <p className="text-sm leading-relaxed text-neutral-700">{c.note}</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {c.actorName ?? 'Sistem'} · {timeAgo(c.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-5">
          <RegistrationDecision lead={lead} />
        </div>
      </div>
    </div>
  );
}
