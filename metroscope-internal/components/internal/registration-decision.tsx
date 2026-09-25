'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Info, MessageSquare, UserPlus, XCircle } from 'lucide-react';

import { DatePicker } from '@/components/ui/date-picker';
import { Field, RadioGroup, Select, Textarea } from '@/components/ui/field';
import type { LeadDetail } from '@/lib/api';
import { convertLead, recordConsultationOutcome, setLeadStatus } from '@/lib/leads-actions';
import { LOSS_REASON_LABEL } from '@/lib/leads-display';

/**
 * Decide what happens to a lead.
 *
 * Every control here maps to an endpoint that exists. The one obvious omission
 * is "jadikan siswa", conversion creates a User, a Student, an Enrolment and an
 * Invoice in one transaction and is doc 14 §1.4. A button that looked like it
 * converted and did not would be worse than its absence, so the panel says so
 * instead of pretending.
 */
type Step = 'triage' | 'outcome';

const TRIAGE = [
  {
    value: 'CONSULTING' as const,
    label: 'Mulai Konsultasi',
    description: 'Hubungi orang tua, catat hasilnya nanti',
  },
  {
    value: 'NURTURING' as const,
    label: 'Follow Up Nanti',
    description: 'Belum siap, masuk antrean follow up',
  },
  {
    value: 'REJECTED' as const,
    label: 'Tolak',
    description: 'Beri alasan singkat',
  },
];

const OUTCOMES = [
  {
    value: 'LANJUT' as const,
    label: 'Lanjut Daftar',
    description: 'Siap jadi siswa, tinggal dikonversi',
  },
  {
    value: 'PIKIR_DULU' as const,
    label: 'Pikir-pikir Dulu',
    description: 'Masuk antrean follow up',
  },
  {
    value: 'TIDAK_COCOK' as const,
    label: 'Tidak Cocok',
    description: 'Wajib pilih alasannya',
  },
];

