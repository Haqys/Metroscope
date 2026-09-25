'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Field, RadioGroup, Textarea } from '@/components/ui/field';

const DECISIONS = [
  {
    value: 'APPROVE' as const,
    label: 'Setujui & Tayangkan',
    description: 'Konten langsung publik',
  },
  { value: 'REVISE' as const, label: 'Minta Revisi', description: 'Dikembalikan ke Editor' },
];

/**
 * Approve / request-revision panel (wireframe: Input Form 6/7).
 * TODO: wire to `PATCH /content/:id` (content module).
 */
// contentId is the record this decision applies to; used once POST /v1/articles/:id/decision lands (doc 14 Phase 2).
export function ApprovalDecision({ contentId: _contentId }: { contentId: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState<'APPROVE' | 'REVISE'>('APPROVE');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (decision === 'REVISE' && note.trim().length < 5) {
      setError('Tulis catatan revisi untuk Editor');
      return;
    }
    setError(null);
    setSaving(true);
    // TODO: await api.patch(`/content/${contentId}`, { decision, note })
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    router.push('/content-approval');
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
    >
      <h2 className="text-base font-semibold tracking-tight text-neutral-900">
        Keputusan Approval
      </h2>

      <div className="mt-5 space-y-5">
        <RadioGroup
          options={DECISIONS}
          value={decision}
          onChange={(v) => {
            setDecision(v);
            setError(null);
          }}
          label="Keputusan approval"
          columns={1}
        />

        <Field
          label="Catatan untuk Editor"
          hint={decision === 'REVISE' ? 'wajib' : 'opsional'}
          error={error ?? undefined}
        >
          <Textarea
            rows={5}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tulis catatan revisi di sini…"
            invalid={!!error}
          />
        </Field>

        <button
          type="submit"
          disabled={saving}
          className="bg-navy shadow-navy/20 hover:bg-navy-dark w-full rounded-full py-3 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
        >
          {saving ? 'Mengirim…' : 'Kirim Keputusan'}
        </button>
      </div>
    </form>
  );
}