export function RegistrationDecision({ lead }: { lead: LeadDetail }) {
  const router = useRouter();

  /**
   * A lead that has been through a consultation gets the outcome form; a fresh
   * one gets triage. Both exist on the same panel because they are the same
   * question asked at two moments, and splitting them across pages made staff
   * hunt for the second one.
   */
  const initialStep: Step =
    lead.status === 'CONSULTING' && lead.type === 'CONSULTATION' ? 'outcome' : 'triage';

  const [step] = useState<Step>(initialStep);
  const [triage, setTriage] = useState<'CONSULTING' | 'NURTURING' | 'REJECTED'>('CONSULTING');
  const [outcome, setOutcome] = useState<'LANJUT' | 'PIKIR_DULU' | 'TIDAK_COCOK'>('LANJUT');
  const [lossReason, setLossReason] = useState<'PRICE' | 'SCHEDULE' | 'FIT' | 'OTHER' | ''>('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [followUpAt, setFollowUpAt] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * One key per mounted form, not per click.
   *
   * The convert endpoint requires an Idempotency-Key, and a stable one is what
   * makes a double-click or a retry replay the first response instead of
   * creating a second student with a second invoice. Minting a fresh key on
   * each attempt would satisfy the header and defeat the guarantee.
   */
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const settled = ['CONVERTED', 'REJECTED', 'LOST'].includes(lead.status);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side checks exist to save a round trip, not to enforce anything,
    // the API refuses these regardless, and RLS refuses them again underneath.
    if (step === 'triage' && triage === 'REJECTED' && reason.trim().length < 5) {
      setError('Tulis alasan penolakan.');
      return;
    }
    if (step === 'triage' && triage === 'NURTURING' && !followUpAt) {
      setError('Tentukan kapan lead ini akan dihubungi lagi.');
      return;
    }
    if (step === 'outcome' && outcome === 'TIDAK_COCOK' && !lossReason) {
      setError('Pilih alasan kenapa tidak cocok.');
      return;
    }

    setSaving(true);

    let result;
    if (step === 'triage') {
      result = await setLeadStatus(
        lead.id,
        triage,
        triage === 'REJECTED' ? reason.trim() : undefined,
        triage === 'NURTURING' ? followUpAt : undefined,
      );
    } else {
      result = await recordConsultationOutcome(lead.id, outcome, {
        lossReason: lossReason || undefined,
        note: note.trim() || undefined,
        followUpAt,
      });

      /**
       * LANJUT means the family is in. Record the outcome, then convert.
       *
       * Two calls rather than one because they answer different questions and
       * both are worth keeping if the other fails: the outcome is a funnel fact
       * ("this consultation succeeded") that stays true even if conversion then
       * hits a missing programme price. The conversion itself is atomic on the
       * server. It is one transaction there, whatever happens here.
       */
      if (result.ok && outcome === 'LANJUT') {
        const converted = await convertLead(lead.id, idempotencyKey);
        if (!converted.ok) {
          setSaving(false);
          setError(converted.error ?? 'Hasil konsultasi tersimpan, tapi konversi gagal.');
          router.refresh();
          return;
        }
      }
    }
    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }
    router.push('/leads');
    router.refresh();
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
    >
      <h2 className="text-base font-semibold tracking-tight text-neutral-900">
        {step === 'outcome' ? 'Hasil Konsultasi' : 'Keputusan'}
      </h2>

      {settled ? (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center">
          <p className="text-sm text-neutral-500">Pendaftar ini sudah diproses.</p>
          {lead.rejectionReason && (
            <p className="mt-2 text-xs text-neutral-400">Alasan: {lead.rejectionReason}</p>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {step === 'triage' ? (
            <>
              <RadioGroup
                options={TRIAGE}
                value={triage}
                onChange={(v) => {
                  setTriage(v);
                  setError(null);
                }}
                label="Keputusan pendaftaran"
                columns={1}
              />

              {/*
                "Follow up later" has to say when.
                Without a date this decision moved the lead out of the new pile
                and told nobody to come back to it, the lead simply stopped
                being anybody's problem. /inbox surfaced that immediately: a
                lead parked this way reappeared as "follow-up overdue" the same
                second, because a follow-up with no date IS overdue.
              */}
              {triage === 'NURTURING' && (
                <div className="fx-rise rounded-xl border border-sky-200/70 bg-sky-50/50 p-4">
                  <Field
                    label="Follow Up Berikutnya"
                    hint="Kapan sebaiknya dihubungi lagi?"
                    required
                    error={error ?? undefined}
                  >
                    <DatePicker
                      value={followUpAt}
                      onChange={(d) => {
                        setFollowUpAt(d);
                        setError(null); // the complaint is answered; stop making it
                      }}
                      minDate={new Date()}
                      placeholder="Pilih tanggal"
                    />
                  </Field>
                </div>
              )}

              {triage === 'REJECTED' && (
                <div className="fx-rise border-maroon/20 bg-maroon-light/40 rounded-xl border p-4">
                  <Field label="Alasan Penolakan" required error={error ?? undefined}>
                    <Textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Mis. program yang diminta belum tersedia untuk jenjang ini…"
                      invalid={!!error}
                    />
                  </Field>
                </div>
              )}
            </>
          ) : (
            <>
              <RadioGroup
                options={OUTCOMES}
                value={outcome}
                onChange={(v) => {
                  setOutcome(v);
                  setError(null);
                }}
                label="Hasil konsultasi"
                columns={1}
              />

              {outcome === 'TIDAK_COCOK' && (
                <div className="fx-rise border-maroon/20 bg-maroon-light/40 rounded-xl border p-4">
                  {/*
                    A closed list, not free text. doc 13 §22 found "we lost them
                    and nobody knows why" to be the biggest hole in the funnel, 
                    prose does not aggregate into an answer.
                  */}
                  <Field label="Alasan Tidak Lanjut" required error={error ?? undefined}>
                    <Select
                      value={lossReason}
                      onChange={(e) => setLossReason(e.target.value as typeof lossReason)}
                    >
                      <option value="">Pilih alasan</option>
                      {Object.entries(LOSS_REASON_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}

              {outcome === 'PIKIR_DULU' && (
                <div className="fx-rise rounded-xl border border-sky-200/70 bg-sky-50/50 p-4">
                  <Field label="Follow Up Berikutnya" hint="Kapan sebaiknya dihubungi lagi?">
                    <DatePicker
                      value={followUpAt}
                      onChange={setFollowUpAt}
                      minDate={new Date()}
                      placeholder="Pilih tanggal"
                    />
                  </Field>
                </div>
              )}

              <Field label="Catatan" hint="Opsional, konteks untuk yang menindaklanjuti.">
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Mis. orang tua tertarik tapi ingin diskusi dengan pasangan…"
                />
              </Field>

              {outcome === 'LANJUT' && (
                <div className="fx-rise space-y-3 rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4">
                  <ul className="space-y-1.5 text-xs text-neutral-600">
                    <li className="flex items-start gap-1.5">
                      <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      Akun orang tua dibuat (status <strong>belum aktif</strong>)
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      Tagihan pendaftaran diterbitkan, jatuh tempo 7 hari
                    </li>
                    <li className="flex items-start gap-1.5">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      Email berisi tautan buat kata sandi + tagihan dikirim otomatis
                    </li>
                  </ul>
                  <p className="text-xs text-neutral-500">
                    Semua dibuat dalam satu transaksi, kalau ada yang gagal, tidak ada yang
                    tersimpan.
                  </p>
                </div>
              )}
            </>
          )}

          {/*
            Only when no Field is already showing it. REJECTED and NURTURING
            each render `error` on their own input, and repeating it underneath
            reads as two different problems.
          */}
          {error && step === 'triage' && triage !== 'REJECTED' && triage !== 'NURTURING' && (
            <p className="text-maroon text-xs">{error}</p>
          )}
          {error && step === 'outcome' && outcome !== 'TIDAK_COCOK' && (
            <p className="text-maroon text-xs">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="bg-navy shadow-navy/20 hover:bg-navy-dark flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
          >
            {(step === 'triage' && triage === 'REJECTED') ||
            (step === 'outcome' && outcome === 'TIDAK_COCOK') ? (
              <XCircle className="h-4 w-4" />
            ) : step === 'outcome' ? (
              <MessageSquare className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {saving ? 'Menyimpan…' : 'Simpan Keputusan'}
          </button>
        </div>
      )}
    </form>
  );
}
